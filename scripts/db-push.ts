/** Applies the schema. Safe to run repeatedly; every statement is idempotent. */
import { modes } from "../src/lib/env";
import { connectOrExplain } from "./_connect";

async function main(): Promise<void> {
  await connectOrExplain();
  console.log(
    `Schema applied to ${modes.database === "live" ? "Neon Postgres" : "PGlite (.data/pgdata)"}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
