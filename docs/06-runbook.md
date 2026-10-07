# Runbook

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. No `.env`, no database, no API keys.

Sign up at `/signup`. Or seed a demo account — **before** starting the dev
server, since the embedded database takes one writer at a time:

```bash
npm run db:seed     # demo@gmkmedia.test / faceless-demo, 5,000 credits
npm run dev
```

Run it with the server already up and it exits immediately saying so,
rather than hanging.

### Requirements

- Node 20.9+
- `ffmpeg` and `ffprobe` on `PATH` — the only non-npm dependency
- Fonts: DejaVu and Liberation families. Present on most Linux images; on
  Debian/Ubuntu `apt-get install fonts-dejavu-core fonts-liberation`.
  Without them libass silently substitutes and captions look wrong.

```bash
npm run doctor      # which mode every capability is in, plus binary checks
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server and in-process render worker |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run smoke` | Full pipeline end to end, with assertions. ~90 s |
| `npm run doctor` | Capability and dependency report |
| `npm run db:push` | Apply the schema (also happens at boot) |
| `npm run db:seed` | Create or top up the demo account |
| `npm run db:reset` | Wipe the embedded database and reseed |
| `npm run worker` | Standalone worker — requires a real `DATABASE_URL` |

## Going live, one provider at a time

Every key is independent. Add one, restart, check `npm run doctor`.

| Add | Upgrades |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude writes researched scripts and per-scene art direction |
| `GOOGLE_AI_STUDIO_API_KEY` | Gemini generates photoreal scene frames |
| `ELEVENLABS_API_KEY` | Broadcast voices; word timings become measured rather than constructed |
| `DATABASE_URL` | Neon Postgres instead of embedded PGlite |
| `R2_ACCOUNT_ID` + `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` | Cloudflare R2 instead of local files |
| `RENDER_NODE_URL` + `RENDER_NODE_TOKEN` | Encoding moves to the Railway node |
| `YOUTUBE_CLIENT_ID` + `YOUTUBE_CLIENT_SECRET` | Real publishing instead of dry runs |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Real payments instead of sandbox grants |

`AUTH_SECRET` is generated into `.data/auth-secret` if unset. **Set it
explicitly in production** — rotating it invalidates every session, which is
the point.

## Deploy

### Vercel

1. Import the repository. Build and output settings are detected.
2. Set `AUTH_SECRET`, `APP_URL`, `DATABASE_URL`, and whichever provider keys
   you want live.
3. The schema applies itself on first boot via `instrumentation.ts`.

With a real `DATABASE_URL` and more than one instance, set
`FVS_DISABLE_INPROCESS_WORKER=1` and run the worker separately, or every
instance will compete for the same queue. Competing is *safe* —
`FOR UPDATE SKIP LOCKED` prevents double-processing — but it wastes web
capacity on encoding.

### Neon

Create a project, copy the pooled connection string into `DATABASE_URL`.
Nothing else: `src/lib/db/ddl.ts` is idempotent and runs at boot.

### Cloudflare R2

Create a bucket, then an API token with Object Read & Write. Set the four
`R2_*` variables. If the bucket has a public domain, set `R2_PUBLIC_BASE_URL`
too; without it the app presigns URLs with a one-hour expiry.

### Railway render node

See [`services/render-node/README.md`](../services/render-node/README.md).
Build context must be the repository root — the node imports the same
pipeline code rather than keeping a copy.

### Stripe

Create three products matching the packs in `src/lib/studio/pricing.ts` and
set `STRIPE_PRICE_STARTER`, `_CREATOR` and `_STUDIO`. If you skip this, the
app builds inline prices from the same source, so a fresh Stripe account
works immediately.

Add a webhook endpoint at `<APP_URL>/api/billing/webhook` for
`checkout.session.completed` and set `STRIPE_WEBHOOK_SECRET`. Credits are
granted by the webhook, never by the browser returning to the success URL.

### YouTube

In Google Cloud: enable the YouTube Data API v3, create an OAuth client
(Web application), add `<APP_URL>/api/youtube/callback` as a redirect URI.
Set the three `YOUTUBE_*` variables.

Until the OAuth consent screen is verified, Google limits you to test users.
That is a Google review process, not a code change.

## Troubleshooting

**Render changes have no effect in dev.** The worker starts at boot from
`instrumentation.ts` and holds its module references; Turbopack's hot reload
does not reach it. Restart the dev server after changing anything under
`src/lib/render/` or `src/lib/providers/render/`. This cost real debugging
time once — a fixed title card kept rendering with the old code.

**A CLI script says the embedded database is already open.** Expected —
PGlite takes one writer, and `npm run dev` holds it. Stop the server, run the
script, start it again; or set `DATABASE_URL`, which has no such limit. To
create an account while the server is running, just sign up in the UI.

The guard matters because PGlite enforces single-writer by blocking inside
its WASM initialisation: no error, no timeout, and the event loop stalls so
a JS timer cannot even report it. Its own `postmaster.pid` records a
synthetic pid of `-42`, so the owning process records its real pid in
`.data/pgdata.lock` instead. A stale lock from a killed process is detected
and taken over automatically.

**A CLI script hangs anyway.** Something still holds the directory — most
often a script killed by `timeout`, whose node child outlives the wrapper.
Check with `ps aux | grep tsx`, kill it, and if the directory was killed
mid-write, `npm run db:reset` rebuilds it. The embedded database is
disposable by design.

**`npm run worker` refuses to start.** Same cause, reported up front:
without `DATABASE_URL` the dev server already holds the data directory.
Use `npm run dev` alone, or point at a real Postgres.

**Renders fail with an ffmpeg error.** Run `npm run doctor`. If both binaries
are present, the failing graph is in the render's `error` column and the tail
of FFmpeg's stderr is in it.

**Captions render in the wrong font.** libass substitutes silently when a
family is missing. Install the DejaVu and Liberation families.

**`no space left on device`.** Renders write to the OS temp directory and
clean up after themselves, but a crashed render can leave a `fvs-render-*`
directory behind. `rm -rf /tmp/fvs-*`.

**A render is stuck in `claimed`.** Its worker died. It is reclaimed
automatically after fifteen minutes, or on the next server boot via
`requeueOrphans()`.

**Credits look wrong.** `usage_credits` is append-only and
`balance_after` is written in the same transaction as the balance, so the
ledger reconstructs the balance exactly. If they disagree, the ledger is
right.

## Operational notes

- **Retries.** A render retries up to three times before failing. Each
  attempt increments `attempts`; the third failure refunds the charge.
- **Orphan recovery.** A job `claimed` or `running` with `claimed_at` older
  than fifteen minutes is reclaimed by the next worker to look.
- **Storage growth.** Nothing is deleted automatically. Scene images are
  roughly 2 MB each and renders 1–20 MB. Lifecycle rules on the R2 bucket
  keyed to `projects/` are the right place to manage this.
- **Encode throughput.** About 1.15× realtime per render at 1080p. One
  2 vCPU render node handles roughly 50 minutes of finished video an hour.
  Scale with more instances rather than raising `RENDER_CONCURRENCY` past the
  vCPU count — encoding already saturates about three cores.
