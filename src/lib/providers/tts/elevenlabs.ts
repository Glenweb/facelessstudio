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
import { layoutProsody, totalDurationMs } from "./prosody";
import { encodeWav } from "./wav";

const SAMPLE_RATE = 24_000;

/** Long enough for a several-minute narration, short enough to fail visibly. */
const REQUEST_TIMEOUT_MS = 180_000;

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

      const speed = req.speed ?? 1;
      const res = await fetch(url, {
        method: "POST",
        headers: { "xi-api-key": env.elevenLabsKey!, "content-type": "application/json" },
        body: JSON.stringify({
          text: req.text,
          model_id: env.elevenLabsModel,
          voice_settings: {
            stability: voice.stability,
            similarity_boost: voice.similarityBoost,
            // Only sent when it differs from the default. `speed` is rejected
            // by some model and plan combinations, and sending it needlessly
            // turns a working request into a 422.
            ...(speed !== 1 ? { speed } : {}),
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }).catch((err: unknown) => {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new Error(
            `ElevenLabs did not respond within ${REQUEST_TIMEOUT_MS / 1000}s. Try a shorter script, or check status.elevenlabs.io.`,
          );
        }
        throw err;
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // These three are the ones worth naming; anything else goes through raw.
        const hint =
          res.status === 401
            ? " — check ELEVENLABS_API_KEY in .env"
            : res.status === 429
              ? " — quota exhausted or too many concurrent requests for your plan"
              : res.status === 422
                ? " — the request was rejected; the voice id or model may not be available on your plan"
                : "";
        throw new Error(`ElevenLabs failed (${res.status})${hint}: ${text.slice(0, 400)}`);
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
      const measured = alignment ? wordsFromCharacters(alignment) : [];

      // Alignment is the whole point of this endpoint, but it can come back
      // empty. Without timings every scene collapses to the same instant and
      // the render silently produces nonsense, so fall back to the prosody
      // model stretched onto the real audio length — less accurate than
      // measured timings, still a correct video.
      const words =
        measured.length > 0
          ? measured
          : estimateWords(req.text, voice.wpm, speed, durationMs);

      if (measured.length === 0) {
        console.warn(
          "[tts] ElevenLabs returned no alignment; captions fall back to estimated timings.",
        );
      }

      return { wav, durationMs, words, mode: "live" };
    },
  };
}

/**
 * Prosody-derived timings scaled to the audio that actually came back.
 *
 * The layout gives the right *relative* spacing; scaling it onto the measured
 * duration keeps the last word landing on the last frame.
 */
function estimateWords(text: string, wpm: number, speed: number, actualMs: number): WordTiming[] {
  const timeline = layoutProsody(text, wpm, speed);
  const modelled = totalDurationMs(timeline);
  if (modelled <= 0 || actualMs <= 0) return [];
  const scale = actualMs / modelled;
  return timeline.map((w) => ({
    word: w.word,
    startMs: Math.round(w.startMs * scale),
    endMs: Math.round(w.endMs * scale),
  }));
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
