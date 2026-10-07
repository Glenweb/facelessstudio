/**
 * Standalone render worker.
 *
 * For deployments with a real Postgres, where rendering should scale
 * independently of web traffic. Runs the same loop the Next.js server would
 * run in-process, against the same queue table.
 *
 * Not usable with the embedded PGlite database — it is single-writer, so the
 * web server already holds the data directory. `npm run worker` will say so.
 */
import { ensureSchema } from "../../src/lib/db";
import { modes } from "../../src/lib/env";
import { requeueOrphans, startWorker } from "../../src/lib/queue/worker";

async function main(): Promise<void> {
  if (modes.database === "local") {
    console.error(
      "[worker] DATABASE_URL is not set.\n" +
        "         The embedded PGlite database is single-writer and is already held by the\n" +
        "         Next.js server, which runs the worker in-process. Either use `npm run dev`\n" +
        "         on its own, or point DATABASE_URL at a Postgres instance and rerun this.",
    );
    process.exit(1);
  }

  await ensureSchema();
  const requeued = await requeueOrphans();
  if (requeued > 0) console.log(`[worker] requeued ${requeued} orphaned render(s)`);
  startWorker("standalone");

  const shutdown = (signal: string): void => {
    console.log(`[worker] ${signal} received, exiting`);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
