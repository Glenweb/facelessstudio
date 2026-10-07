import type { Config } from "drizzle-kit";

/**
 * Only needed to generate versioned migrations against a real Neon branch.
 * Day-to-day the schema is applied by `src/lib/db/ddl.ts` at boot, so a fresh
 * clone runs with no migration step.
 */
export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  verbose: true,
  strict: true,
} satisfies Config;
