/**
 * FFmpeg render node.
 *
 * A standalone HTTP service for Railway. It accepts a RenderJobSpec, runs the
 * exact same assembly code the web app runs locally (imported, not copied —
 * a divergence between the two would mean a video that looks different
 * depending on where it was encoded), and reports progress by polling.
 *
 * It reads scene images and narration from, and writes the finished MP4 to,
 * the same Cloudflare R2 bucket the app uses, so the app only ever needs the
 * returned storage keys.
 *
 * Endpoints
 *   GET  /health      — liveness and capability report
 *   POST /jobs        — { spec } -> { jobId }
 *   GET  /jobs/:id    — status, progress and output
 *
 * Auth: if RENDER_NODE_TOKEN is set, every request must carry
 * `Authorization: Bearer <token>`. It is a shared secret between this node
 * and the app, not a user credential.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { capabilityReport } from "../../src/lib/env";
import { createLocalExecutor } from "../../src/lib/providers/render/local";
import type { RenderJobSpec, RenderOutput } from "../../src/lib/studio/types";

interface Job {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  stage: string;
  message: string;
  error?: string;
  output?: RenderOutput;
  createdAt: number;
}

const PORT = Number(process.env.PORT ?? 8080);
const TOKEN = process.env.RENDER_NODE_TOKEN?.trim();
/** Finished jobs are dropped after an hour; the app has long since polled. */
const JOB_TTL_MS = 60 * 60 * 1_000;
/** Encoding is CPU-bound, so running several at once just makes all of them slow. */
const MAX_CONCURRENT = Number(process.env.RENDER_CONCURRENCY ?? 1);

const jobs = new Map<string, Job>();
const queue: string[] = [];
const specs = new Map<string, RenderJobSpec>();
let running = 0;

const json = (res: ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
};

function authorised(req: IncomingMessage): boolean {
  if (!TOKEN) return true;
  const header = req.headers.authorization ?? "";
  return header === `Bearer ${TOKEN}`;
}

async function readBody(req: IncomingMessage, limitBytes = 8 * 1024 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    // A spec is tens of kilobytes; anything near the limit is not a spec.
    if (total > limitBytes) throw new Error("Request body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function pump(): void {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const id = queue.shift()!;
    const job = jobs.get(id);
    const spec = specs.get(id);
    if (!job || !spec) continue;

    running++;
    job.status = "running";
    job.stage = "starting";

    void (async () => {
      try {
        const executor = createLocalExecutor();
        job.output = await executor.execute(spec, (percent, stage, message) => {
          job.progress = percent;
          job.stage = stage;
          job.message = message;
        });
        job.status = "succeeded";
        job.progress = 100;
        job.stage = "done";
        console.log(`[node] ${id} succeeded in ${job.output.encodeMs}ms`);
      } catch (err) {
        job.status = "failed";
        job.error = err instanceof Error ? err.message : String(err);
        console.error(`[node] ${id} failed:`, job.error);
      } finally {
        running--;
        specs.delete(id);
        pump();
      }
    })();
  }
}

/** Drop finished jobs so a long-lived node does not grow without bound. */
setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff && (job.status === "succeeded" || job.status === "failed")) {
      jobs.delete(id);
    }
  }
}, 5 * 60 * 1_000).unref();

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/health") {
      json(res, 200, {
        status: "ok",
        running,
        queued: queue.length,
        maxConcurrent: MAX_CONCURRENT,
        capabilities: capabilityReport(),
      });
      return;
    }

    if (!authorised(req)) {
      json(res, 401, { error: "Unauthorised" });
      return;
    }

    if (req.method === "POST" && url.pathname === "/jobs") {
      try {
        const body = JSON.parse(await readBody(req)) as { spec?: RenderJobSpec };
        if (!body.spec?.renderId || !Array.isArray(body.spec.scenes)) {
          json(res, 400, { error: "Body must be { spec: RenderJobSpec }" });
          return;
        }
        const id = randomUUID();
        jobs.set(id, {
          id,
          status: "queued",
          progress: 0,
          stage: "queued",
          message: "",
          createdAt: Date.now(),
        });
        specs.set(id, body.spec);
        queue.push(id);
        console.log(`[node] queued ${id} for render ${body.spec.renderId}`);
        pump();
        json(res, 202, { jobId: id });
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : "Bad request" });
      }
      return;
    }

    const match = /^\/jobs\/([\w-]+)$/.exec(url.pathname);
    if (req.method === "GET" && match) {
      const job = jobs.get(match[1]!);
      if (!job) {
        json(res, 404, { error: "Unknown job" });
        return;
      }
      json(res, 200, {
        status: job.status,
        progress: job.progress,
        stage: job.stage,
        message: job.message,
        error: job.error,
        output: job.output,
      });
      return;
    }

    json(res, 404, { error: "Not found" });
  })();
});

server.listen(PORT, () => {
  console.log(`[node] FFmpeg render node listening on :${PORT}`);
  console.log(`[node] auth ${TOKEN ? "enabled" : "DISABLED — set RENDER_NODE_TOKEN"}`);
  console.log(`[node] concurrency ${MAX_CONCURRENT}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[node] ${signal} received, closing`);
    server.close(() => process.exit(0));
  });
}
