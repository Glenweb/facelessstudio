/**
 * Railway render-node executor.
 *
 * Submits the job, then polls for progress. The node streams the finished MP4
 * back to R2 itself using the same storage keys this app would have used, so
 * the two execution modes are indistinguishable to everything downstream.
 */
import { env } from "@/lib/env";
import type { RenderJobSpec, RenderOutput } from "@/lib/studio/types";
import type { RenderExecutor, RenderProgress } from "./index";

interface NodeJobStatus {
  status: "queued" | "running" | "succeeded" | "failed";
  progress?: number;
  stage?: string;
  message?: string;
  error?: string;
  output?: RenderOutput;
}

const POLL_INTERVAL_MS = 2_000;
/** A 20-minute ceiling; far above a long-form render, below a stuck worker. */
const POLL_TIMEOUT_MS = 20 * 60 * 1_000;

export function createRailwayExecutor(): RenderExecutor {
  const base = env.renderNodeUrl!.replace(/\/$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.renderNodeToken) headers.authorization = `Bearer ${env.renderNodeToken}`;

  return {
    kind: "railway",

    async execute(spec: RenderJobSpec, onProgress: RenderProgress): Promise<RenderOutput> {
      const submit = await fetch(`${base}/jobs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ spec }),
      });
      if (!submit.ok) {
        throw new Error(
          `Render node rejected the job (${submit.status}): ${(await submit.text()).slice(0, 300)}`,
        );
      }
      const { jobId } = (await submit.json()) as { jobId: string };
      await onProgress(5, "queued", "Queued on the render node");

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let lastProgress = 5;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

        const res = await fetch(`${base}/jobs/${jobId}`, { headers });
        if (!res.ok) {
          // A single bad poll is usually a cold start or a redeploy; keep going.
          continue;
        }
        const status = (await res.json()) as NodeJobStatus;

        if (typeof status.progress === "number" && status.progress > lastProgress) {
          lastProgress = status.progress;
          await onProgress(status.progress, status.stage ?? "encoding", status.message ?? "");
        }

        if (status.status === "succeeded" && status.output) {
          await onProgress(100, "done", "Render complete");
          return status.output;
        }
        if (status.status === "failed") {
          throw new Error(status.error ?? "The render node reported a failure.");
        }
      }

      throw new Error("Timed out waiting for the render node.");
    },
  };
}
