/**
 * Executable DDL.
 *
 * Idempotent and dialect-identical for Neon and PGlite, applied at boot by
 * `ensureSchema()`. Kept as plain SQL rather than a drizzle-kit journal so a
 * fresh clone needs no migration step before `npm run dev` works — which is
 * the difference between a repo that runs and a repo that needs a README
 * ritual. `drizzle.config.ts` is still present for generating versioned
 * migrations against a real Neon branch.
 */
export const DDL_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
     id              text PRIMARY KEY,
     email           text NOT NULL,
     password_hash   text NOT NULL,
     name            text NOT NULL,
     plan            text NOT NULL DEFAULT 'free',
     credits_balance double precision NOT NULL DEFAULT 0,
     created_at      timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email)`,

  `CREATE TABLE IF NOT EXISTS projects (
     id                 text PRIMARY KEY,
     user_id            text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     title              text NOT NULL,
     source_type        text NOT NULL DEFAULT 'prompt',
     source_text        text NOT NULL DEFAULT '',
     style_id           text NOT NULL,
     voice_id           text NOT NULL,
     caption_preset_id  text NOT NULL,
     music_bed_id       text,
     aspect_ratio       text NOT NULL DEFAULT '16:9',
     also_render_shorts boolean NOT NULL DEFAULT false,
     target_seconds     integer NOT NULL DEFAULT 60,
     burn_captions      boolean NOT NULL DEFAULT true,
     status             text NOT NULL DEFAULT 'draft',
     created_at         timestamptz NOT NULL DEFAULT now(),
     updated_at         timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS projects_user_idx ON projects (user_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS scripts (
     id                text PRIMARY KEY,
     project_id        text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     version           integer NOT NULL DEFAULT 1,
     title             text NOT NULL,
     hook              text NOT NULL DEFAULT '',
     body              text NOT NULL DEFAULT '',
     call_to_action    text NOT NULL DEFAULT '',
     seo_title         text NOT NULL DEFAULT '',
     seo_description   text NOT NULL DEFAULT '',
     tags              jsonb NOT NULL DEFAULT '[]'::jsonb,
     word_count        integer NOT NULL DEFAULT 0,
     estimated_seconds integer NOT NULL DEFAULT 0,
     generator         text NOT NULL DEFAULT 'local',
     created_at        timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS scripts_project_idx ON scripts (project_id, version)`,

  `CREATE TABLE IF NOT EXISTS scenes (
     id             text PRIMARY KEY,
     project_id     text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     idx            integer NOT NULL,
     narration      text NOT NULL DEFAULT '',
     on_screen_text text,
     visual_prompt  text NOT NULL DEFAULT '',
     shot           text,
     image_key      text,
     image_status   text NOT NULL DEFAULT 'pending',
     image_provider text,
     start_ms       integer NOT NULL DEFAULT 0,
     end_ms         integer NOT NULL DEFAULT 0,
     motion         text NOT NULL DEFAULT 'in',
     created_at     timestamptz NOT NULL DEFAULT now(),
     updated_at     timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS scenes_project_idx_unique ON scenes (project_id, idx)`,

  `CREATE TABLE IF NOT EXISTS voiceovers (
     id          text PRIMARY KEY,
     project_id  text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     voice_id    text NOT NULL,
     audio_key   text NOT NULL,
     duration_ms integer NOT NULL DEFAULT 0,
     words       jsonb NOT NULL DEFAULT '[]'::jsonb,
     mode        text NOT NULL DEFAULT 'local',
     created_at  timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS voiceovers_project_idx ON voiceovers (project_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS renders (
     id               text PRIMARY KEY,
     project_id       text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     status           text NOT NULL DEFAULT 'queued',
     aspect_ratio     text NOT NULL,
     width            integer NOT NULL,
     height           integer NOT NULL,
     fps              integer NOT NULL DEFAULT 30,
     spec             jsonb,
     cues             jsonb NOT NULL DEFAULT '[]'::jsonb,
     progress         integer NOT NULL DEFAULT 0,
     stage            text NOT NULL DEFAULT 'queued',
     video_key        text,
     thumbnail_key    text,
     duration_ms      integer NOT NULL DEFAULT 0,
     size_bytes       integer NOT NULL DEFAULT 0,
     encode_ms        integer NOT NULL DEFAULT 0,
     credits_charged  double precision NOT NULL DEFAULT 0,
     error            text,
     attempts         integer NOT NULL DEFAULT 0,
     claimed_at       timestamptz,
     started_at       timestamptz,
     finished_at      timestamptz,
     created_at       timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS renders_queue_idx ON renders (status, created_at)`,
  `CREATE INDEX IF NOT EXISTS renders_project_idx ON renders (project_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS render_events (
     id         text PRIMARY KEY,
     render_id  text NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
     stage      text NOT NULL,
     progress   integer NOT NULL DEFAULT 0,
     message    text NOT NULL DEFAULT '',
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS render_events_render_idx ON render_events (render_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS usage_credits (
     id            text PRIMARY KEY,
     user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     delta         double precision NOT NULL,
     balance_after double precision NOT NULL,
     operation     text NOT NULL,
     reference_id  text,
     note          text NOT NULL DEFAULT '',
     created_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS usage_credits_user_idx ON usage_credits (user_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS youtube_accounts (
     id            text PRIMARY KEY,
     user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     channel_id    text,
     channel_title text,
     access_token  text NOT NULL,
     refresh_token text,
     expires_at    timestamptz,
     scope         text NOT NULL DEFAULT '',
     created_at    timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS youtube_accounts_user_unique ON youtube_accounts (user_id)`,

  `CREATE TABLE IF NOT EXISTS publications (
     id                   text PRIMARY KEY,
     user_id              text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     project_id           text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     render_id            text NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
     provider             text NOT NULL DEFAULT 'youtube',
     status               text NOT NULL DEFAULT 'pending',
     video_id             text,
     url                  text,
     privacy              text NOT NULL DEFAULT 'private',
     synthetic_disclosure boolean NOT NULL DEFAULT true,
     payload              jsonb,
     error                text,
     created_at           timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS publications_project_idx ON publications (project_id, created_at)`,
];
