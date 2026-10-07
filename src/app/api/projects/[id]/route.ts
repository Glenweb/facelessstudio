import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, projects } from "@/lib/db";
import { authed } from "@/lib/http/handler";
import { ok } from "@/lib/http/respond";
import { mediaUrlFor } from "@/lib/providers/storage";
import { captionPresetById } from "@/lib/studio/captions";
import { musicBedById } from "@/lib/studio/music";
import { styleById } from "@/lib/studio/styles";
import { voiceById } from "@/lib/studio/voices";
import {
  latestScript,
  latestVoiceover,
  ownedProject,
  projectRenders,
  projectScenes,
} from "@/lib/services/studio";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  styleId: z.string().optional(),
  voiceId: z.string().optional(),
  captionPresetId: z.string().optional(),
  musicBedId: z.string().nullable().optional(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
  alsoRenderShorts: z.boolean().optional(),
  targetSeconds: z.number().int().min(15).max(1800).optional(),
  burnCaptions: z.boolean().optional(),
});

/** The full project view the editor pages load in one request. */
export const GET = authed<{ id: string }>(async (_req, { params, user }) => {
  const project = await ownedProject(params.id, user.id);
  const [script, sceneRows, voiceover, renderRows] = await Promise.all([
    latestScript(project.id),
    projectScenes(project.id),
    latestVoiceover(project.id),
    projectRenders(project.id),
  ]);

  return ok({
    project,
    script,
    scenes: sceneRows.map((s) => ({
      ...s,
      imageUrl: s.imageKey ? mediaUrlFor(s.imageKey) : null,
    })),
    voiceover: voiceover
      ? { ...voiceover, audioUrl: mediaUrlFor(voiceover.audioKey) }
      : null,
    renders: renderRows.map((r) => ({
      ...r,
      // Keep responses small: the spec is large and the client never reads it.
      spec: undefined,
      cues: undefined,
      videoUrl: r.videoKey ? mediaUrlFor(r.videoKey) : null,
      thumbnailUrl: r.thumbnailKey ? mediaUrlFor(r.thumbnailKey) : null,
    })),
    style: styleById(project.styleId),
    voice: voiceById(project.voiceId),
    captionPreset: captionPresetById(project.captionPresetId),
    musicBed: musicBedById(project.musicBedId),
  });
});

export const PATCH = authed<{ id: string }>(async (req, { params, user }) => {
  const project = await ownedProject(params.id, user.id);
  const patch = PatchBody.parse(await req.json());

  const db = await getDb();
  const [updated] = await db
    .update(projects)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(projects.id, project.id))
    .returning();

  return ok({ project: updated });
});

export const DELETE = authed<{ id: string }>(async (_req, { params, user }) => {
  const project = await ownedProject(params.id, user.id);
  const db = await getDb();
  // Scenes, scripts, voiceovers, renders and publications all cascade.
  await db.delete(projects).where(eq(projects.id, project.id));
  return ok({ deleted: project.id });
});
