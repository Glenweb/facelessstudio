import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { authed } from "@/lib/http/handler";
import { created, ok } from "@/lib/http/respond";
import { getDb, projects, renders, scenes } from "@/lib/db";
import { newId } from "@/lib/ids";
import { captionPresetById } from "@/lib/studio/captions";
import { styleById } from "@/lib/studio/styles";
import { titleCase } from "@/lib/providers/llm/text";
import { recommendedVoiceForStyle, voiceById } from "@/lib/studio/voices";

export const dynamic = "force-dynamic";

const CreateBody = z.object({
  sourceType: z.enum(["prompt", "script"]).default("prompt"),
  sourceText: z.string().trim().min(8, "Give us a bit more to work with."),
  styleId: z.string().default("dark-documentary"),
  voiceId: z.string().optional(),
  captionPresetId: z.string().optional(),
  musicBedId: z.string().nullable().optional(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  alsoRenderShorts: z.boolean().default(false),
  targetSeconds: z.number().int().min(15).max(1800).default(60),
  burnCaptions: z.boolean().default(true),
  title: z.string().trim().max(120).optional(),
});

export const GET = authed(async (_req, { user }) => {
  const db = await getDb();
  const rows = await db
    .select({
      project: projects,
      sceneCount: sql<number>`(SELECT count(*)::int FROM ${scenes} WHERE ${scenes.projectId} = ${projects.id})`,
      renderCount: sql<number>`(SELECT count(*)::int FROM ${renders} WHERE ${renders.projectId} = ${projects.id} AND ${renders.status} = 'succeeded')`,
    })
    .from(projects)
    .where(eq(projects.userId, user.id))
    .orderBy(desc(projects.updatedAt))
    .limit(100);

  return ok({ projects: rows });
});

export const POST = authed(async (req, { user }) => {
  const body = CreateBody.parse(await req.json());
  const style = styleById(body.styleId);

  // Pickers the user did not touch fall back to the style template's own
  // pairings, so a one-field wizard still produces a coherent video.
  const voice = body.voiceId ? voiceById(body.voiceId) : recommendedVoiceForStyle(style.id);
  const preset = captionPresetById(body.captionPresetId ?? style.captionPresetId);
  const musicBedId =
    body.musicBedId === undefined ? style.musicBedId : body.musicBedId;

  const id = newId("prj");
  const db = await getDb();
  const title =
    body.title?.trim() ||
    titleCase(body.sourceText.split(/[.\n]/)[0]?.slice(0, 60) ?? "Untitled project");

  const [project] = await db
    .insert(projects)
    .values({
      id,
      userId: user.id,
      title,
      sourceType: body.sourceType,
      sourceText: body.sourceText,
      styleId: style.id,
      voiceId: voice.id,
      captionPresetId: preset.id,
      musicBedId,
      aspectRatio: body.aspectRatio,
      alsoRenderShorts: body.alsoRenderShorts,
      targetSeconds: body.targetSeconds,
      burnCaptions: body.burnCaptions,
      status: "draft",
    })
    .returning();

  return created({ project });
});
