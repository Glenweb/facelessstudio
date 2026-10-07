/**
 * Database driver selection.
 *
 * DATABASE_URL set  -> node-postgres pool against Neon.
 * DATABASE_URL unset -> PGlite, an embedded Postgres build, at .data/pgdata.
 *
 * Both expose the identical Drizzle API, so no call site knows or cares.
 * PGlite is single-writer, which is why the render worker runs inside the
 * Next.js server process in local mode (see instrumentation.ts) and as its
 * own process only when a real Postgres is configured.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DATA_DIR, env, modes } from "@/lib/env";
import { DDL_STATEMENTS } from "./ddl";
import { schema } from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

declare global {
  // Survives Next.js dev hot-reloads, which would otherwise open a new
  // PGlite instance per reload and deadlock on the data directory lock.
  // eslint-disable-next-line no-var
  var __fvsDb: { db: Database; ready: Promise<void> } | undefined;
}

/**
 * Guards the embedded data directory against a second writer.
 *
 * PGlite allows one writer, but it enforces that by blocking inside its WASM
 * initialisation — no error, no timeout, and the event loop is stalled so a
 * JS timer cannot even report it. Its own `postmaster.pid` is no help either:
 * it records a synthetic pid of -42. So the owning process records its real
 * pid here and anything else fails fast with an explanation.
 */
function claimEmbeddedLock(dir: string): void {
  const lockPath = `${dir}.lock`;

  if (existsSync(lockPath)) {
    const pid = Number.parseInt(readFileSync(lockPath, "utf8").trim(), 10);
    let held = false;
    if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
      try {
        // Signal 0 tests for existence without delivering anything.
        process.kill(pid, 0);
        held = true;
      } catch {
        // The owner is gone; the lock is stale and ours to take.
        held = false;
      }
    }
    if (held) {
      throw new Error(
        [
          `The embedded database is already open in process ${pid}.`,
          "",
          "PGlite allows one writer at a time, and `npm run dev` holds it while the",
          "server is running. Either stop the dev server and run this again, or set",
          "DATABASE_URL to a Postgres instance, which has no such limit.",
          "",
          "To create an account while the server is running, sign up at",
          "http://localhost:3000/signup — no script needed.",
        ].join("\n"),
      );
    }
  }

  writeFileSync(lockPath, String(process.pid));
  const release = (): void => {
    try {
      // Only clear the lock if it is still ours.
      if (existsSync(lockPath) && readFileSync(lockPath, "utf8").trim() === String(process.pid)) {
        rmSync(lockPath, { force: true });
      }
    } catch {
      // Releasing is best effort; a stale lock is detected on the next open.
    }
  };
  process.once("exit", release);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      release();
      process.exit(0);
    });
  }
}

async function createDatabase(): Promise<{ db: Database; ready: Promise<void> }> {
  let db: Database;

  if (modes.database === "live") {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({
      connectionString: env.databaseUrl,
      max: 8,
      ssl: env.databaseUrl?.includes("localhost") ? undefined : { rejectUnauthorized: true },
    });
    db = drizzle(pool, { schema }) as unknown as Database;
  } else {
    const dir = join(DATA_DIR, "pgdata");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    claimEmbeddedLock(dir);
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = new PGlite(dir);
    await client.waitReady;
    db = drizzle(client, { schema }) as unknown as Database;
  }

  const ready = (async () => {
    for (const statement of DDL_STATEMENTS) {
      await db.execute(sql.raw(statement));
    }
  })();

  return { db, ready };
}

let initPromise: Promise<{ db: Database; ready: Promise<void> }> | undefined;

/** Resolves once the schema exists. Safe to call on every request. */
export async function getDb(): Promise<Database> {
  if (globalThis.__fvsDb) {
    await globalThis.__fvsDb.ready;
    return globalThis.__fvsDb.db;
  }
  initPromise ??= createDatabase().then((created) => {
    globalThis.__fvsDb = created;
    return created;
  });
  const created = await initPromise;
  await created.ready;
  return created.db;
}

/** Applies DDL without returning a handle — used by scripts and boot hooks. */
export async function ensureSchema(): Promise<void> {
  await getDb();
}

export { schema };
export * from "./schema";
