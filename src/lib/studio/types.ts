/** Core domain types shared by the API, render engine and UI. */

export type AspectRatio = "16:9" | "9:16" | "1:1";

export type ProjectStatus =
  | "draft"
  | "scripted"
  | "storyboarded"
  | "voiced"
  | "rendering"
  | "ready"
  | "failed";

export type RenderStatus = "queued" | "claimed" | "running" | "succeeded" | "failed" | "cancelled";

export type SceneAssetStatus = "pending" | "generating" | "ready" | "failed";

/** A single spoken word with millisecond-accurate placement in the voiceover. */
export interface WordTiming {
  word: string;
  /** Start offset in milliseconds from the beginning of the clip. */
  startMs: number;
  /** End offset in milliseconds from the beginning of the clip. */
  endMs: number;
}

/** A caption line grouped for on-screen display, carrying its own word timings. */
export interface CaptionCue {
  startMs: number;
  endMs: number;
  text: string;
  words: WordTiming[];
}

export interface SceneDraft {
  index: number;
  /** The narration spoken over this scene — drives its duration. */
  narration: string;
  /** Short on-screen title or hook, optional. */
  onScreenText?: string;
  /** Visual direction handed to the image provider. */
  visualPrompt: string;
  /** Broad shot description used for continuity between scenes. */
  shot?: string;
  /** Ken Burns direction, alternated across scenes so motion never repeats. */
  motion?: "in" | "out" | "left" | "right";
}

export interface ScriptDraft {
  title: string;
  hook: string;
  /** Full narration, newline-separated beats. */
  body: string;
  callToAction: string;
  /** SEO metadata for the YouTube publish step. */
  seoTitle: string;
  seoDescription: string;
  tags: string[];
  estimatedSeconds: number;
  wordCount: number;
}

export interface VoiceoverResult {
  /** Storage key of the rendered audio. */
  audioKey: string;
  durationMs: number;
  words: WordTiming[];
  /** `live` when produced by ElevenLabs, `local` for the in-process preview voice. */
  mode: "live" | "local";
  voiceId: string;
}

/** The complete, self-contained instruction set handed to the render node. */
export interface RenderJobSpec {
  renderId: string;
  projectId: string;
  title: string;
  aspectRatio: AspectRatio;
  width: number;
  height: number;
  fps: number;
  styleId: string;
  captionPresetId: string;
  burnCaptions: boolean;
  musicBedId: string | null;
  musicGainDb: number;
  scenes: RenderScene[];
  /** Resolved URL or absolute path to the narration audio. */
  audioUrl: string;
  durationMs: number;
  cues: CaptionCue[];
  /** Watermark text for free-tier renders; null removes it. */
  watermark: string | null;
}

export interface RenderScene {
  index: number;
  /** Resolved URL or absolute path to the still frame or clip. */
  imageUrl: string;
  startMs: number;
  endMs: number;
  onScreenText?: string;
  /** Ken Burns direction for this scene, alternated by the planner. */
  motion: "in" | "out" | "left" | "right";
}

export interface RenderOutput {
  videoKey: string;
  thumbnailKey: string | null;
  durationMs: number;
  sizeBytes: number;
  width: number;
  height: number;
  /** Wall-clock encode time, used for the cost-per-minute benchmark. */
  encodeMs: number;
  logTail: string;
}
