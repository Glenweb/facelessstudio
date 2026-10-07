/**
 * Server boot hook.
 *
 * Next.js calls this once per server process. It applies the schema and then
 * starts the render worker in-process.
 *
 * In-process is the correct default, not a shortcut. PGlite is single-writer,
 * so with the embedded database a second worker process could not open the
 * data directory at all. With a real Postgres configured you can disable this
 * and run `npm run worker` separately to scale rendering away from web
 * traffic — set FVS_DISABLE_INPROCESS_WORKER=1.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureSchema } = await import("@/lib/db");
  await ensureSchema();

  if (process.env.FVS_DISABLE_INPROCESS_WORKER === "1") {
    console.log("[boot] in-process worker disabled; run `npm run worker` separately");
    return;
  }

  const { requeueOrphans, startWorker } = await import("@/lib/queue/worker");
  const requeued = await requeueOrphans();
  if (requeued > 0) console.log(`[boot] requeued ${requeued} orphaned render(s)`);
  startWorker("next-server");
}
