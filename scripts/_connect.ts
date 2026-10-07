/**
 * Database acquisition for CLI scripts.
 *
 * The embedded-database single-writer guard lives in src/lib/db, so by the
 * time an error reaches here it already explains itself. This keeps the
 * presentation clean rather than dumping a stack trace at someone whose only
 * mistake was leaving `npm run dev` running.
 */
import { ensureSchema } from "../src/lib/db";

export async function connectOrExplain(): Promise<void> {
  try {
    await ensureSchema();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("embedded database is already open")) {
      console.error(`\n${message}\n`);
      process.exit(1);
    }
    throw err;
  }
}
