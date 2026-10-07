# Architecture

## Shape

One Next.js application on Vercel, one Postgres database, one object store,
and an optional encoder that can be moved off the web host without a code
change.

```
Browser
   │  JSON over fetch, httpOnly session cookie
   ▼
Next.js App Router (Vercel)
   ├── /app/(app)/*        React client pages: wizard, editor, library, billing
   ├── /app/api/*          Route handlers — parse, authorise, delegate, respond
   ├── /lib/services/*     Pipeline logic; the only place that spends credits
   ├── /lib/providers/*    One interface per capability, two drivers each
   ├── /lib/render/*       ASS captions, music synthesis, FFmpeg graph
   └── /lib/queue/worker   Claims render jobs from Postgres
            │
            ├── Anthropic Claude ....... script + art direction
            ├── Google AI Studio ....... scene visuals
            ├── ElevenLabs ............. narration + character timings
            ├── Neon Postgres .......... all state, and the render queue
            ├── Cloudflare R2 .......... customer files
            ├── Stripe ................. credit purchases
            └── YouTube Data API v3 .... publishing
                     │
                     ▼
            FFmpeg render node (Railway) — optional, same code
```

## The provider pattern

Every external dependency sits behind an interface with two implementations:

| Capability | `live` | `local` |
| --- | --- | --- |
| database | Neon Postgres via `node-postgres` | PGlite, embedded Postgres, `.data/pgdata` |
| llm | Claude, forced tool call for schema-valid JSON | Deterministic beat-structure writer |
| image | Gemini image generation | Parametric colour fields evaluated by FFmpeg `geq` |
| tts | ElevenLabs `with-timestamps` | In-process formant synthesiser |
| render | Railway render node | Local `ffmpeg` binary |
| storage | Cloudflare R2 over the S3 API | Filesystem, served by `/api/media` |
| youtube | Resumable upload | Dry run returning the exact request body |
| billing | Stripe Checkout + webhook | Sandbox ledger grant |

Selection happens once, lazily, in `src/lib/env.ts`, keyed only on whether
the relevant credentials are present. No call site branches on mode.

Two consequences worth stating plainly:

- **The local drivers are real implementations, not mocks.** The local voice
  produces audio whose word timings are exact by construction, and local
  renders are genuine H.264 files. The pipeline can be developed, demonstrated
  and load-tested with no vendor spend.
- **Going live is incremental.** Adding `ELEVENLABS_API_KEY` upgrades
  narration and changes nothing else.

## Request flow for a render

```
POST /api/projects/:id/renders
  → authorise, load project
  → buildRenderSpec()     freeze scenes, audio key, cues, dimensions
  → chargeCredits()       before any work, atomically
  → INSERT renders (status='queued', spec=…)
  → 201

worker loop (every 1.5s while idle)
  → UPDATE … SET status='claimed'
      WHERE id = (SELECT … WHERE status='queued'
                  ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
  → executor.execute(spec, onProgress)
      → materialise scene images and narration
      → synthesise the music bed to the exact length
      → build the ASS caption + title-card track
      → one FFmpeg pass: Ken Burns → transitions → captions → watermark
                         narration → sidechain duck → loudnorm
      → extract poster frame, write both to storage
  → UPDATE renders SET status='succeeded', video_key=…
  → on failure: retry up to 3 times, then refund and mark failed
```

### Why the queue lives in Postgres

A render takes minutes, which rules out doing it inside a request. A
dedicated queue (SQS, Redis) would be another service to run, pay for and
reason about for a workload measured in jobs per minute. `FOR UPDATE SKIP
LOCKED` gives safe multi-worker claiming in the database we already have, and
a job whose worker died is reclaimed after fifteen minutes rather than
wedging the queue.

### Why the worker runs in-process by default

PGlite is single-writer, so with the embedded database a second process could
not open the data directory at all. In-process is therefore the only thing
that *can* work locally — and it is also the correct default for a
single-instance deployment. With `DATABASE_URL` pointing at a real Postgres,
set `FVS_DISABLE_INPROCESS_WORKER=1` and run `npm run worker` to scale
rendering away from web traffic.

## Key design decisions

### Timing is derived from audio, never estimated

Scene boundaries come from the voiceover's word timings
(`src/lib/services/timing.ts`). Until narration exists, a project has
estimates; afterwards it has a timeline. This is why a cut always lands on a
word boundary and why measured A/V drift is 7 ms on a 41-second render.

The planner, not the language model, owns grouping. Grouping depends on the
*voice's* speaking rate and the *style's* cut rhythm — facts the model does
not have and should not be asked to guess.

### Captions are ASS, not `drawtext`

`drawtext` cannot measure or wrap text and has no per-word state. ASS through
libass gives real font metrics, outlines, shadows, wrapping and per-word
colour. Rather than ASS karaoke (`\k`) tags — which can only move secondary
colour to primary and leave every sung word highlighted — the generator emits
one Dialogue event per word-state. That costs more events and buys exact
control over active-word-only styles and scale pops.

Title cards go through the same file. They were briefly drawn with
`drawtext` and were silently clipped at both frame edges, because `drawtext`
neither measures nor wraps.

### One FFmpeg pass

Ken Burns, transitions, title cards, captions, watermark, ducking and
loudness normalisation are one filter graph. No intermediate files are
written or re-read, which is what keeps the render cost line in
[the benchmark](05-benchmark-vid-ai.md) where it is.

### Credits are charged before the work and refunded on failure

The balance update is a single conditional `UPDATE`, so two concurrent
charges cannot both pass an "enough credits?" check and overdraw. Every
movement appends to `usage_credits`, so the balance and the history always
reconcile.

## Folder layout

```
src/
  app/
    (app)/            authenticated pages, wrapped in AppShell
    api/              route handlers
    page.tsx          landing page
  components/         UI; `ui.tsx` is the shared kit
  lib/
    auth/             scrypt hashing, JWT session cookies, route guard
    client/           typed fetch wrapper and formatters
    credits/          the ledger — the only writer of balances
    db/               Drizzle schema, idempotent DDL, driver selection
    http/             response envelopes and handler wrappers
    providers/        llm · image · tts · storage · render · youtube · billing
    queue/            render worker
    render/           ass.ts · music.ts · ffmpeg.ts
    services/         studio.ts (pipeline), timing.ts, dimensions.ts
    studio/           styles, voices, captions, music, pricing, types
services/
  worker/             standalone worker entry
  render-node/        Railway FFmpeg service + Dockerfile
scripts/              db-push · db-seed · doctor · smoke-pipeline
docs/
```

## Deployment

| Piece | Where | Notes |
| --- | --- | --- |
| Web app | Vercel | `instrumentation.ts` applies DDL and starts the worker on boot |
| Database | Neon Postgres | Set `DATABASE_URL`; schema applies itself |
| Files | Cloudflare R2 | Zero egress, which matters when customers re-download renders |
| Encoder | Railway | Optional; set `RENDER_NODE_URL` to move renders off Vercel |

Vercel's execution limits are the reason the render node exists: a long-form
encode will outlast a serverless function. Route handlers that call providers
declare `maxDuration` individually.
