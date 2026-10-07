/**
 * Render toolchain self-test.
 *
 * Runs every stage of the render pipeline in isolation and reports exactly
 * which one fails and why. Touches no database and needs no server, so it can
 * be run while `npm run dev` is up — which matters, because the embedded
 * database takes a single writer.
 *
 *   npm run selftest
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const G = "\u001b[32m";
const R = "\u001b[31m";
const Y = "\u001b[33m";
const D = "\u001b[2m";
const X = "\u001b[0m";

let failed = 0;
let firstFailure: string | null = null;

async function step<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  process.stdout.write(`  ${label.padEnd(38)}`);
  const started = Date.now();
  try {
    const value = await fn();
    console.log(`${G}ok${X} ${D}${Date.now() - started}ms${X}`);
    return value;
  } catch (err) {
    console.log(`${R}FAILED${X}`);
    const message = err instanceof Error ? err.message : String(err);
    for (const line of message.split("\n").slice(0, 14)) {
      console.log(`${D}      ${line}${X}`);
    }
    failed++;
    firstFailure ??= label;
    return null;
  }
}

async function main(): Promise<void> {
  console.log("\nFaceless Video Studio — render self-test");
  console.log(`${D}  platform ${process.platform} ${process.arch} · node ${process.versions.node}${X}\n`);

  const dir = await mkdtemp(join(tmpdir(), "fvs-selftest-"));

  try {
    const { resolveBinary } = await import("../src/lib/render/binary");

    const ffmpeg = await step("ffmpeg binary", async () => {
      const cmd = await resolveBinary("ffmpeg");
      return cmd;
    });
    await step("ffprobe binary", () => resolveBinary("ffprobe"));

    // Everything below needs ffmpeg; stop rather than cascade confusing errors.
    if (!ffmpeg) {
      console.log(`\n${R}ffmpeg is missing — nothing else can run.${X}\n`);
      process.exit(1);
    }

    await step("bundled fonts", async () => {
      const { hasBundledFonts, resolveFontFile, BUNDLED_FONTS_DIR } = await import(
        "../src/lib/render/fonts"
      );
      if (!hasBundledFonts()) {
        throw new Error(
          `No fonts at ${BUNDLED_FONTS_DIR}.\nRun: git pull    (they are tracked in the repository)`,
        );
      }
      for (const family of ["DejaVu Sans", "DejaVu Serif", "Liberation Sans"]) {
        if (!resolveFontFile(family)) throw new Error(`Could not resolve a file for ${family}`);
      }
      return true;
    });

    const image = await step("procedural scene image", async () => {
      const { createLocalImageProvider } = await import("../src/lib/providers/image/local");
      const result = await createLocalImageProvider().generate({
        prompt: "self test",
        styleId: "dark-documentary",
        width: 640,
        height: 360,
        seed: 1234,
      });
      if (result.png.length < 1000) throw new Error(`Image is only ${result.png.length} bytes`);
      const path = join(dir, "scene.png");
      await writeFile(path, result.png);
      return path;
    });

    const voice = await step("local preview voice", async () => {
      const { createLocalTtsProvider } = await import("../src/lib/providers/tts/local");
      const result = await createLocalTtsProvider().synthesise({
        text: "This is a self test of the render pipeline. It should produce audio.",
        voiceId: "atlas",
      });
      if (result.durationMs < 500) throw new Error(`Audio is only ${result.durationMs}ms`);
      const path = join(dir, "voice.wav");
      await writeFile(path, result.wav);
      return { path, durationMs: result.durationMs, words: result.words };
    });

    const music = await step("music bed synthesis", async () => {
      const { renderMusicBed } = await import("../src/lib/render/music");
      const { musicBedById } = await import("../src/lib/studio/music");
      const wav = renderMusicBed(musicBedById("tension-drone"), 4000);
      const path = join(dir, "music.wav");
      await writeFile(path, wav);
      return path;
    });

    const ass = await step("caption track (ASS)", async () => {
      if (!voice) throw new Error("skipped — no voiceover");
      const { buildAss, groupIntoCues } = await import("../src/lib/render/ass");
      const { captionPresetById } = await import("../src/lib/studio/captions");
      const text = buildAss(groupIntoCues(voice.words, 4), {
        preset: captionPresetById("viral-bold"),
        width: 640,
        height: 360,
        durationMs: voice.durationMs,
        titleCards: [{ startMs: 0, endMs: 2000, text: "Self Test" }],
        includeCaptions: true,
      });
      if (!text.includes("Dialogue:")) throw new Error("ASS file contains no dialogue events");
      const path = join(dir, "captions.ass");
      await writeFile(path, text, "utf8");
      return path;
    });

    // The whole graph: Ken Burns, captions, title card, watermark, ducked
    // music, loudness normalisation. This is the step that catches a path or
    // font problem that the pieces above each survive on their own.
    const output = await step("full render (one scene)", async () => {
      if (!image || !voice) throw new Error("skipped — a prerequisite failed");
      const { assemble } = await import("../src/lib/render/ffmpeg");
      const path = join(dir, "out.mp4");
      const result = await assemble({
        spec: {
          renderId: "selftest",
          projectId: "selftest",
          title: "Self Test",
          aspectRatio: "16:9",
          width: 640,
          height: 360,
          fps: 24,
          styleId: "dark-documentary",
          captionPresetId: "viral-bold",
          burnCaptions: true,
          musicBedId: "tension-drone",
          musicGainDb: -24,
          scenes: [
            {
              index: 0,
              imageUrl: image,
              startMs: 0,
              endMs: voice.durationMs,
              motion: "in",
              onScreenText: "Self Test",
            },
          ],
          audioUrl: voice.path,
          durationMs: voice.durationMs,
          cues: [],
          watermark: "Faceless Video Studio",
        },
        scenePaths: [image],
        narrationPath: voice.path,
        musicPath: music,
        assPath: ass,
        outputPath: path,
      });
      if (result.sizeBytes < 2000) throw new Error(`Output is only ${result.sizeBytes} bytes`);
      return { path, result, expectedMs: voice.durationMs };
    });

    await step("output is a playable MP4", async () => {
      if (!output) throw new Error("skipped — the render failed");
      const { probeDurationMs } = await import("../src/lib/render/ffmpeg");
      const actual = await probeDurationMs(output.path);
      const drift = Math.abs(actual - output.expectedMs);
      if (actual < 500) throw new Error(`Duration reads as ${actual}ms`);
      if (drift > 600) {
        throw new Error(`Video is ${actual}ms but the narration is ${output.expectedMs}ms`);
      }
      console.log(
        `${D}      ${(actual / 1000).toFixed(2)}s · ${(output.result.sizeBytes / 1024).toFixed(0)} KB · ${drift}ms drift${X}`,
      );
      return true;
    });

    if (failed === 0) {
      console.log(
        `\n${G}  All stages passed.${X} The render pipeline works on this machine.\n`,
      );
    } else {
      console.log(
        `\n${R}  ${failed} stage(s) failed.${X} First failure: ${Y}${firstFailure}${X}`,
      );
      console.log(`${D}  Paste the output above and the failure can be fixed directly.${X}\n`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n${R}Self-test crashed:${X}`, err);
  process.exit(1);
});
