/**
 * Local render executor.
 *
 * Materialises every input the graph needs into a scratch directory, runs the
 * single-pass FFmpeg assembly, then writes the MP4 and poster frame back
 * through the storage driver. Inputs already on local disk are used in place
 * rather than copied, which is the common case in development and saves a
 * full copy of every scene image per render.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keys, storage } from "@/lib/providers/storage";
import { buildAss } from "@/lib/render/ass";
import { assemble, extractThumbnail } from "@/lib/render/ffmpeg";
import { renderMusicBed } from "@/lib/render/music";
import { captionPresetById } from "@/lib/studio/captions";
import { musicBedById } from "@/lib/studio/music";
import type { RenderJobSpec, RenderOutput } from "@/lib/studio/types";
import type { RenderExecutor, RenderProgress } from "./index";

export function createLocalExecutor(): RenderExecutor {
  return {
    kind: "local",

    async execute(spec: RenderJobSpec, onProgress: RenderProgress): Promise<RenderOutput> {
      const store = await storage();
      const dir = await mkdtemp(join(tmpdir(), `fvs-render-${spec.renderId}-`));

      try {
        await onProgress(5, "materialising", "Collecting scene assets");

        // `imageUrl` holds a storage key. Prefer the on-disk path when the
        // driver has one; only fall back to a read + write for remote objects.
        const scenePaths: string[] = [];
        for (const [i, scene] of spec.scenes.entries()) {
          const local = store.localPath(scene.imageUrl);
          if (local) {
            scenePaths.push(local);
          } else {
            const path = join(dir, `scene-${String(i).padStart(3, "0")}.png`);
            await writeFile(path, await store.get(scene.imageUrl));
            scenePaths.push(path);
          }
        }

        let narrationPath = store.localPath(spec.audioUrl);
        if (!narrationPath) {
          narrationPath = join(dir, "narration.wav");
          await writeFile(narrationPath, await store.get(spec.audioUrl));
        }

        await onProgress(14, "music", "Generating music bed");
        let musicPath: string | null = null;
        const bed = musicBedById(spec.musicBedId);
        if (spec.musicBedId && bed.id !== "none") {
          musicPath = join(dir, "music.wav");
          // A tail beyond the narration keeps the bed's fade-out intact.
          await writeFile(musicPath, renderMusicBed(bed, spec.durationMs + 2_000));
        }

        await onProgress(20, "captions", "Building caption track");

        // Title cards ride in the same ASS file as the captions, so an ASS
        // file is needed whenever either is present — a project with captions
        // switched off can still carry a title card.
        const titleCards = spec.scenes
          .filter((s) => s.onScreenText && s.onScreenText.trim().length > 0)
          .map((s) => ({ startMs: s.startMs, endMs: s.endMs, text: s.onScreenText! }));

        const wantsCaptions = spec.burnCaptions && spec.cues.length > 0;
        let assPath: string | null = null;
        if (wantsCaptions || titleCards.length > 0) {
          assPath = join(dir, "captions.ass");
          await writeFile(
            assPath,
            buildAss(spec.cues, {
              preset: captionPresetById(spec.captionPresetId),
              width: spec.width,
              height: spec.height,
              durationMs: spec.durationMs,
              titleCards,
              includeCaptions: wantsCaptions,
            }),
            "utf8",
          );
        }

        await onProgress(24, "encoding", "Starting encode");
        const outputPath = join(dir, "output.mp4");
        const result = await assemble({
          spec,
          scenePaths,
          narrationPath,
          musicPath,
          assPath,
          outputPath,
          onProgress: (percent, message) => {
            // FFmpeg's 0–100 maps onto the 25–92 band of overall progress.
            void onProgress(25 + Math.round(percent * 0.67), "encoding", message);
          },
        });

        await onProgress(93, "thumbnail", "Extracting poster frame");
        const thumbPath = join(dir, "thumb.jpg");
        let thumbnailKey: string | null = keys.renderThumb(spec.projectId, spec.renderId);
        try {
          await extractThumbnail(outputPath, thumbPath, result.durationMs);
          const { readFile } = await import("node:fs/promises");
          await store.put(thumbnailKey, await readFile(thumbPath), "image/jpeg");
        } catch (err) {
          // A missing poster frame is cosmetic; never fail a good render for it.
          console.warn("[render] thumbnail extraction failed", err);
          thumbnailKey = null;
        }

        await onProgress(96, "uploading", "Storing video");
        const videoKey = keys.renderVideo(spec.projectId, spec.renderId);
        const { readFile } = await import("node:fs/promises");
        await store.put(videoKey, await readFile(outputPath), "video/mp4");

        await onProgress(100, "done", "Render complete");

        return {
          videoKey,
          thumbnailKey,
          durationMs: result.durationMs,
          sizeBytes: result.sizeBytes,
          width: spec.width,
          height: spec.height,
          encodeMs: result.encodeMs,
          logTail: result.logTail,
        };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
