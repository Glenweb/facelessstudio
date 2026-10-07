import { z } from "zod";
import { authed } from "@/lib/http/handler";
import { ok } from "@/lib/http/respond";
import { generateScript, latestScript, ownedProject, saveScriptEdits } from "@/lib/services/studio";

export const dynamic = "force-dynamic";
/** Script generation can take a while on a long-form piece. */
export const maxDuration = 120;

export const GET = authed<{ id: string }>(async (_req, { params, user }) => {
  const project = await ownedProject(params.id, user.id);
  return ok({ script: await latestScript(project.id) });
});

/** Generate a new script version and rebuild the scene list from it. */
export const POST = authed<{ id: string }>(async (_req, { params, user }) => {
  const project = await ownedProject(params.id, user.id);
  const result = await generateScript(project, user.id);
  return ok(result);
});

const PutBody = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  hook: z.string().optional(),
  body: z.string().optional(),
  callToAction: z.string().optional(),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(5000).optional(),
  tags: z.array(z.string()).max(40).optional(),
});

/** Save manual edits. Scenes are re-planned only if the narration changed. */
export const PUT = authed<{ id: string }>(async (req, { params, user }) => {
  const project = await ownedProject(params.id, user.id);
  const result = await saveScriptEdits(project, PutBody.parse(await req.json()));
  return ok({ ...result, script: await latestScript(project.id) });
});
