/**
 * Studio service layer.
 *
 * All pipeline logic lives here so route handlers stay thin: parse, authorise,
 * delegate, respond. Every function that spends money charges credits before
 * doing the work and refunds on failure.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { chargeCredits, refundCredits } from "@/lib/credits";
import {
  getDb,
  projects,
  renders,
  scenes,
  scripts,
  voiceovers,
  type Project,
  type Scene,
} from "@/lib/db";
import { ApiFailure } from "@/lib/http/respond";
import { newId } from "@/lib/ids";
import { imageProvider } from "@/lib/providers/image";
import { llm } from "@/lib/providers/llm";
import { hash32 } from "@/lib/providers/llm/text";
import { keys, storage } from "@/lib/providers/storage";
import { tts } from "@/lib/providers/tts";
import { estimateDurationMs } from "@/lib/providers/tts/prosody";
import { groupIntoCues } from "@/lib/render/ass";
import { captionPresetById } from "@/lib/studio/captions";
import { musicBedById } from "@/lib/studio/music";
import { CREDIT_COSTS } from "@/lib/studio/pricing";
import { styleById } from "@/lib/studio/styles";
import type { AspectRatio, RenderJobSpec, RenderScene, ScriptDraft } from "@/lib/studio/types";
import { voiceById } from "@/lib/studio/voices";
import { DIMENSIONS, companionRatio } from "./dimensions";
import { retimeScenes } from "./timing";

/** Loads a project and enforces ownership in one step. */
export async function ownedProject(projectId: string, userId: string): Promise<Project> {
  const db = await getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!project) throw new ApiFailure(404, "not_found", "Project not found.");
  return project;
}

export async function latestScript(projectId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(scripts)
    .where(eq(scripts.projectId, projectId))
    .orderBy(desc(scripts.version))
    .limit(1);
  return row ?? null;
}

export async function projectScenes(projectId: string): Promise<Scene[]> {
  const db = await getDb();
  return db.select().from(scenes).where(eq(scenes.projectId, projectId)).orderBy(asc(scenes.idx));
}

export async function latestVoiceover(projectId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(voiceovers)
    .where(eq(voiceovers.projectId, projectId))
    .orderBy(desc(voiceovers.createdAt))
    .limit(1);
  return row ?? null;
}

const touch = async (projectId: string, patch: Partial<typeof projects.$inferInsert> = {}) => {
  const db = await getDb();
  await db
    .update(projects)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
};

/* ─────────────────────────── Script ─────────────────────────── */

/**
 * Generate (or re-generate) the script and rebuild the scene list from it.
 *
 * Scenes are replaced wholesale because their narration is derived from the
 * script — keeping stale scenes around would silently desynchronise the
 * timeline from the words actually being spoken.
 */
export async function generateScript(project: Project, userId: string) {
  const engine = await llm();
  const voice = voiceById(project.voiceId);
  const style = styleById(project.styleId);

  await chargeCredits({
    userId,
    credits: CREDIT_COSTS.scriptGenerate,
    operation: "script.generate",
    referenceId: project.id,
    note: `Script for "${project.title}"`,
  });

  let draft: ScriptDraft;
  try {
    draft = await engine.generateScript({
      input: project.sourceText,
      sourceType: project.sourceType === "script" ? "script" : "prompt",
      styleId: project.styleId,
      targetSeconds: project.targetSeconds,
      wpm: voice.wpm,
    });
  } catch (err) {
    await refundCredits({
      userId,
      credits: CREDIT_COSTS.scriptGenerate,
      referenceId: project.id,
      note: "Script generation failed",
    });
    throw err;
  }

  // The prosody model is the same one the synthesiser uses, so this estimate
  // matches the finished runtime rather than approximating it.
  const estimatedMs = estimateDurationMs(
    `${draft.body}\n${draft.callToAction}`,
    voice.wpm,
  );

  const db = await getDb();
  const previous = await latestScript(project.id);
  const version = (previous?.version ?? 0) + 1;
  const scriptId = newId("scr");

  await db.insert(scripts).values({
    id: scriptId,
    projectId: project.id,
    version,
    title: draft.title,
    hook: draft.hook,
    body: draft.body,
    callToAction: draft.callToAction,
    seoTitle: draft.seoTitle,
    seoDescription: draft.seoDescription,
    tags: draft.tags,
    wordCount: draft.wordCount,
    estimatedSeconds: Math.round(estimatedMs / 1000),
    generator: engine.kind === "anthropic" ? "anthropic" : "local",
  });

  const sceneDrafts = await engine.breakdownScenes({
    script: draft,
    styleId: project.styleId,
    secondsPerScene: style.secondsPerScene,
    wpm: voice.wpm,
  });

  await db.delete(scenes).where(eq(scenes.projectId, project.id));
  if (sceneDrafts.length > 0) {
    await db.insert(scenes).values(
      sceneDrafts.map((s) => ({
        id: newId("scn"),
        projectId: project.id,
        idx: s.index,
        narration: s.narration,
        onScreenText: s.onScreenText ?? null,
        visualPrompt: s.visualPrompt,
        shot: s.shot ?? null,
        motion: s.motion ?? "in",
        imageStatus: "pending" as const,
      })),
    );
  }

  await touch(project.id, { status: "scripted", title: draft.title });
  return { scriptId, draft, sceneCount: sceneDrafts.length, generator: engine.kind };
}

