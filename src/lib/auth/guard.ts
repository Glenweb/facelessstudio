/** Route-handler auth guard: resolves the signed cookie to a live user row. */
import { eq } from "drizzle-orm";
import { getDb, users, type User } from "@/lib/db";
import { ApiFailure } from "@/lib/http/respond";
import { currentSession } from "./session";

export async function getCurrentUser(): Promise<User | null> {
  const session = await currentSession();
  if (!session) return null;
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return user ?? null;
}

/** Throws ApiFailure(401) rather than returning null, for use inside handlers. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new ApiFailure(401, "unauthorized", "Sign in to continue.");
  return user;
}
