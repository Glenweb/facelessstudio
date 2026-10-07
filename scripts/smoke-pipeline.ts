/**
 * End-to-end pipeline check.
 *
 * Drives the real service layer — the same functions the API routes call —
 * from signup through to a finished MP4 and a YouTube publish payload, then
 * asserts the output. If this passes, the product works.
 *
 *   npm run smoke
 */
import { eq } from "drizzle-orm";
import { grantCredits } from "../src/lib/credits";
import { getDb, projects, users } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { newId } from "../src/lib/ids";
import { storage } from "../src/lib/providers/storage";
import { buildVideoResource } from "../src/lib/providers/youtube";
import { probeDurationMs } from "../src/lib/render/ffmpeg";
import { tick } from "../src/lib/queue/worker";
import { connectOrExplain } from "./_connect";
import {
  enqueueRenders,
  generateAllSceneImages,
  generateScript,
  generateVoiceover,
  latestScript,
  latestVoiceover,
  ownedProject,
  projectRenders,
  projectScenes,
} from "../src/lib/services/studio";

const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

let failures = 0;
const step = (n: string) => console.log(`\n${DIM}──${RESET} ${n}`);
function check(label: string, pass: boolean, detail = ""): void {
  console.log(`   ${pass ? `${GREEN}pass${RESET}` : `${RED}FAIL${RESET}`}  ${label}${detail ? ` ${DIM}${detail}${RESET}` : ""}`);
  if (!pass) failures++;
}

async function main(): Promise<void> {
  const started = Date.now();
  await connectOrExplain();
  const db = await getDb();

  step("Account + credits");
  const userId = newId("usr");
  const email = `smoke-${Date.now()}@gmkmedia.test`;
  await db.insert(users).values({
    id: userId,
    email,
    name: "Smoke Test",
    passwordHash: await hashPassword("smoke-password"),
    plan: "creator",
    creditsBalance: 0,
  });
  // Generous float so a credit shortfall never masks a pipeline failure.
  const balance = await grantCredits({
    userId,
    credits: 5_000,
    operation: "grant.signup",
    note: "smoke test",
  });
  check("user created and credited", balance === 5_000, `balance=${balance}`);

  step("Project");
  const projectId = newId("prj");
  await db.insert(projects).values({
    id: projectId,
    userId,
    title: "Smoke Test",
    sourceType: "prompt",
    sourceText: "why the Roman grain fleet collapsed",
    styleId: "dark-documentary",
    voiceId: "atlas",
    captionPresetId: "viral-bold",
    musicBedId: "tension-drone",
    aspectRatio: "16:9",
    alsoRenderShorts: false,
    // Short on purpose: this must stay fast enough to run in CI.
    targetSeconds: 24,
    burnCaptions: true,
    status: "draft",
  });
  let project = await ownedProject(projectId, userId);
  check("project created", project.id === projectId);

  step("Prompt → script → scenes");
  const scriptResult = await generateScript(project, userId);
  const script = await latestScript(projectId);
  check("script generated", Boolean(script && script.body.length > 40), `${script?.wordCount} words via ${scriptResult.generator}`);
  check("hook present", Boolean(script?.hook && script.hook.length > 10));
  check("SEO metadata present", Boolean(script?.seoTitle && script.tags.length > 0), `${script?.tags.length} tags`);
  check("scenes planned", scriptResult.sceneCount >= 2, `${scriptResult.sceneCount} scenes`);

  step("Scene visuals");
  const art = await generateAllSceneImages(project, userId);
  check("all scene visuals generated", art.failures.length === 0, `${art.generated} generated`);
  const scenes = await projectScenes(projectId);
  check("every scene has art", scenes.every((s) => s.imageKey && s.imageStatus === "ready"));

  step("Voiceover + timeline");
  const vo = await generateVoiceover(project, userId);
  check("voiceover produced", vo.durationMs > 1_000, `${(vo.durationMs / 1000).toFixed(1)}s, ${vo.words} words, mode=${vo.mode}`);
  const voiceover = await latestVoiceover(projectId);
  check("word timings stored", (voiceover?.words.length ?? 0) > 5);

  const timed = await projectScenes(projectId);
  const monotonic = timed.every(
    (s, i) => s.endMs > s.startMs && (i === 0 || s.startMs >= timed[i - 1]!.endMs),
  );
  check("scene timings are contiguous and ordered", monotonic);
  check(
    "last scene ends at the voiceover end",
    Math.abs((timed.at(-1)?.endMs ?? 0) - vo.durationMs) < 50,
    `${timed.at(-1)?.endMs} vs ${vo.durationMs}`,
  );

  step("Render queue → MP4");
  project = await ownedProject(projectId, userId);
  const queued = await enqueueRenders(project, userId, { ratios: ["16:9", "9:16"], watermark: null });
  check("two aspect-ratio variants queued", queued.queued.length === 2);

  let processed = 0;
  // Drain the queue synchronously rather than racing the background worker.
  for (let i = 0; i < 8 && processed < 2; i++) {
    if (await tick()) processed++;
  }
  check("worker processed both renders", processed === 2);

  const rendered = await projectRenders(projectId);
  const succeeded = rendered.filter((r) => r.status === "succeeded");
  check(
    "both renders succeeded",
    succeeded.length === 2,
    rendered.map((r) => `${r.aspectRatio}:${r.status}`).join(" "),
  );
  for (const r of rendered.filter((x) => x.status === "failed")) {
    console.log(`         ${RED}${r.error?.slice(0, 400)}${RESET}`);
  }

  const store = await storage();
  for (const r of succeeded) {
    const path = store.localPath(r.videoKey!);
    const exists = r.videoKey ? await store.exists(r.videoKey) : false;
    check(`${r.aspectRatio} file written`, exists, `${(r.sizeBytes / 1024 / 1024).toFixed(2)} MB`);

    if (path) {
      const actualMs = await probeDurationMs(path);
      const drift = Math.abs(actualMs - vo.durationMs);
      check(
        `${r.aspectRatio} duration matches narration`,
        drift < 400,
        `video ${(actualMs / 1000).toFixed(2)}s vs audio ${(vo.durationMs / 1000).toFixed(2)}s (drift ${drift}ms)`,
      );
    }
    check(`${r.aspectRatio} poster frame written`, Boolean(r.thumbnailKey));
    check(
      `${r.aspectRatio} dimensions correct`,
      r.aspectRatio === "16:9" ? r.width === 1920 && r.height === 1080 : r.width === 1080 && r.height === 1920,
      `${r.width}x${r.height}`,
    );
  }

  step("YouTube publish payload");
  const resource = buildVideoResource({
    title: script?.seoTitle ?? "Smoke",
    description: script?.seoDescription ?? "",
    tags: script?.tags ?? [],
    privacy: "private",
    madeForKids: false,
  });
  check(
    "synthetic-content disclosure is set",
    resource.status.containsSyntheticMedia === true,
  );
  check("title within YouTube's 100-character limit", resource.snippet.title.length <= 100);

  step("Credit ledger");
  const [finalUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const spent = 5_000 - (finalUser?.creditsBalance ?? 0);
  check("credits were metered", spent > 0, `${spent.toFixed(1)} credits spent`);

  console.log(
    `\n${failures === 0 ? `${GREEN}All checks passed${RESET}` : `${RED}${failures} check(s) failed${RESET}`} in ${((Date.now() - started) / 1000).toFixed(1)}s\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`${RED}Smoke test threw:${RESET}`, err);
  process.exit(1);
});
