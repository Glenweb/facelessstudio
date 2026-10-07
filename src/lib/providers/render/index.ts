/**
 * Render execution.
 *
 * `local`   — run FFmpeg on this machine.
 * `railway` — POST the job to the FFmpeg render node and poll it.
 *
 * Both consume the same `RenderJobSpec`, so a render is byte-for-byte
 * reproducible wherever it runs. The local path is not a development
 * shortcut: it is the same code the render node runs, which is why
 * services/render-node imports from this directory rather than duplicating it.
 */
import { modes } from "@/lib/env";
import type { RenderJobSpec, RenderOutput } from "@/lib/studio/types";

export type RenderProgress = (percent: number, stage: string, message: string) => void | Promise<void>;

export interface RenderExecutor {
  readonly kind: "local" | "railway";
  execute(spec: RenderJobSpec, onProgress: RenderProgress): Promise<RenderOutput>;
}

let cached: RenderExecutor | undefined;

export async function renderExecutor(): Promise<RenderExecutor> {
  if (cached) return cached;
  cached =
    modes.render === "live"
      ? (await import("./railway")).createRailwayExecutor()
      : (await import("./local")).createLocalExecutor();
  return cached;
}
