/**
 * Render queue worker.
 *
 * Jobs live in the `renders` table. Claiming uses `FOR UPDATE SKIP LOCKED`, so
 * several workers can share one queue without double-processing, and a job
 * whose worker died is reclaimed after a timeout rather than wedging the queue.
 *
 * In local mode the worker runs inside the Next.js server process (see
 * instrumentation.ts) because PGlite is single-writer. With a real Postgres
 * configured, services/worker/main.ts runs the same loop as its own process so
 * renders scale independently of web traffic.
 */
import { and, eq, lt, or, sql } from "drizzle-orm";
import { refundCredits } from "@/lib/credits";
import { getDb, renderEvents, renders, type Render } from "@/lib/db";
import { newId } from "@/lib/ids";
import { renderExecutor } from "@/lib/providers/render";
import type { RenderJobSpec } from "@/lib/studio/types";

/** A job claimed but not finished within this window is considered abandoned. */
const STALE_CLAIM_MS = 15 * 60 * 1_000;
const MAX_ATTEMPTS = 3;
const IDLE_POLL_MS = 1_500;

export async function recordEvent(
  renderId: string,
  stage: string,
  progress: number,
  message: string,
): Promise<void> {
  const db = await getDb();
  await db.insert(renderEvents).values({
    id: newId("evt"),
    renderId,
    stage,
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    message,
  });
  await db
    .update(renders)
    .set({ stage, progress: Math.max(0, Math.min(100, Math.round(progress))) })
    .where(eq(renders.id, renderId));
}

/**
 * Atomically take the next job.
 *
 * The inner SELECT picks one row and locks it; SKIP LOCKED means a second
 * worker steps past it instead of blocking. Without this, two workers would
 * both read the same `queued` row and encode it twice.
 */
export async function claimNextRender(): Promise<Render | null> {
  const db = await getDb();
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);

  const claimed = await db
    .update(renders)
    .set({ status: "claimed", claimedAt: new Date(), attempts: sql`${renders.attempts} + 1` })
    .where(
      sql`${renders.id} = (
        SELECT r.id FROM renders r
        WHERE r.status = 'queued'
           OR (r.status IN ('claimed','running') AND r.claimed_at < ${staleBefore})
        ORDER BY r.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )`,
    )
    .returning();

  return claimed[0] ?? null;
}

export async function runRender(render: Render): Promise<void> {
  const db = await getDb();
  const spec = render.spec as RenderJobSpec | null;

  if (!spec) {
    await failRender(render, "This render has no job spec and cannot be replayed.");
    return;
  }

  await db
    .update(renders)
    .set({ status: "running", startedAt: new Date(), stage: "starting", progress: 2 })
    .where(eq(renders.id, render.id));
  await recordEvent(render.id, "starting", 2, `Rendering ${render.aspectRatio}`);

  try {
    const executor = await renderExecutor();
    const output = await executor.execute(spec, async (percent, stage, message) => {
      await recordEvent(render.id, stage, percent, message);
    });

    await db
      .update(renders)
      .set({
        status: "succeeded",
        progress: 100,
        stage: "done",
        videoKey: output.videoKey,
        thumbnailKey: output.thumbnailKey,
        durationMs: output.durationMs,
        sizeBytes: output.sizeBytes,
        encodeMs: output.encodeMs,
        finishedAt: new Date(),
        error: null,
      })
      .where(eq(renders.id, render.id));

    await recordEvent(render.id, "done", 100, "Render complete");
    await markProjectReadyIfSettled(render.projectId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Transient failures get another pass; the claim loop will pick the row
    // back up because it is returned to `queued`.
    if (render.attempts < MAX_ATTEMPTS) {
      await db
        .update(renders)
        .set({ status: "queued", stage: "retrying", progress: 0, error: message.slice(0, 2000) })
        .where(eq(renders.id, render.id));
      await recordEvent(
        render.id,
        "retrying",
        0,
        `Attempt ${render.attempts} failed, retrying: ${message.slice(0, 200)}`,
      );
      return;
    }

    await failRender(render, message);
  }
}

async function failRender(render: Render, message: string): Promise<void> {
  const db = await getDb();
  await db
    .update(renders)
    .set({
      status: "failed",
      stage: "failed",
      error: message.slice(0, 4000),
      finishedAt: new Date(),
    })
    .where(eq(renders.id, render.id));
  await recordEvent(render.id, "failed", 0, message.slice(0, 500));

  // A render that never produced a file must not be charged for.
  if (render.creditsCharged > 0) {
    await refundCredits({
      userId: render.userId,
      credits: render.creditsCharged,
      referenceId: render.id,
      note: "Render failed",
    });
  }

  await db
    .update(renders)
    .set({ creditsCharged: 0 })
    .where(eq(renders.id, render.id));
  await markProjectReadyIfSettled(render.projectId);
}

/** Move the project out of `rendering` once nothing is left in flight. */
async function markProjectReadyIfSettled(projectId: string): Promise<void> {
  const db = await getDb();
  const { projects } = await import("@/lib/db");

  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(renders)
    .where(
      and(
        eq(renders.projectId, projectId),
        or(eq(renders.status, "queued"), eq(renders.status, "claimed"), eq(renders.status, "running")),
      ),
    );
  if ((pending?.n ?? 0) > 0) return;

  const [succeeded] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(renders)
    .where(and(eq(renders.projectId, projectId), eq(renders.status, "succeeded")));

  await db
    .update(projects)
    .set({ status: (succeeded?.n ?? 0) > 0 ? "ready" : "failed", updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

/** Process at most one job. Returns true when work was done. */
export async function tick(): Promise<boolean> {
  const render = await claimNextRender();
  if (!render) return false;
  await runRender(render);
  return true;
}

let running = false;

/**
 * Start the polling loop. Idempotent — Next.js dev reloads call this more than
 * once and a second loop would double-claim.
 */
export function startWorker(label: string): void {
  if (running) return;
  running = true;
  console.log(`[worker] started (${label})`);

  const loop = async (): Promise<void> => {
    for (;;) {
      try {
        const didWork = await tick();
        if (!didWork) await new Promise((r) => setTimeout(r, IDLE_POLL_MS));
      } catch (err) {
        console.error("[worker] loop error:", err);
        await new Promise((r) => setTimeout(r, 4_000));
      }
    }
  };

  void loop();
}

/** Reset jobs left mid-flight by a crash, so they are retried on boot. */
export async function requeueOrphans(): Promise<number> {
  const db = await getDb();
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
  const rows = await db
    .update(renders)
    .set({ status: "queued", stage: "requeued", progress: 0 })
    .where(
      and(
        or(eq(renders.status, "claimed"), eq(renders.status, "running")),
        lt(renders.claimedAt, staleBefore),
      ),
    )
    .returning({ id: renders.id });
  return rows.length;
}
