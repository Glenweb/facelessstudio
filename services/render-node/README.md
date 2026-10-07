# FFmpeg render node

A standalone encoder for Railway. The web app dispatches jobs here when
`RENDER_NODE_URL` is set; with it unset the app encodes locally using the very
same code, so behaviour does not change with deployment topology.

## Why it exists

Encoding is CPU-bound and bursty. Running it inside the Next.js server works
and is the right default for development, but it couples render throughput to
web capacity and runs headlong into serverless execution limits on a long-form
video. Moving it here lets renders scale on their own.

## Deploy

```bash
# From the repository root — the build context must be the root, because the
# node imports src/lib rather than keeping its own copy of the pipeline.
docker build -f services/render-node/Dockerfile -t fvs-render-node .
```

On Railway: point the service at this repository, set the Dockerfile path to
`services/render-node/Dockerfile` and the build context to the repository root.

### Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `RENDER_NODE_TOKEN` | strongly recommended | Shared secret. Requests must send `Authorization: Bearer <token>`. Without it the node accepts anything that can reach it. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | yes in production | Where scene images and narration are read from, and the finished MP4 written. Must be the same bucket the app uses. |
| `RENDER_CONCURRENCY` | no (default 1) | Simultaneous encodes. Encoding saturates the CPU, so raise this only with more vCPU. |
| `PORT` | no (default 8080) | Railway sets this. |

Then set `RENDER_NODE_URL` and `RENDER_NODE_TOKEN` on the web app and renders
move over with no code change.

## API

```
GET  /health     -> { status, running, queued, maxConcurrent, capabilities }
POST /jobs       <- { spec: RenderJobSpec }   -> 202 { jobId }
GET  /jobs/:id   -> { status, progress, stage, message, error?, output? }
```

`output` carries the storage keys and encode timings the app records against
the render row.

## Scaling notes

- One vCPU encodes roughly 0.5–0.8× realtime at 1080p with the `veryfast`
  preset, so a 10-minute video takes 12–20 minutes on a single core. Scale
  horizontally with more instances rather than raising `RENDER_CONCURRENCY`
  past the vCPU count.
- Jobs are held in memory. A restart loses in-flight work, which is safe: the
  app's queue reclaims renders whose worker went quiet and retries them.
