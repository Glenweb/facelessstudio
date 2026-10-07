/**
 * Scene visuals.
 *
 * `live`  — Google AI Studio (Gemini) image generation, the same wiring the
 *           higgsfield-video project already uses.
 * `local` — procedural cinematic backdrops composed by FFmpeg from the style
 *           template's palette. These are not placeholder grey boxes: they are
 *           real, varied, style-matched frames that look correct under Ken
 *           Burns motion and burned-in captions, so the whole pipeline can be
 *           developed and demoed without an image budget.
 */
import { modes } from "@/lib/env";

export interface ImageRequest {
  prompt: string;
  styleId: string;
  width: number;
  height: number;
  /** Stable seed so a given scene re-renders identically until regenerated. */
  seed: number;
}

export interface ImageResult {
  png: Buffer;
  provider: string;
}

export interface ImageProvider {
  readonly kind: "gemini" | "local";
  generate(req: ImageRequest): Promise<ImageResult>;
}

let cached: ImageProvider | undefined;

export async function imageProvider(): Promise<ImageProvider> {
  if (cached) return cached;
  cached =
    modes.image === "live"
      ? (await import("./gemini")).createGeminiProvider()
      : (await import("./local")).createLocalImageProvider();
  return cached;
}
