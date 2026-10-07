import { eq } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { grantCredits } from "@/lib/credits";
import { getDb, users } from "@/lib/db";
import { route } from "@/lib/http/handler";
import { created, fail } from "@/lib/http/respond";
import { newId } from "@/lib/ids";
import { SIGNUP_CREDITS } from "@/lib/studio/pricing";

const Body = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(80),
  email: z.string().trim().toLowerCase().email("That email does not look right."),
  password: z.string().min(8, "Use at least 8 characters."),
});

export const POST = route(async (req) => {
  const { name, email, password } = Body.parse(await req.json());
  const db = await getDb();

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return fail(409, "email_taken", "An account with that email already exists.");

  const id = newId("usr");
  await db.insert(users).values({
    id,
    email,
    name,
    passwordHash: await hashPassword(password),
    plan: "free",
    creditsBalance: 0,
  });

  // Granted through the ledger rather than set on the row, so the balance and
  // the usage history agree from the very first entry.
  await grantCredits({
    userId: id,
    credits: SIGNUP_CREDITS,
    operation: "grant.signup",
    note: "Welcome credits",
  });

  await setSessionCookie({ userId: id, email, name });
  return created({ user: { id, email, name, plan: "free", creditsBalance: SIGNUP_CREDITS } });
});
