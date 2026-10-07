/**
 * ElevenLabs provider.
 *
 * Uses the `with-timestamps` endpoint and `pcm_24000` output, for two reasons:
 *
 * 1. Character-level alignment comes back with the audio, so word timings are
 *    measured rather than estimated — captions land on the actual syllable.
 * 2. Raw PCM is wrapped in a WAV header locally, so FFmpeg never has to
 *    decode MP3, and the render node sees the same format the local voice
 *    produces.
 */
import { env } from "@/lib/env";
import { voiceById } from "@/lib/studio/voices";
import type { WordTiming } from "@/lib/studio/types";
import type { TtsProvider, TtsRequest, TtsResult } from "./index";
import { encodeWav } from "./wav";

const SAMPLE_RATE = 24_000;

interface TimestampResponse {
  audio_base64?: string;
  alignment?: {
    characters?: string[];
    character_start_times_seconds?: number[];
    character_end_times_seconds?: number[];
  };
  normalized_alignment?: TimestampResponse["alignment"];
  detail?: unknown;
}

export function createElevenLabsProvider(): TtsProvider {
  return {
    kind: "elevenlabs",

    async synthesise(req: TtsRequest): Promise<TtsResult> {
      const voice = voiceById(req.voiceId);
      const url =
        `https://api.elevenlabs.io/v1/text-to-speech/${voice.elevenLabsVoiceId}/with-timestamps` +
        `?output_format=pcm_${SAMPLE_RATE}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "xi-api-key": env.elevenLabsKey!, "content-type": "application/json" },
        body: JSON.stringify({
          text: req.text,
          model_id: env.elevenLabsModel,
          voice_settings: {
            stability: voice.stability,
            similarity_boost: voice.similarityBoost,
            speed: req.speed ?? 1,
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`ElevenLabs failed (${res.status}): ${text.slice(0, 400)}`);
      }

      const body = (await res.json()) as TimestampResponse;
      if (!body.audio_base64) throw new Error("ElevenLabs returned no audio.");

      const pcm = Buffer.from(body.audio_base64, "base64");
      const samples = new Float32Array(pcm.length / 2);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = pcm.readInt16LE(i * 2) / 32768;
      }
      const wav = encodeWav(samples, { sampleRate: SAMPLE_RATE, channels: 1 });
      const durationMs = Math.round((samples.length / SAMPLE_RATE) * 1000);

      const alignment = body.alignment ?? body.normalized_alignment;
      const words = alignment ? wordsFromCharacters(alignment) : [];

      return { wav, durationMs, words, mode: "live" };
    },
  };
}

/**
 * Fold character-level alignment into word timings.
 *
 * A word runs from the start of its first non-space character to the end of
 * its last. Trailing punctuation is kept on the word so the caption text
 * matches the script exactly.
 */
export function wordsFromCharacters(alignment: NonNullable<TimestampResponse["alignment"]>): WordTiming[] {
  const chars = alignment.characters ?? [];
  const starts = alignment.character_start_times_seconds ?? [];
  const ends = alignment.character_end_times_seconds ?? [];

  const words: WordTiming[] = [];
  let buffer = "";
  let startSec: number | null = null;
  let endSec = 0;

  const flush = (): void => {
    if (buffer.trim().length > 0 && startSec !== null) {
      words.push({
        word: buffer,
        startMs: Math.round(startSec * 1000),
        endMs: Math.round(endSec * 1000),
      });
    }
    buffer = "";
    startSec = null;
  };

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (startSec === null) startSec = starts[i] ?? endSec;
    buffer += ch;
    endSec = ends[i] ?? startSec;
  }
  flush();

  return words;
}
