import { capabilityReport, isLocalStudio } from "@/lib/env";
import { getDb } from "@/lib/db";
import { route } from "@/lib/http/handler";
import { ok } from "@/lib/http/respond";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Liveness plus a full provider-mode report — what `npm run doctor` reads. */
export const GET = route(async () => {
  let database = "ok";
  try {
    const db = await getDb();
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    database = err instanceof Error ? err.message : "unreachable";
  }

  return ok({
    status: database === "ok" ? "ok" : "degraded",
    database,
    localStudioMode: isLocalStudio(),
    capabilities: capabilityReport(),
    timestamp: new Date().toISOString(),
  });
});
