/**
 * Voiceover generation.
 *
 * The contract both drivers satisfy is: return WAV audio *and* word-level
 * timings. Word timings are not optional garnish here — they are what the
 * caption renderer karaoke-highlights against, and they are the single
 * biggest quality difference between this and tools that time captions by
 * dividing the duration evenly.
 */
import { modes } from "@/lib/env";
import type { WordTiming } from "@/lib/studio/types";

export interface TtsRequest {
  text: string;
  voiceId: string;
  /** Narration speed multiplier; 1 is the voice's natural rate. */
  speed?: number;
}

export interface TtsResult {
  /** 16-bit PCM WAV. FFmpeg ingests it directly with no transcode. */
  wav: Buffer;
  durationMs: number;
  words: WordTiming[];
  mode: "live" | "local";
}

export interface TtsProvider {
  readonly kind: "elevenlabs" | "local";
  synthesise(req: TtsRequest): Promise<TtsResult>;
}

let cached: TtsProvider | undefined;

export async function tts(): Promise<TtsProvider> {
  if (cached) return cached;
  cached =
    modes.tts === "live"
      ? (await import("./elevenlabs")).createElevenLabsProvider()
      : (await import("./local")).createLocalTtsProvider();
  return cached;
}
