import { eq } from "drizzle-orm";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { getDb, users } from "@/lib/db";
import { route } from "@/lib/http/handler";
import { fail, ok } from "@/lib/http/respond";

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const POST = route(async (req) => {
  const { email, password } = Body.parse(await req.json());
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Same response whether the email is unknown or the password is wrong, so
  // the endpoint cannot be used to enumerate accounts.
  const invalid = fail(401, "invalid_credentials", "That email and password do not match.");
  if (!user) return invalid;
  if (!(await verifyPassword(password, user.passwordHash))) return invalid;

  await setSessionCookie({ userId: user.id, email: user.email, name: user.name });
  return ok({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      creditsBalance: user.creditsBalance,
    },
  });
});
