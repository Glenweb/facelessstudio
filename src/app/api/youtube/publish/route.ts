import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, publications, renders, youtubeAccounts } from "@/lib/db";
import { authed } from "@/lib/http/handler";
import { ApiFailure, created } from "@/lib/http/respond";
import { newId } from "@/lib/ids";
import { storage } from "@/lib/providers/storage";
import { publish, refreshAccessToken } from "@/lib/providers/youtube";
import { latestScript, ownedProject } from "@/lib/services/studio";

export const dynamic = "force-dynamic";
/** Uploading a long-form render takes real time. */
export const maxDuration = 300;

const Body = z.object({
  renderId: z.string(),
  privacy: z.enum(["private", "unlisted", "public"]).default("private"),
  madeForKids: z.boolean().default(false),
  title: z.string().trim().max(100).optional(),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string()).max(30).optional(),
});

export const POST = authed(async (req, { user }) => {
  const body = Body.parse(await req.json());
  const db = await getDb();

  const [render] = await db
    .select()
    .from(renders)
    .where(and(eq(renders.id, body.renderId), eq(renders.userId, user.id)))
    .limit(1);
  if (!render) throw new ApiFailure(404, "not_found", "Render not found.");
  if (render.status !== "succeeded" || !render.videoKey) {
    throw new ApiFailure(400, "render_not_ready", "That render has not finished yet.");
  }

  const project = await ownedProject(render.projectId, user.id);
  const script = await latestScript(project.id);

  // Refresh an expired token before uploading rather than failing mid-upload.
  const [account] = await db
    .select()
    .from(youtubeAccounts)
    .where(eq(youtubeAccounts.userId, user.id))
    .limit(1);

  let accessToken: string | undefined = account?.accessToken;
  if (account && account.expiresAt && account.expiresAt.getTime() < Date.now() + 60_000) {
    if (account.refreshToken) {
      const refreshed = await refreshAccessToken(account.refreshToken);
      accessToken = refreshed.accessToken;
      await db
        .update(youtubeAccounts)
        .set({ accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt })
        .where(eq(youtubeAccounts.id, account.id));
    } else {
      accessToken = undefined;
    }
  }

  const store = await storage();
  const video = await store.get(render.videoKey);

  const publicationId = newId("pub");
  const title = body.title ?? script?.seoTitle ?? project.title;
  const description = body.description ?? script?.seoDescription ?? "";
  const tags = body.tags ?? script?.tags ?? [];

  try {
    const result = await publish({
      title,
      description,
      tags,
      privacy: body.privacy,
      madeForKids: body.madeForKids,
      video,
      accessToken,
    });

    await db.insert(publications).values({
      id: publicationId,
      userId: user.id,
      projectId: project.id,
      renderId: render.id,
      provider: "youtube",
      status: result.dryRun ? "dry_run" : "published",
      videoId: result.videoId,
      url: result.url,
      privacy: body.privacy,
      syntheticDisclosure: true,
      payload: result.payload,
    });

    return created({ publication: { id: publicationId, ...result } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(publications).values({
      id: publicationId,
      userId: user.id,
      projectId: project.id,
      renderId: render.id,
      provider: "youtube",
      status: "failed",
      privacy: body.privacy,
      syntheticDisclosure: true,
      error: message.slice(0, 2000),
    });
    throw err;
  }
});