/** Persist a user's manual edits to the script and rebuild the scene list. */
export async function saveScriptEdits(
  project: Project,
  patch: { title?: string; hook?: string; body?: string; callToAction?: string; seoTitle?: string; seoDescription?: string; tags?: string[] },
) {
  const current = await latestScript(project.id);
  if (!current) throw new ApiFailure(400, "no_script", "Generate a script first.");

  const db = await getDb();
  const merged = {
    title: patch.title ?? current.title,
    hook: patch.hook ?? current.hook,
    body: patch.body ?? current.body,
    callToAction: patch.callToAction ?? current.callToAction,
    seoTitle: patch.seoTitle ?? current.seoTitle,
    seoDescription: patch.seoDescription ?? current.seoDescription,
    tags: patch.tags ?? current.tags,
  };

  const voice = voiceById(project.voiceId);
  const style = styleById(project.styleId);
  const fullText = `${merged.body}\n${merged.callToAction}`;
  const wordCount = fullText.trim().split(/\s+/).filter(Boolean).length;
  const estimatedMs = estimateDurationMs(fullText, voice.wpm);

  await db
    .update(scripts)
    .set({ ...merged, wordCount, estimatedSeconds: Math.round(estimatedMs / 1000) })
    .where(eq(scripts.id, current.id));

  // Re-plan scenes only when the spoken words actually changed; a metadata
  // edit must not throw away scene images the user has already paid for.
  const narrationChanged =
    merged.body !== current.body || merged.callToAction !== current.callToAction;

  if (narrationChanged) {
    const engine = await llm();
    const { planScenes } = await import("@/lib/providers/llm/local");
    const drafts = planScenes({
      script: { ...merged, wordCount, estimatedSeconds: Math.round(estimatedMs / 1000) },
      styleId: project.styleId,
      secondsPerScene: style.secondsPerScene,
      wpm: voice.wpm,
    });
    void engine;

    await db.delete(scenes).where(eq(scenes.projectId, project.id));
    if (drafts.length > 0) {
      await db.insert(scenes).values(
        drafts.map((s) => ({
          id: newId("scn"),
          projectId: project.id,
          idx: s.index,
          narration: s.narration,
          onScreenText: s.onScreenText ?? null,
          visualPrompt: s.visualPrompt,
          shot: s.shot ?? null,
          motion: s.motion ?? "in",
          imageStatus: "pending" as const,
        })),
      );
    }
  }

  await touch(project.id, { title: merged.title, status: "scripted" });
  return { narrationChanged };
}

/* ─────────────────────────── Scenes ─────────────────────────── */

/** Generate the still for one scene, charging a credit for the attempt. */
export async function generateSceneImage(
  project: Project,
  scene: Scene,
  userId: string,
  opts: { revision?: number } = {},
): Promise<Scene> {
  const db = await getDb();
  const provider = await imageProvider();
  const store = await storage();
  const dims = DIMENSIONS[project.aspectRatio];

  await chargeCredits({
    userId,
    credits: CREDIT_COSTS.sceneImage,
    operation: "scene.image",
    referenceId: scene.id,
    note: `Scene ${scene.idx + 1} visual`,
  });

  await db.update(scenes).set({ imageStatus: "generating" }).where(eq(scenes.id, scene.id));

  try {
    const revision = opts.revision ?? 1;
    const result = await provider.generate({
      prompt: scene.visualPrompt,
      styleId: project.styleId,
      width: dims.width,
      height: dims.height,
      // Seeded on the prompt and revision, so the same scene regenerates
      // differently on request but identically on retry.
      seed: hash32(`${scene.id}:${scene.visualPrompt}:${revision}`),
    });

    const key = keys.sceneImage(project.id, scene.idx, revision);
    await store.put(key, result.png, "image/png");

    const [updated] = await db
      .update(scenes)
      .set({
        imageKey: key,
        imageStatus: "ready",
        imageProvider: result.provider,
        updatedAt: new Date(),
      })
      .where(eq(scenes.id, scene.id))
      .returning();

    return updated!;
  } catch (err) {
    await db.update(scenes).set({ imageStatus: "failed" }).where(eq(scenes.id, scene.id));
    await refundCredits({
      userId,
      credits: CREDIT_COSTS.sceneImage,
      referenceId: scene.id,
      note: "Scene visual failed",
    });
    throw err;
  }
}

