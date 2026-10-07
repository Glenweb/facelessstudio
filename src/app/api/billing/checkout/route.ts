import { z } from "zod";
import { startCheckout } from "@/lib/providers/billing";
import { authed } from "@/lib/http/handler";
import { ok } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

const Body = z.object({ packId: z.enum(["starter", "creator", "studio"]) });

export const POST = authed(async (req, { user }) => {
  const { packId } = Body.parse(await req.json());
  const result = await startCheckout({ userId: user.id, email: user.email, packId });

  // A sandbox purchase also lifts the free-tier watermark, so local testing
  // exercises the paid path end to end.
  if (result.mode === "sandbox" && user.plan === "free") {
    const { getDb, users } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.update(users).set({ plan: "creator" }).where(eq(users.id, user.id));
  }

  return ok(result);
});
