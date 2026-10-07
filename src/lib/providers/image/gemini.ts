/**
 * Google AI Studio (Gemini) image generation.
 *
 * Uses the generateContent endpoint with an image-capable model and pulls the
 * inline image part out of the response. This mirrors the wiring already used
 * in higgsfield-video so a single GOOGLE_AI_STUDIO_API_KEY serves both.
 *
 * The aspect ratio is requested in the prompt rather than as a parameter
 * because the image models accept ratio hints inconsistently; whatever comes
 * back is normalised to the exact target dimensions by FFmpeg, so a mismatch
 * costs a crop rather than a failed render.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { env } from "@/lib/env";
import { resolveBinary } from "@/lib/render/binary";
import { styleById } from "@/lib/studio/styles";
import type { ImageProvider, ImageRequest, ImageResult } from "./index";

const run = promisify(execFile);

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { inlineData?: { mimeType?: string; data?: string }; text?: string }[];
    };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export function createGeminiProvider(): ImageProvider {
  return {
    kind: "gemini",

    async generate(req: ImageRequest): Promise<ImageResult> {
      const style = styleById(req.styleId);
      const ratio = req.width >= req.height ? "16:9 landscape" : "9:16 vertical";

      const prompt = [
        req.prompt,
        `Aspect ratio: ${ratio}.`,
        `Negative direction — avoid: ${style.artAvoid}.`,
        "No text, letters, words, captions, logos or watermarks anywhere in the image.",
      ].join(" ");

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiImageModel}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": env.googleAiKey!,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"], candidateCount: 1 },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Gemini image generation failed (${res.status}): ${text.slice(0, 400)}`);
      }

      const body = (await res.json()) as GeminiResponse;
      if (body.promptFeedback?.blockReason) {
        throw new Error(`Gemini blocked the prompt: ${body.promptFeedback.blockReason}`);
      }

      const part = body.candidates
        ?.flatMap((c) => c.content?.parts ?? [])
        .find((p) => p.inlineData?.data);

      if (!part?.inlineData?.data) {
        throw new Error(
          `Gemini returned no image. finishReason=${body.candidates?.[0]?.finishReason ?? "unknown"}`,
        );
      }

      const raw = Buffer.from(part.inlineData.data, "base64");
      return { png: await normalise(raw, req.width, req.height), provider: `gemini:${env.geminiImageModel}` };
    },
  };
}

/**
 * Force the returned image to the exact frame size. Scale to cover, then
 * centre-crop — letterboxing a generated still inside a faceless video looks
 * like a bug, and cropping loses less than padding does.
 */
async function normalise(input: Buffer, width: number, height: number): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "fvs-gem-"));
  const src = join(dir, "in.bin");
  const out = join(dir, "out.png");
  try {
    await writeFile(src, input);
    await run(await resolveBinary("ffmpeg"), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      src,
      "-vf",
      `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=rgb24`,
      "-frames:v",
      "1",
      "-update",
      "1",
      out,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
