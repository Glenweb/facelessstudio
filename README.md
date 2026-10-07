# Faceless Video Studio

Turn a prompt or a script into a narrated faceless video: script, scenes,
voiceover, word-timed captions, music and render — one pipeline, built for
YouTubers, TikTok creators and marketers who publish on a schedule.

Built by **GMK Media Ltd**.

```bash
npm install
npm run dev
```

→ <http://localhost:3000> — then sign up at `/signup`.

**No `.env` needed.** With no keys the app runs in *Local Studio mode*:
embedded Postgres, a local script engine, procedural scene art, an in-process
preview voice, and real FFmpeg encoding. The complete pipeline — prompt →
script → scenes → voiceover → MP4 → YouTube payload — works offline.

Only requirement beyond Node 20.9+: `ffmpeg` and `ffprobe` on `PATH`.

```bash
npm run doctor   # which mode each capability is in
npm run smoke    # drive the whole pipeline and assert the output (~90s)
```

## What it does

1. **Prompt or script in.** A topic becomes a structured script with a hook,
   beats, a call to action and YouTube metadata. A pasted script is never
   rewritten — only broken into scenes.
2. **Twelve niche style templates.** Each sets colour grade, art direction,
   caption preset, Ken Burns amount, transition, music bed, cut rhythm *and*
   narration direction together.
3. **Scene timeline.** Edit any scene, re-roll any visual individually.
4. **Eight voices**, each with its own speaking rate. Scenes are re-timed
   against the finished audio, so a cut always lands on a word.
5. **Six caption presets** rendered as ASS and burned in by libass, with
   per-word karaoke highlighting.
6. **One render, both ratios.** 1920×1080 and 1080×1920 from the same
   timeline, captions re-laid out per frame rather than scaled. Music
   sidechain-ducked under narration, mix normalised to −14 LUFS.
7. **Publish** to YouTube with the synthetic-content disclosure set
   automatically, or download the MP4.
8. **Credits** metered per operation, quoted before you commit, refunded on
   failure, itemised in a ledger.

## Verified, not asserted

Measured in this repository:

| | |
| --- | --- |
| A/V sync | **7 ms** drift on a 41.6 s render — under a quarter of a frame |
| Delivery loudness | **−14.1 LUFS / −1.5 dBTP**, on YouTube's target |
| Render compute | **£0.0013** per finished minute (2 vCPU Railway container) |
| Encode throughput | 1.15× realtime at 1080p |
| Gross margin | **53%** on a 1-minute, 10-scene, 2-variant video |

`npm run smoke` re-checks the pipeline claims end to end.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind 4 · Drizzle · Postgres
(Neon / PGlite) · FFmpeg · Anthropic Claude · Google AI Studio · ElevenLabs ·
Cloudflare R2 · Stripe · YouTube Data API v3

Every external dependency sits behind an interface with a real local
implementation, so each can be switched on independently when it earns its
cost. `src/lib/env.ts` is the only place that decides.

## Docs

| | |
| --- | --- |
| [Product requirements](docs/01-product-requirements.md) | Who it is for, what v1 does, what it deliberately does not |
| [Architecture](docs/02-architecture.md) | Shape, provider pattern, render flow, and why each decision went the way it did |
| [Data model](docs/03-data-model.md) | Every table and column, and the reasoning behind the awkward ones |
| [API contract](docs/04-api-contract.md) | Every endpoint, error codes, and a curl walkthrough |
| [Competitive benchmark](docs/05-benchmark-vid-ai.md) | Measured cost per minute, caption quality, templates — and what still needs verifying |
| [Runbook](docs/06-runbook.md) | Deploying, going live one key at a time, troubleshooting |

## Layout

```
src/app/          pages and API route handlers
src/lib/
  providers/      llm · image · tts · storage · render · youtube · billing
  render/         ASS captions · music synthesis · FFmpeg graph
  services/       pipeline logic; the only place that spends credits
  studio/         styles · voices · captions · music · pricing
services/
  render-node/    Railway FFmpeg service + Dockerfile
  worker/         standalone render worker
scripts/          db-push · db-seed · doctor · smoke-pipeline
```
