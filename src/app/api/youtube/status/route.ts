import { eq } from "drizzle-orm";
import { modes } from "@/lib/env";
import { getDb, youtubeAccounts } from "@/lib/db";
import { authed } from "@/lib/http/handler";
import { ok } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

export const GET = authed(async (_req, { user }) => {
  const db = await getDb();
  const [account] = await db
    .select({
      channelId: youtubeAccounts.channelId,
      channelTitle: youtubeAccounts.channelTitle,
      expiresAt: youtubeAccounts.expiresAt,
    })
    .from(youtubeAccounts)
    .where(eq(youtubeAccounts.userId, user.id))
    .limit(1);

  return ok({
    mode: modes.youtube,
    connected: Boolean(account),
    channel: account ?? null,
  });
});