/** Generate every outstanding scene visual for a project. */
export async function generateAllSceneImages(project: Project, userId: string) {
  const all = await projectScenes(project.id);
  const pending = all.filter((s) => s.imageStatus !== "ready");
  const generated: Scene[] = [];
  const failures: { idx: number; error: string }[] = [];

  for (const scene of pending) {
    try {
      generated.push(await generateSceneImage(project, scene, userId));
    } catch (err) {
      // Keep going: one bad prompt should not strand the other nine scenes.
      failures.push({ idx: scene.idx, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (generated.length > 0) await touch(project.id, { status: "storyboarded" });
  return { generated: generated.length, skipped: all.length - pending.length, failures };
}

/* ─────────────────────────── Voiceover ─────────────────────────── */

/**
 * Synthesise the narration and re-time every scene against it.
 *
 * This is the step that converts a script into a timeline. Until it runs, a
 * project has no real durations — only estimates.
 */
export async function generateVoiceover(project: Project, userId: string) {
  const script = await latestScript(project.id);
  if (!script) throw new ApiFailure(400, "no_script", "Generate a script first.");

  const sceneRows = await projectScenes(project.id);
  if (sceneRows.length === 0) throw new ApiFailure(400, "no_scenes", "This project has no scenes.");

  const engine = await tts();
  const store = await storage();
  const db = await getDb();

  // Narration must be exactly the scene text, in order — the scene list is
  // what the timeline is built from, so anything else would drift.
  const narration = sceneRows.map((s) => s.narration).join("\n");
  const voice = voiceById(project.voiceId);
  const estimateSeconds = estimateDurationMs(narration, voice.wpm) / 1000;
  const credits = Math.ceil(estimateSeconds * CREDIT_COSTS.voiceoverPerSecond);

  await chargeCredits({
    userId,
    credits,
    operation: "voiceover.generate",
    referenceId: project.id,
    note: `Voiceover (~${Math.round(estimateSeconds)}s, ${voice.name})`,
  });

  try {
    const result = await engine.synthesise({ text: narration, voiceId: project.voiceId });
    const voiceoverId = newId("vo");
    const audioKey = keys.voiceover(project.id, voiceoverId);
    await store.put(audioKey, result.wav, "audio/wav");

    await db.insert(voiceovers).values({
      id: voiceoverId,
      projectId: project.id,
      voiceId: project.voiceId,
      audioKey,
      durationMs: result.durationMs,
      words: result.words,
      mode: result.mode,
    });

    const timings = retimeScenes(sceneRows, result.words, result.durationMs);
    for (const t of timings) {
      await db
        .update(scenes)
        .set({ startMs: t.startMs, endMs: t.endMs, updatedAt: new Date() })
        .where(eq(scenes.id, t.id));
    }

    await touch(project.id, { status: "voiced" });
    return { voiceoverId, durationMs: result.durationMs, words: result.words.length, mode: result.mode };
  } catch (err) {
    await refundCredits({ userId, credits, referenceId: project.id, note: "Voiceover failed" });
    throw err;
  }
}

/* ─────────────────────────── Renders ─────────────────────────── */

/** Freeze everything a render needs into a self-contained, replayable spec. */
export async function buildRenderSpec(
  project: Project,
  aspectRatio: AspectRatio,
  renderId: string,
  watermark: string | null,
): Promise<RenderJobSpec> {
  const sceneRows = await projectScenes(project.id);
  const voiceover = await latestVoiceover(project.id);
  const script = await latestScript(project.id);

  if (!voiceover) throw new ApiFailure(400, "no_voiceover", "Generate the voiceover first.");
  const missingArt = sceneRows.filter((s) => !s.imageKey);
  if (missingArt.length > 0) {
    throw new ApiFailure(
      400,
      "missing_scene_art",
      `${missingArt.length} scene${missingArt.length === 1 ? " has" : "s have"} no visual yet.`,
      { scenes: missingArt.map((s) => s.idx) },
    );
  }

  const style = styleById(project.styleId);
  const preset = captionPresetById(project.captionPresetId);
  const bed = musicBedById(project.musicBedId);
  const dims = DIMENSIONS[aspectRatio];

  const renderScenes: RenderScene[] = sceneRows.map((s) => ({
    index: s.idx,
    imageUrl: s.imageKey!,
    startMs: s.startMs,
    endMs: s.endMs,
    onScreenText: s.onScreenText ?? undefined,
    motion: (s.motion as RenderScene["motion"]) ?? "in",
  }));

  return {
    renderId,
    projectId: project.id,
    title: script?.title ?? project.title,
    aspectRatio,
    width: dims.width,
    height: dims.height,
    fps: 30,
    styleId: project.styleId,
    captionPresetId: preset.id,
    burnCaptions: project.burnCaptions,
    musicBedId: bed.id === "none" ? null : bed.id,
    musicGainDb: bed.gainDb,
    scenes: renderScenes,
    audioUrl: voiceover.audioKey,
    durationMs: voiceover.durationMs,
    cues: groupIntoCues(voiceover.words, preset.maxWordsPerCue),
    watermark,
  };
}

/**
 * Queue one render per requested aspect ratio.
 *
 * Credits are charged at enqueue time so a user cannot queue ten renders they
 * cannot pay for; the worker refunds on failure.
 */
export async function enqueueRenders(
  project: Project,
  userId: string,
  opts: { ratios?: AspectRatio[]; watermark: string | null },
) {
  const db = await getDb();
  const voiceover = await latestVoiceover(project.id);
  if (!voiceover) throw new ApiFailure(400, "no_voiceover", "Generate the voiceover first.");

  const ratios =
    opts.ratios && opts.ratios.length > 0
      ? opts.ratios
      : project.alsoRenderShorts
        ? [project.aspectRatio, companionRatio(project.aspectRatio)]
        : [project.aspectRatio];

  const seconds = voiceover.durationMs / 1000;
  const perRender = Math.ceil(seconds * CREDIT_COSTS.renderPerSecondPerVariant);

  const queued: { id: string; aspectRatio: AspectRatio }[] = [];
  for (const ratio of ratios) {
    const renderId = newId("rnd");
    const spec = await buildRenderSpec(project, ratio, renderId, opts.watermark);

    await chargeCredits({
      userId,
      credits: perRender,
      operation: "render.encode",
      referenceId: renderId,
      note: `Render ${ratio} (${Math.round(seconds)}s)`,
    });

    await db.insert(renders).values({
      id: renderId,
      projectId: project.id,
      userId,
      status: "queued",
      aspectRatio: ratio,
      width: spec.width,
      height: spec.height,
      fps: spec.fps,
      spec,
      cues: spec.cues,
      creditsCharged: perRender,
      durationMs: spec.durationMs,
      stage: "queued",
    });

    queued.push({ id: renderId, aspectRatio: ratio });
  }

  await touch(project.id, { status: "rendering" });
  return { queued, creditsCharged: perRender * ratios.length };
}

export async function renderWithEvents(renderId: string, userId: string) {
  const db = await getDb();
  const [render] = await db
    .select()
    .from(renders)
    .where(and(eq(renders.id, renderId), eq(renders.userId, userId)))
    .limit(1);
  if (!render) throw new ApiFailure(404, "not_found", "Render not found.");
  return render;
}

export async function projectRenders(projectId: string) {
  const db = await getDb();
  return db
    .select()
    .from(renders)
    .where(eq(renders.projectId, projectId))
    .orderBy(desc(renders.createdAt));
}

export async function libraryRenders(userId: string, limit = 60) {
  const db = await getDb();
  return db
    .select({
      render: renders,
      projectTitle: projects.title,
      styleId: projects.styleId,
    })
    .from(renders)
    .innerJoin(projects, eq(projects.id, renders.projectId))
    .where(eq(renders.userId, userId))
    .orderBy(desc(renders.createdAt))
    .limit(limit);
}

export const countProjectScenes = async (projectId: string): Promise<number> => {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(scenes)
    .where(eq(scenes.projectId, projectId));
  return row?.n ?? 0;
};
