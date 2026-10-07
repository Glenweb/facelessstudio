/**
 * FFmpeg assembly.
 *
 * Builds one filter graph that does the whole job in a single pass: Ken Burns
 * motion per scene, style transitions between scenes, optional title cards,
 * burned-in ASS captions, a watermark, and an audio mix where the music bed is
 * sidechain-ducked by the narration and the result is loudness-normalised to
 * YouTube's -14 LUFS target.
 *
 * One pass matters commercially: this is the step that runs on every render,
 * and the cost-per-minute line in docs/05-benchmark-vid-ai.md assumes CPU-only
 * FFmpeg with no intermediate files to write and re-read.
 */
import { execFile, spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { styleById, type TransitionKind } from "@/lib/studio/styles";
import type { RenderJobSpec } from "@/lib/studio/types";
import { assFontsDir, resolveFontFile } from "./fonts";

const run = promisify(execFile);

export interface AssembleInput {
  spec: RenderJobSpec;
  /** Absolute local paths, resolved by the caller before we get here. */
  scenePaths: string[];
  narrationPath: string;
  musicPath: string | null;
  assPath: string | null;
  outputPath: string;
  onProgress?: (percent: number, message: string) => void;
}

export interface AssembleResult {
  durationMs: number;
  sizeBytes: number;
  encodeMs: number;
  logTail: string;
}

/** Crossfade length per transition kind, in seconds. 0 means a hard cut. */
const TRANSITION_SECONDS: Record<TransitionKind, number> = {
  fade: 0.5,
  dissolve: 0.6,
  slideleft: 0.4,
  wipeup: 0.4,
  cut: 0,
};

/** Filter-graph argument escaping: `:` `'` `\` and `,` are all syntax. */
function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/%/g, "\\%");
}

/**
 * Ken Burns expression for one scene.
 *
 * The source is upscaled before zoompan runs. zoompan computes crop windows in
 * integer pixels, and at native resolution that rounding shows up as visible
 * stepping on slow moves; working at 2x makes each step sub-pixel after the
 * final downscale.
 */
function kenBurns(
  motion: "in" | "out" | "left" | "right",
  frames: number,
  amount: number,
  width: number,
  height: number,
  fps: number,
): string {
  const f = Math.max(2, frames);
  const supersample = `scale=${width * 2}:${height * 2}:flags=bicubic`;
  // `on` is the output frame index; `t` would be wrong here because zoompan
  // runs per input frame.
  const progress = `(on/${f - 1})`;
  const maxZoom = (1 + amount).toFixed(4);

  let z: string;
  let x: string;
  let y: string;

  switch (motion) {
    case "in":
      z = `1+${amount.toFixed(4)}*${progress}`;
      x = "iw/2-(iw/zoom/2)";
      y = "ih/2-(ih/zoom/2)";
      break;
    case "out":
      z = `${maxZoom}-${amount.toFixed(4)}*${progress}`;
      x = "iw/2-(iw/zoom/2)";
      y = "ih/2-(ih/zoom/2)";
      break;
    case "left":
      z = maxZoom;
      x = `(iw-iw/zoom)*(1-${progress})`;
      y = "ih/2-(ih/zoom/2)";
      break;
    case "right":
      z = maxZoom;
      x = `(iw-iw/zoom)*${progress}`;
      y = "ih/2-(ih/zoom/2)";
      break;
  }

  return [
    supersample,
    `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=${fps}`,
    "setsar=1",
  ].join(",");
}

