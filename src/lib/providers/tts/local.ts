/**
 * Local preview voice.
 *
 * With no ELEVENLABS_API_KEY and no TTS binary available, this synthesises
 * narration in-process: a glottal pulse train shaped by three formant
 * resonators, with a pitch contour, per-syllable amplitude envelope and
 * fricative bursts at word onsets. It reads as speech-shaped audio rather
 * than a beep, and crucially it is built *from* the prosody timeline — so the
 * word timings handed to the caption renderer are exact rather than estimated.
 *
 * It is a preview voice, not a replacement for ElevenLabs, and the UI says so.
 * Its job is to make the rest of the pipeline — timing, captions, ducking,
 * scene boundaries — fully exercisable with no vendor account.
 */
import { voiceById } from "@/lib/studio/voices";
import type { WordTiming } from "@/lib/studio/types";
import { layoutProsody, totalDurationMs, type TimedWord } from "./prosody";
import type { TtsProvider, TtsRequest, TtsResult } from "./index";
import { encodeWav } from "./wav";

const SAMPLE_RATE = 24_000;

/** Formant centres (Hz) and bandwidths for a neutral vowel, scaled per voice. */
const FORMANTS: { f: number; bw: number; gain: number }[] = [
  { f: 620, bw: 80, gain: 1.0 },
  { f: 1_180, bw: 100, gain: 0.55 },
  { f: 2_640, bw: 140, gain: 0.22 },
];

/**
 * A two-pole resonator. Cheap, stable, and the standard building block of a
 * formant synthesiser.
 */
class Resonator {
  private y1 = 0;
  private y2 = 0;
  private readonly a1: number;
  private readonly a2: number;
  private readonly b0: number;

  constructor(freq: number, bandwidth: number, sampleRate: number) {
    const r = Math.exp((-Math.PI * bandwidth) / sampleRate);
    const theta = (2 * Math.PI * freq) / sampleRate;
    this.a1 = 2 * r * Math.cos(theta);
    this.a2 = -(r * r);
    this.b0 = 1 - this.a1 - this.a2;
  }

