import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, scenes } from "@/lib/db";
import { authed } from "@/lib/http/handler";
import { notFound, ok } from "@/lib/http/respond";
import { mediaUrlFor } from "@/lib/providers/storage";
import { generateSceneImage, ownedProject } from "@/lib/services/studio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PatchBody = z.object({
  narration: z.string().optional(),
  onScreenText: z.string().nullable().optional(),
  visualPrompt: z.string().optional(),
  motion: z.enum(["in", "out", "left", "right"]).optional(),
});

async function loadScene(projectId: string, sceneId: string) {
  const db = await getDb();
  const [scene] = await db
    .select()
    .from(scenes)
    .where(and(eq(scenes.id, sceneId), eq(scenes.projectId, projectId)))
    .limit(1);
  return scene ?? null;
}

/** Edit a scene in place. Changing the visual prompt invalidates its image. */
export const PATCH = authed<{ id: string; sceneId: string }>(async (req, { params, user }) => {
  const project = await ownedProject(params.id, user.id);
  const scene = await loadScene(project.id, params.sceneId);
  if (!scene) return notFound("Scene");

  const patch = PatchBody.parse(await req.json());
  const promptChanged =
    patch.visualPrompt !== undefined && patch.visualPrompt !== scene.visualPrompt;

  const db = await getDb();
  const [updated] = await db
    .update(scenes)
    .set({
      ...patch,
      // Mark the art stale rather than deleting it, so the old frame keeps
      // showing in the timeline until a new one is paid for and generated.
      ...(promptChanged ? { imageStatus: "pending" as const } : {}),
      updatedAt: new Date(),
    })
    .where(eq(scenes.id, scene.id))
    .returning();

  return ok({
    scene: { ...updated!, imageUrl: updated!.imageKey ? mediaUrlFor(updated!.imageKey) : null },
    promptChanged,
  });
});

/** Re-roll this scene's visual. Each call is a new revision and a new charge. */
export const POST = authed<{ id: string; sceneId: string }>(async (_req, { params, user }) => {
  const project = await ownedProject(params.id, user.id);
  const scene = await loadScene(project.id, params.sceneId);
  if (!scene) return notFound("Scene");

  // Derive the next revision from the stored key so re-rolls never collide.
  const current = scene.imageKey?.match(/-r(\d+)\.png$/)?.[1];
  const revision = current ? Number(current) + 1 : 1;

  const updated = await generateSceneImage(project, scene, user.id, { revision });
  return ok({
    scene: { ...updated, imageUrl: updated.imageKey ? mediaUrlFor(updated.imageKey) : null },
    revision,
  });
});
