import { z } from "zod";
import { authed } from "@/lib/http/handler";
import { ok } from "@/lib/http/respond";
import { mediaUrlFor } from "@/lib/providers/storage";
import {
  generateVoiceover,
  latestVoiceover,
  ownedProject,
  projectScenes,
} from "@/lib/services/studio";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export const GET = authed<{ id: string }>(async (_req, { params, user }) => {
  const project = await ownedProject(params.id, user.id);
  const vo = await latestVoiceover(project.id);
  return ok({ voiceover: vo ? { ...vo, audioUrl: mediaUrlFor(vo.audioKey) } : null });
});

/**
 * Synthesise narration and re-time the scene list against the real audio.
 * This is what turns estimates into an actual timeline.
 */
export const POST = authed<{ id: string }>(async (req, { params, user }) => {
  const project = await ownedProject(params.id, user.id);

  // An optional voice override saves a round trip from the voice picker.
  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ voiceId: z.string().optional() }).safeParse(body);
  if (parsed.success && parsed.data.voiceId && parsed.data.voiceId !== project.voiceId) {
    const { getDb, projects } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db
      .update(projects)
      .set({ voiceId: parsed.data.voiceId, updatedAt: new Date() })
      .where(eq(projects.id, project.id));
    project.voiceId = parsed.data.voiceId;
  }

  const result = await generateVoiceover(project, user.id);
  const vo = await latestVoiceover(project.id);

  return ok({
    ...result,
    voiceover: vo ? { ...vo, audioUrl: mediaUrlFor(vo.audioKey) } : null,
    scenes: await projectScenes(project.id),
  });
});