  process(x: number): number {
    const y = this.b0 * x + this.a1 * this.y1 + this.a2 * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Deterministic noise so a given script always renders byte-identical audio. */
function makeNoise(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

export function createLocalTtsProvider(): TtsProvider {
  return {
    kind: "local",

    async synthesise(req: TtsRequest): Promise<TtsResult> {
      const voice = voiceById(req.voiceId);
      const timeline = layoutProsody(req.text, voice.wpm, req.speed ?? 1);

      if (timeline.length === 0) {
        return { wav: encodeWav(new Float32Array(0), { sampleRate: SAMPLE_RATE, channels: 1 }), durationMs: 0, words: [], mode: "local" };
      }

      const durationMs = totalDurationMs(timeline);
      // A short tail stops the final word being clipped by the encoder.
      const totalSamples = Math.ceil(((durationMs + 180) / 1000) * SAMPLE_RATE);
      const buffer = new Float32Array(totalSamples);

      const noise = makeNoise(0x9e3779b9);
      // Female voices sit higher, so their formants scale up with the pitch.
      const formantScale = voice.basePitchHz > 160 ? 1.14 : 1.0;
      const resonators = FORMANTS.map(
        (f) => new Resonator(f.f * formantScale, f.bw, SAMPLE_RATE),
      );

      // Declination: pitch drifts down across a sentence and resets after it,
      // which is most of what makes a read sound like prose rather than a list.
      let sentenceStartMs = 0;
      let sentenceEndMs = findSentenceEnd(timeline, 0);
      let phase = 0;

      for (const [wordIndex, word] of timeline.entries()) {
        if (word.startMs >= sentenceEndMs) {
          sentenceStartMs = word.startMs;
          sentenceEndMs = findSentenceEnd(timeline, wordIndex);
        }

        const sentenceSpan = Math.max(1, sentenceEndMs - sentenceStartMs);
        const sentenceProgress = (word.startMs - sentenceStartMs) / sentenceSpan;

        // Falling contour across the sentence; questions rise at the end.
        const declination = 1 - 0.16 * sentenceProgress;
        const questionLift = word.isQuestion ? 1 + 0.22 * sentenceProgress : 1;
        // A little per-word variation stops it sounding metronomic.
        const wordJitter = 1 + ((wordIndex * 37) % 11) / 160 - 0.03;
        const f0 = voice.basePitchHz * declination * questionLift * wordJitter;

        const startSample = Math.floor((word.startMs / 1000) * SAMPLE_RATE);
        const endSample = Math.floor((word.endMs / 1000) * SAMPLE_RATE);
        const length = Math.max(1, endSample - startSample);

        // Onset burst: a few ms of filtered noise standing in for a consonant.
        const burstSamples = Math.min(Math.floor(SAMPLE_RATE * 0.014), Math.floor(length * 0.3));

        for (let i = 0; i < length; i++) {
          const target = startSample + i;
          if (target >= totalSamples) break;

          const t = i / length;

          // Amplitude envelope: per-syllable swell inside a word-level
          // attack/release, so multi-syllable words pulse rather than drone.
          const syllablePhase = (t * word.syllables) % 1;
          const syllableEnv = 0.55 + 0.45 * Math.sin(Math.PI * syllablePhase);
          const attack = Math.min(1, t / 0.08);
          const release = Math.min(1, (1 - t) / 0.16);
          const envelope = syllableEnv * attack * release;

          // Glottal source: a band-limited pulse train. Summing a handful of
          // harmonics with 1/k rolloff is a close enough approximation and
          // avoids the aliasing a naive sawtooth would produce.
          const freq = f0 * (1 - 0.04 * t);
          phase += (2 * Math.PI * freq) / SAMPLE_RATE;
          if (phase > 2 * Math.PI) phase -= 2 * Math.PI;

          let glottal = 0;
          const harmonics = Math.min(28, Math.floor(SAMPLE_RATE / 2 / Math.max(60, freq)));
          for (let k = 1; k <= harmonics; k++) {
            glottal += Math.sin(phase * k) / Math.pow(k, 1.25);
          }
          glottal *= 0.32;

          if (i < burstSamples) {
            const burstEnv = 1 - i / burstSamples;
            glottal += noise() * 0.5 * burstEnv;
          }

          let shaped = 0;
          for (const [fi, res] of resonators.entries()) {
            shaped += res.process(glottal) * FORMANTS[fi]!.gain;
          }

          buffer[target] = (buffer[target] ?? 0) + shaped * envelope * 0.34;
        }

        // Let the resonators ring into the gap rather than cutting dead.
        const gapSamples = Math.floor((word.gapMs / 1000) * SAMPLE_RATE);
        for (let i = 0; i < gapSamples; i++) {
          const target = endSample + i;
          if (target >= totalSamples) break;
          let tail = 0;
          for (const [fi, res] of resonators.entries()) {
            tail += res.process(0) * FORMANTS[fi]!.gain;
          }
          buffer[target] = (buffer[target] ?? 0) + tail * 0.34;
        }
      }

      normalisePeak(buffer, 0.82);

      return {
        wav: encodeWav(buffer, { sampleRate: SAMPLE_RATE, channels: 1 }),
        durationMs,
        words: toWordTimings(timeline),
        mode: "local",
      };
    },
  };
}

function findSentenceEnd(timeline: TimedWord[], fromIndex: number): number {
  for (let i = fromIndex; i < timeline.length; i++) {
    if (timeline[i]!.endsSentence) return timeline[i]!.endMs;
  }
  return timeline[timeline.length - 1]!.endMs;
}

/** Peak-normalise in place, leaving headroom for the music mix. */
function normalisePeak(buffer: Float32Array, target: number): void {
  let peak = 0;
  for (const s of buffer) {
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }
  if (peak < 1e-6) return;
  const gain = target / peak;
  for (let i = 0; i < buffer.length; i++) buffer[i] = buffer[i]! * gain;
}

export const toWordTimings = (timeline: TimedWord[]): WordTiming[] =>
  timeline.map((w) => ({ word: w.word, startMs: w.startMs, endMs: w.endMs }));