/** Build the complete filter graph and the input list it refers to. */
export function buildFilterGraph(input: AssembleInput): { args: string[]; expectedMs: number } {
  const { spec, scenePaths, narrationPath, musicPath, assPath } = input;
  const style = styleById(spec.styleId);
  const { width, height, fps } = spec;
  const transitionSeconds = TRANSITION_SECONDS[style.transition];

  const args: string[] = ["-hide_banner", "-y"];
  const filters: string[] = [];

  const sceneCount = spec.scenes.length;
  const durations = spec.scenes.map((s) => Math.max(0.4, (s.endMs - s.startMs) / 1000));

  // Each scene except the last is rendered long by one transition length, so
  // the crossfade overlaps into the next slot instead of shortening the
  // timeline. Without this the video drifts shorter than the narration by
  // (sceneCount - 1) * transition, and the captions desynchronise.
  spec.scenes.forEach((scene, i) => {
    const extra = i < sceneCount - 1 ? transitionSeconds : 0;
    // `-framerate` is essential, not cosmetic. The image2 demuxer defaults to
    // 25fps, zoompan emits one output frame per *input* frame, and its `fps`
    // option only labels the result — so without this every scene comes out
    // 25/fps of its intended length and the xfade offsets fall off the end of
    // the stream, truncating the whole video.
    args.push(
      "-framerate",
      String(fps),
      "-loop",
      "1",
      "-t",
      (durations[i]! + extra).toFixed(3),
      "-i",
      scenePaths[i]!,
    );
    void scene;
  });

  const narrationIndex = sceneCount;
  args.push("-i", narrationPath);
  const musicIndex = musicPath ? sceneCount + 1 : -1;
  if (musicPath) args.push("-i", musicPath);

  // --- Video: per-scene motion ---
  spec.scenes.forEach((scene, i) => {
    const extra = i < sceneCount - 1 ? transitionSeconds : 0;
    const frames = Math.round((durations[i]! + extra) * fps);
    filters.push(
      `[${i}:v]${kenBurns(scene.motion, frames, style.kenBurns, width, height, fps)},format=yuv420p[v${i}]`,
    );
  });

  // --- Video: join scenes ---
  let videoLabel: string;
  if (sceneCount === 1) {
    videoLabel = "v0";
  } else if (transitionSeconds === 0) {
    const inputs = spec.scenes.map((_, i) => `[v${i}]`).join("");
    filters.push(`${inputs}concat=n=${sceneCount}:v=1:a=0[vcat]`);
    videoLabel = "vcat";
  } else {
    let acc = "v0";
    let offset = 0;
    for (let i = 1; i < sceneCount; i++) {
      offset += durations[i - 1]!;
      const out = i === sceneCount - 1 ? "vcat" : `vx${i}`;
      filters.push(
        `[${acc}][v${i}]xfade=transition=${style.transition}:duration=${transitionSeconds}:offset=${offset.toFixed(3)}[${out}]`,
      );
      acc = out;
    }
    videoLabel = acc;
  }

  // --- Video: burned-in captions and title cards ---
  // One ASS pass carries both; see buildAss for why title cards are not
  // drawn with `drawtext`.
  if (assPath) {
    const fontsDir = assFontsDir();
    const fontsArg = fontsDir ? `:fontsdir='${escapeFilterPath(fontsDir)}'` : "";
    filters.push(`[${videoLabel}]ass='${escapeFilterPath(assPath)}'${fontsArg}[vass]`);
    videoLabel = "vass";
  }

  // --- Video: watermark ---
  const watermarkFont = spec.watermark ? resolveFontFile("DejaVu Sans") : null;
  if (spec.watermark && watermarkFont) {
    const size = Math.round((height > width ? width : height) * 0.026);
    filters.push(
      `[${videoLabel}]drawtext=fontfile='${escapeFilterPath(watermarkFont)}':` +
        `text='${escapeDrawText(spec.watermark)}':fontcolor=white@0.62:fontsize=${size}:` +
        `shadowcolor=black@0.6:shadowx=2:shadowy=2:` +
        `x=w-text_w-${Math.round(size * 1.4)}:y=h-text_h-${Math.round(size * 1.4)}[vwm]`,
    );
    videoLabel = "vwm";
  }

  filters.push(`[${videoLabel}]format=yuv420p[vout]`);

  // --- Audio ---
  const AFMT = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";
  filters.push(`[${narrationIndex}:a]${AFMT},highpass=f=85,acompressor=threshold=0.12:ratio=3:attack=8:release=180[voice]`);

  if (musicIndex >= 0) {
    const gain = spec.musicGainDb;
    filters.push(`[${musicIndex}:a]${AFMT},volume=${gain}dB[musicraw]`);
    // Split the voice: one copy is mixed, the other only keys the compressor.
    filters.push(`[voice]asplit=2[voicemix][voicekey]`);
    filters.push(
      `[musicraw][voicekey]sidechaincompress=threshold=0.025:ratio=14:attack=12:release=320:makeup=1[musicduck]`,
    );
    filters.push(
      `[voicemix][musicduck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amixed]`,
    );
  } else {
    filters.push(`[voice]anull[amixed]`);
  }

  // YouTube normalises to roughly -14 LUFS; delivering at target avoids their
  // transcoder pulling the whole mix down and flattening the voice.
  filters.push(`[amixed]loudnorm=I=-14:TP=-1.5:LRA=11,${AFMT}[aout]`);

  const expectedMs = Math.round(durations.reduce((a, b) => a + b, 0) * 1000);

  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-level",
    "4.1",
    // Two-second keyframe interval: what YouTube and every CDN wants.
    "-g",
    String(fps * 2),
    "-r",
    String(fps),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    // Lets a browser start playback before the whole file has downloaded.
    "-movflags",
    "+faststart",
    "-shortest",
    "-t",
    (expectedMs / 1000).toFixed(3),
    input.outputPath,
  );

  return { args, expectedMs };
}

/** Run the assembly, streaming progress from FFmpeg's own `-progress` output. */
export async function assemble(input: AssembleInput): Promise<AssembleResult> {
  const { args, expectedMs } = buildFilterGraph(input);
  const startedAt = Date.now();
  const logLines: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-progress", "pipe:1", "-nostats", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let progressBuffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      progressBuffer += chunk.toString();
      const lines = progressBuffer.split("\n");
      progressBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const match = /^out_time_ms=(\d+)/.exec(line.trim());
        if (match && expectedMs > 0) {
          const doneMs = Number(match[1]) / 1000;
          const percent = Math.min(99, Math.round((doneMs / expectedMs) * 100));
          input.onProgress?.(percent, `Encoding ${Math.round(doneMs / 1000)}s of ${Math.round(expectedMs / 1000)}s`);
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      // Keep a bounded tail; a failing graph can emit megabytes.
      logLines.push(chunk.toString());
      if (logLines.length > 400) logLines.splice(0, logLines.length - 400);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}\n${logLines.join("").slice(-4000)}`));
    });
  });

  const info = await stat(input.outputPath);
  return {
    durationMs: await probeDurationMs(input.outputPath),
    sizeBytes: info.size,
    encodeMs: Date.now() - startedAt,
    logTail: logLines.join("").slice(-2000),
  };
}

export async function probeDurationMs(path: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nw=1:nk=1",
    path,
  ]);
  return Math.round(Number.parseFloat(stdout.trim()) * 1000) || 0;
}

/** Grab a poster frame from a third of the way in, past any opening fade. */
export async function extractThumbnail(videoPath: string, outPath: string, durationMs: number): Promise<void> {
  const at = Math.max(0.5, (durationMs / 1000) * 0.33);
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    at.toFixed(2),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    outPath,
  ]);
}
