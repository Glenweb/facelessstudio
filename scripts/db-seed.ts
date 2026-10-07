/**
 * Seeds a demo account so a fresh clone has something to look at.
 *
 * Idempotent: running it twice leaves one demo user with a topped-up balance
 * rather than creating duplicates.
 */
import { eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth/password";
import { grantCredits } from "../src/lib/credits";
import { getDb, users } from "../src/lib/db";
import { newId } from "../src/lib/ids";
import { connectOrExplain } from "./_connect";

const EMAIL = "demo@gmkmedia.test";
const PASSWORD = "faceless-demo";

async function main(): Promise<void> {
  await connectOrExplain();
  const db = await getDb();

  const [existing] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);
  const id = existing?.id ?? newId("usr");

  if (!existing) {
    await db.insert(users).values({
      id,
      email: EMAIL,
      name: "Demo Creator",
      passwordHash: await hashPassword(PASSWORD),
      plan: "creator",
      creditsBalance: 0,
    });
  }

  const topUp = Math.max(0, 5_000 - (existing?.creditsBalance ?? 0));
  if (topUp > 0) {
    await grantCredits({
      userId: id,
      credits: topUp,
      operation: "grant.signup",
      note: "Demo account top-up",
    });
  }

  console.log(`\nDemo account ready\n  email:    ${EMAIL}\n  password: ${PASSWORD}\n  credits:  5,000\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
