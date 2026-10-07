# Data model

One Postgres schema, identical on Neon and on the embedded PGlite database.
Executable DDL is `src/lib/db/ddl.ts`, applied at boot; `src/lib/db/schema.ts`
is the typed Drizzle surface over it.

```
users ──┬── projects ──┬── scripts        (versioned drafts)
        │              ├── scenes         (the timeline)
        │              ├── voiceovers     (audio + word timings)
        │              └── renders ───── render_events
        │                     └── publications
        ├── usage_credits                 (append-only ledger)
        └── youtube_accounts              (one per user)
```

Every child cascades from its parent, so deleting a project removes its
scripts, scenes, audio, renders and publication records in one statement.

## users

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | `usr_…` |
| `email` | text | Unique index |
| `password_hash` | text | `scrypt$N$r$p$salt$key` — Node's built-in scrypt, no native dependency |
| `name` | text | |
| `plan` | text | `free` renders carry a watermark; any purchase removes it |
| `credits_balance` | double precision | Denormalised running total; `usage_credits` is the source of truth |
| `created_at` | timestamptz | |

## projects

Holds the creative configuration — the choices made in the wizard — and the
pipeline status.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | `prj_…` |
| `user_id` | text FK | cascade |
| `title` | text | Replaced by the script's title once one is written |
| `source_type` | text | `prompt` or `script` |
| `source_text` | text | The original input, kept verbatim |
| `style_id` | text | Resolves against `STYLE_TEMPLATES` |
| `voice_id`, `caption_preset_id`, `music_bed_id` | text | Catalogue ids; `music_bed_id` nullable for no music |
| `aspect_ratio` | text | `16:9` · `9:16` · `1:1` |
| `also_render_shorts` | boolean | Queue the complementary ratio in the same job |
| `target_seconds` | integer | Drives the script's word budget |
| `burn_captions` | boolean | |
| `status` | text | `draft → scripted → storyboarded → voiced → rendering → ready` / `failed` |

Catalogue ids are stored as plain text rather than foreign keys because the
catalogues are code, not data. A style is a block of creative configuration
that ships with a release; putting it in a table would mean migrating content
on every tweak, and resolvers fall back to the first entry if an id ever
disappears.

## scripts

Versioned. Generating again appends a new row rather than overwriting, so a
draft is never lost to a re-roll.

| Column | Notes |
| --- | --- |
| `version` | Incremented per generation |
| `title`, `hook`, `body`, `call_to_action` | `body` is newline-separated beats; one line becomes one scene |
| `seo_title`, `seo_description`, `tags` | `tags` is `jsonb` |
| `word_count`, `estimated_seconds` | From the same prosody model the synthesiser uses, so the estimate matches the finished runtime |
| `generator` | `anthropic` or `local` — surfaced in the UI so a draft's provenance is never ambiguous |

## scenes

The timeline. Unique on `(project_id, idx)`.

| Column | Notes |
| --- | --- |
| `idx` | Zero-based position |
| `narration` | The words spoken over this scene — the only input to its duration |
| `on_screen_text` | Optional title card |
| `visual_prompt` | Sent to the image provider |
| `image_key` | Storage key, `…/scenes/000-r1.png`; the `rN` suffix is the re-roll revision |
| `image_status` | `pending → generating → ready` / `failed` |
| `image_provider` | e.g. `gemini:gemini-2.5-flash-image` or `local:procedural` |
| `start_ms`, `end_ms` | Zero until a voiceover exists, then derived from word timings |
| `motion` | Ken Burns direction, alternated by the planner so no two neighbours move alike |

Editing a scene's `visual_prompt` sets `image_status` back to `pending` but
keeps `image_key`, so the old frame stays visible in the timeline until a new
one is paid for.

## voiceovers

| Column | Notes |
| --- | --- |
| `audio_key` | 16-bit PCM WAV, ingested by FFmpeg with no transcode |
| `duration_ms` | Authoritative runtime for the whole project |
| `words` | `jsonb` array of `{ word, startMs, endMs }` — what the captions highlight against |
| `mode` | `live` (measured from ElevenLabs character alignment) or `local` (exact by construction) |

## renders

Also the job queue.

| Column | Notes |
| --- | --- |
| `status` | `queued → claimed → running → succeeded` / `failed` |
| `spec` | `jsonb` — the frozen, self-contained `RenderJobSpec`. A render stays reproducible after the project is edited |
| `cues` | `jsonb` — caption cues as grouped at enqueue time |
| `progress`, `stage` | Updated live by the worker |
| `video_key`, `thumbnail_key`, `duration_ms`, `size_bytes`, `encode_ms` | Outputs; `encode_ms` feeds the cost-per-minute benchmark |
| `credits_charged` | Zeroed on refund |
| `attempts`, `claimed_at` | Retry up to 3 times; a claim older than 15 minutes is reclaimed |

Indexed on `(status, created_at)` — the exact shape the claim query scans.

## render_events

Append-only progress log, read by the render screen's poll endpoint. Keeping
events in a table rather than a stream means progress survives a page reload
and a failed render leaves a trail to read afterwards.

## usage_credits

The credit ledger. Append-only; nothing updates or deletes a row.

| Column | Notes |
| --- | --- |
| `delta` | Positive to grant, negative to charge |
| `balance_after` | Balance at the moment it was written |
| `operation` | `script.generate` · `scene.image` · `voiceover.generate` · `render.encode` · `grant.signup` · `grant.purchase` · `grant.refund` |
| `reference_id` | The project, scene or render that caused it |

Charges are taken before work starts and refunded by the worker on failure,
so a customer never pays for a render that errored. Because the balance
update is a single conditional `UPDATE`, two concurrent charges cannot both
pass a check-then-write and overdraw.

## youtube_accounts

One per user, unique on `user_id`. Google issues a refresh token only on
first consent, so a refresh that returns none must never overwrite the stored
one — the callback preserves it explicitly.

## publications

An audit trail of every publish attempt, including dry runs.
`synthetic_disclosure` is recorded alongside the full `payload` that was sent,
so there is durable evidence that AI-generated uploads were declared.
