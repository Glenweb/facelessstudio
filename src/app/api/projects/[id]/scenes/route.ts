import { authed } from "@/lib/http/handler";
import { ok } from "@/lib/http/respond";
import { mediaUrlFor } from "@/lib/providers/storage";
import { generateAllSceneImages, ownedProject, projectScenes } from "@/lib/services/studio";

export const dynamic = "force-dynamic";
/** Generating ten scene visuals in series needs generous headroom. */
export const maxDuration = 300;

export const GET = authed<{ id: string }>(async (_req, { params, user }) => {
  const project = await ownedProject(params.id, user.id);
  const rows = await projectScenes(project.id);
  return ok({
    scenes: rows.map((s) => ({ ...s, imageUrl: s.imageKey ? mediaUrlFor(s.imageKey) : null })),
  });
});

/** Generate every outstanding scene visual. Already-rendered scenes are skipped. */
export const POST = authed<{ id: string }>(async (_req, { params, user }) => {
  const project = await ownedProject(params.id, user.id);
  const result = await generateAllSceneImages(project, user.id);
  const rows = await projectScenes(project.id);
  return ok({
    ...result,
    scenes: rows.map((s) => ({ ...s, imageUrl: s.imageKey ? mediaUrlFor(s.imageKey) : null })),
  });
});
