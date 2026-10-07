import { authed } from "@/lib/http/handler";
import { ok } from "@/lib/http/respond";
import { mediaUrlFor } from "@/lib/providers/storage";
import { libraryRenders } from "@/lib/services/studio";

export const dynamic = "force-dynamic";

export const GET = authed(async (_req, { user }) => {
  const rows = await libraryRenders(user.id);
  return ok({
    items: rows.map(({ render, projectTitle, styleId }) => ({
      id: render.id,
      projectId: render.projectId,
      projectTitle,
      styleId,
      status: render.status,
      aspectRatio: render.aspectRatio,
      width: render.width,
      height: render.height,
      durationMs: render.durationMs,
      sizeBytes: render.sizeBytes,
      encodeMs: render.encodeMs,
      createdAt: render.createdAt,
      videoUrl: render.videoKey ? mediaUrlFor(render.videoKey) : null,
      thumbnailUrl: render.thumbnailKey ? mediaUrlFor(render.thumbnailKey) : null,
    })),
  });
});
