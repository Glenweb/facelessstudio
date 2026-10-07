/**
 * Drizzle schema.
 *
 * The same schema runs against Neon Postgres in production and PGlite
 * (embedded Postgres) locally, so there is one SQL dialect and one set of
 * types everywhere. The executable DDL lives in ./ddl.ts and is applied at
 * boot; this file is the typed query surface over it.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  AspectRatio,
  CaptionCue,
  ProjectStatus,
  RenderJobSpec,
  RenderStatus,
  SceneAssetStatus,
  WordTiming,
} from "@/lib/studio/types";
import type { CreditOperation } from "@/lib/studio/pricing";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    plan: text("plan").notNull().default("free"),
    /** Denormalised running balance; `usage_credits` is the source of truth. */
    creditsBalance: doublePrecision("credits_balance").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** The original user input — a topic prompt or a pasted script. */
    sourceType: text("source_type").notNull().default("prompt"),
    sourceText: text("source_text").notNull().default(""),
    styleId: text("style_id").notNull(),
    voiceId: text("voice_id").notNull(),
    captionPresetId: text("caption_preset_id").notNull(),
    musicBedId: text("music_bed_id"),
    aspectRatio: text("aspect_ratio").$type<AspectRatio>().notNull().default("16:9"),
    /** Also render the complementary ratio in the same job. */
    alsoRenderShorts: boolean("also_render_shorts").notNull().default(false),
    targetSeconds: integer("target_seconds").notNull().default(60),
    burnCaptions: boolean("burn_captions").notNull().default(true),
    status: text("status").$type<ProjectStatus>().notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_user_idx").on(t.userId, t.createdAt)],
);

export const scripts = pgTable(
  "scripts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    title: text("title").notNull(),
    hook: text("hook").notNull().default(""),
    body: text("body").notNull().default(""),
    callToAction: text("call_to_action").notNull().default(""),
    seoTitle: text("seo_title").notNull().default(""),
    seoDescription: text("seo_description").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    wordCount: integer("word_count").notNull().default(0),
    estimatedSeconds: integer("estimated_seconds").notNull().default(0),
    /** Which engine produced this draft: an Anthropic model id, or `local`. */
    generator: text("generator").notNull().default("local"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scripts_project_idx").on(t.projectId, t.version)],
);

export const scenes = pgTable(
  "scenes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    narration: text("narration").notNull().default(""),
    onScreenText: text("on_screen_text"),
    visualPrompt: text("visual_prompt").notNull().default(""),
    shot: text("shot"),
    imageKey: text("image_key"),
    imageStatus: text("image_status").$type<SceneAssetStatus>().notNull().default("pending"),
    imageProvider: text("image_provider"),
    /** Narration timing, filled in once a voiceover exists. */
    startMs: integer("start_ms").notNull().default(0),
    endMs: integer("end_ms").notNull().default(0),
    motion: text("motion").notNull().default("in"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("scenes_project_idx_unique").on(t.projectId, t.idx)],
);

export const voiceovers = pgTable(
  "voiceovers",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    voiceId: text("voice_id").notNull(),
    audioKey: text("audio_key").notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    /** Word-level timings — what makes the burned-in captions frame-accurate. */
    words: jsonb("words").$type<WordTiming[]>().notNull().default([]),
    mode: text("mode").notNull().default("local"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("voiceovers_project_idx").on(t.projectId, t.createdAt)],
);

export const renders = pgTable(
  "renders",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").$type<RenderStatus>().notNull().default("queued"),
    aspectRatio: text("aspect_ratio").$type<AspectRatio>().notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    fps: integer("fps").notNull().default(30),
    /** Frozen job description — a render stays reproducible after edits. */
    spec: jsonb("spec").$type<RenderJobSpec>(),
    cues: jsonb("cues").$type<CaptionCue[]>().notNull().default([]),
    progress: integer("progress").notNull().default(0),
    stage: text("stage").notNull().default("queued"),
    videoKey: text("video_key"),
    thumbnailKey: text("thumbnail_key"),
    durationMs: integer("duration_ms").notNull().default(0),
    sizeBytes: integer("size_bytes").notNull().default(0),
    encodeMs: integer("encode_ms").notNull().default(0),
    creditsCharged: doublePrecision("credits_charged").notNull().default(0),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    /** Set when a worker takes the job; lets a crashed job be reclaimed. */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("renders_queue_idx").on(t.status, t.createdAt),
    index("renders_project_idx").on(t.projectId, t.createdAt),
  ],
);

export const renderEvents = pgTable(
  "render_events",
  {
    id: text("id").primaryKey(),
    renderId: text("render_id")
      .notNull()
      .references(() => renders.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    progress: integer("progress").notNull().default(0),
    message: text("message").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("render_events_render_idx").on(t.renderId, t.createdAt)],
);

/**
 * Append-only credit ledger. Every grant and every charge lands here, and
 * `users.credits_balance` is maintained in the same transaction.
 */
export const usageCredits = pgTable(
  "usage_credits",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Positive for grants and refunds, negative for consumption. */
    delta: doublePrecision("delta").notNull(),
    balanceAfter: doublePrecision("balance_after").notNull(),
    operation: text("operation").$type<CreditOperation | "grant.signup" | "grant.purchase" | "grant.refund">().notNull(),
    referenceId: text("reference_id"),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_credits_user_idx").on(t.userId, t.createdAt)],
);

export const youtubeAccounts = pgTable(
  "youtube_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channelId: text("channel_id"),
    channelTitle: text("channel_title"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scope: text("scope").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("youtube_accounts_user_unique").on(t.userId)],
);

export const publications = pgTable(
  "publications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    renderId: text("render_id")
      .notNull()
      .references(() => renders.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("youtube"),
    status: text("status").notNull().default("pending"),
    videoId: text("video_id"),
    url: text("url"),
    privacy: text("privacy").notNull().default("private"),
    /**
     * YouTube requires creators to disclose realistic synthetic or altered
     * media. We always set it for AI-generated visuals and record what we sent.
     */
    syntheticDisclosure: boolean("synthetic_disclosure").notNull().default(true),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("publications_project_idx").on(t.projectId, t.createdAt)],
);

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  credits: many(usageCredits),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  scripts: many(scripts),
  scenes: many(scenes),
  voiceovers: many(voiceovers),
  renders: many(renders),
}));

export const scenesRelations = relations(scenes, ({ one }) => ({
  project: one(projects, { fields: [scenes.projectId], references: [projects.id] }),
}));

export const rendersRelations = relations(renders, ({ one, many }) => ({
  project: one(projects, { fields: [renders.projectId], references: [projects.id] }),
  events: many(renderEvents),
}));

export const schema = {
  users,
  projects,
  scripts,
  scenes,
  voiceovers,
  renders,
  renderEvents,
  usageCredits,
  youtubeAccounts,
  publications,
  usersRelations,
  projectsRelations,
  scenesRelations,
  rendersRelations,
};

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Script = typeof scripts.$inferSelect;
export type Scene = typeof scenes.$inferSelect;
export type Voiceover = typeof voiceovers.$inferSelect;
export type Render = typeof renders.$inferSelect;
export type RenderEvent = typeof renderEvents.$inferSelect;
export type UsageCredit = typeof usageCredits.$inferSelect;
export type YoutubeAccount = typeof youtubeAccounts.$inferSelect;
export type Publication = typeof publications.$inferSelect;
