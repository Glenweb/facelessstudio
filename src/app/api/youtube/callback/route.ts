import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { getDb, youtubeAccounts } from "@/lib/db";
import { route } from "@/lib/http/handler";
import { newId } from "@/lib/ids";
import { currentSession } from "@/lib/auth/session";
import { exchangeCode, fetchChannel } from "@/lib/providers/youtube";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${env.appUrl}/settings?youtube=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${env.appUrl}/settings?youtube=missing_code`);
  }

  // `state` alone is not proof of identity — confirm against the live session
  // so a replayed callback cannot attach a channel to someone else's account.
  const session = await currentSession();
  if (!session || (state && state !== session.userId)) {
    return NextResponse.redirect(`${env.appUrl}/login?next=/settings`);
  }

  const tokens = await exchangeCode(code);
  const channel = await fetchChannel(tokens.accessToken);
  const db = await getDb();

  const existing = await db
    .select({ id: youtubeAccounts.id, refreshToken: youtubeAccounts.refreshToken })
    .from(youtubeAccounts)
    .where(eq(youtubeAccounts.userId, session.userId))
    .limit(1);

  const values = {
    userId: session.userId,
    channelId: channel?.id ?? null,
    channelTitle: channel?.title ?? null,
    accessToken: tokens.accessToken,
    // Google only issues a refresh token on first consent; never overwrite a
    // stored one with null or the connection silently expires in an hour.
    refreshToken: tokens.refreshToken ?? existing[0]?.refreshToken ?? null,
    expiresAt: tokens.expiresAt,
    scope: tokens.scope,
  };

  if (existing[0]) {
    await db.update(youtubeAccounts).set(values).where(eq(youtubeAccounts.id, existing[0].id));
  } else {
    await db.insert(youtubeAccounts).values({ id: newId("yt"), ...values });
  }

  return NextResponse.redirect(`${env.appUrl}/settings?youtube=connected`);
});
