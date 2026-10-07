/**
 * YouTube Data API v3 publishing.
 *
 * Two things matter here beyond "upload the file":
 *
 * 1. **Synthetic content disclosure.** Every video this product makes uses
 *    AI-generated visuals and, usually, a synthetic voice. YouTube requires
 *    creators to disclose realistic altered or synthetic media, so
 *    `status.containsSyntheticMedia` is set to true on every upload and is
 *    not a user-toggleable option. Getting this wrong puts the customer's
 *    channel at risk, so the product takes the decision away from them.
 *
 * 2. **Resumable upload.** Long-form renders are large enough that a single
 *    POST is a bad bet on a home connection, so uploads go through the
 *    resumable endpoint.
 *
 * With no client credentials configured, `publish` performs a dry run and
 * returns exactly the request that would have been sent — which is what makes
 * the publish step testable end to end with no Google project.
 */
import { env, modes } from "@/lib/env";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export type Privacy = "private" | "unlisted" | "public";

export interface PublishRequest {
  title: string;
  description: string;
  tags: string[];
  privacy: Privacy;
  madeForKids: boolean;
  video: Buffer;
  accessToken?: string;
}

export interface PublishResult {
  dryRun: boolean;
  videoId: string | null;
  url: string | null;
  payload: Record<string, unknown>;
}

/** The exact `videos.insert` body, built in one place so the dry run cannot drift. */
export function buildVideoResource(req: Omit<PublishRequest, "video" | "accessToken">) {
  return {
    snippet: {
      title: req.title.slice(0, 100),
      description: req.description.slice(0, 5000),
      tags: req.tags.slice(0, 30),
      // 22 = People & Blogs, the safe default for faceless content.
      categoryId: "22",
    },
    status: {
      privacyStatus: req.privacy,
      selfDeclaredMadeForKids: req.madeForKids,
      // Required disclosure for realistic AI-generated or altered media.
      containsSyntheticMedia: true,
      embeddable: true,
      license: "youtube",
    },
  };
}

export function authorisationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.youtubeClientId ?? "",
    redirect_uri: env.youtubeRedirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    // Offline + consent is the only reliable way to be handed a refresh token.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.youtubeClientId ?? "",
      client_secret: env.youtubeClientSecret ?? "",
      redirect_uri: env.youtubeRedirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scope: body.scope,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.youtubeClientId ?? "",
      client_secret: env.youtubeClientSecret ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { access_token: string; expires_in: number; scope: string };
  return {
    accessToken: body.access_token,
    // Google does not reissue the refresh token on refresh; keep the old one.
    refreshToken: null,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scope: body.scope,
  };
}

export async function fetchChannel(accessToken: string): Promise<{ id: string; title: string } | null> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { items?: { id: string; snippet?: { title?: string } }[] };
  const item = body.items?.[0];
  return item ? { id: item.id, title: item.snippet?.title ?? "Your channel" } : null;
}

export async function publish(req: PublishRequest): Promise<PublishResult> {
  const resource = buildVideoResource(req);

  if (modes.youtube === "local" || !req.accessToken) {
    return {
      dryRun: true,
      videoId: null,
      url: null,
      payload: {
        endpoint:
          "POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        body: resource,
        videoBytes: req.video.length,
        note: "Dry run — no YouTube credentials configured. This is the exact request that would be sent.",
      },
    };
  }

  // Step 1: open a resumable session.
  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${req.accessToken}`,
        "content-type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(req.video.length),
      },
      body: JSON.stringify(resource),
    },
  );
  if (!init.ok) {
    throw new Error(`YouTube rejected the upload session (${init.status}): ${(await init.text()).slice(0, 400)}`);
  }
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube returned no resumable upload URL.");

  // Step 2: send the bytes. The file is already in memory and well under the
  // single-request ceiling, so one PUT is correct; the resumable session is
  // what buys us a retryable URL if it drops.
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": "video/mp4",
      "content-length": String(req.video.length),
    },
    body: new Uint8Array(req.video),
  });
  if (!upload.ok) {
    throw new Error(`YouTube upload failed (${upload.status}): ${(await upload.text()).slice(0, 400)}`);
  }

  const result = (await upload.json()) as { id?: string };
  const videoId = result.id ?? null;
  return {
    dryRun: false,
    videoId,
    url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
    payload: resource,
  };
}
