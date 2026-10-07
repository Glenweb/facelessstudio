/**
 * Music bed synthesis.
 *
 * Beds are generated rather than shipped as audio files. That keeps the repo
 * light, and more importantly it means every bed is original output owned by
 * GMK Media Ltd — there is no third-party sync licence to track per customer
 * render, which is the usual legal snag in this category.
 *
 * Each bed is a filtered chord pad with a slow movement LFO, plus an optional
 * pulse layer. Rendered to the exact length the video needs, so no looping
 * seams and no trailing fade cut mid-bar.
 */
import type { MusicBed } from "@/lib/studio/music";
import { encodeWav } from "@/lib/providers/tts/wav";

const SAMPLE_RATE = 44_100;

/** One-pole low-pass. Gentle, and enough to keep the pad behind the voice. */
class OnePole {
  private y = 0;
  constructor(private readonly coeff: number) {}
  process(x: number): number {
    this.y += this.coeff * (x - this.y);
    return this.y;
  }
}

const semitone = (root: number, steps: number): number => root * Math.pow(2, steps / 12);

export function renderMusicBed(bed: MusicBed, durationMs: number): Buffer {
  const totalSamples = Math.ceil((durationMs / 1000) * SAMPLE_RATE);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  if (bed.chord.length === 0 || bed.rootHz <= 0) {
    // "No music" still returns a valid silent stream, so the mix graph does
    // not need a separate code path for it.
    return encodeWav(interleave(left, right), { sampleRate: SAMPLE_RATE, channels: 2 });
  }

  const cutoffCoeff = Math.min(0.99, (2 * Math.PI * bed.cutoffHz) / SAMPLE_RATE);
  const filters = bed.chord.map(() => [new OnePole(cutoffCoeff), new OnePole(cutoffCoeff)]);

  bed.chord.forEach((steps, voiceIndex) => {
    const freq = semitone(bed.rootHz, steps);
    // Detune each voice a few cents and spread it across the stereo field, so
    // the pad has width without any reverb.
    const detune = 1 + (voiceIndex - bed.chord.length / 2) * 0.0012;
    const pan = bed.chord.length > 1 ? voiceIndex / (bed.chord.length - 1) : 0.5;
    const gainL = Math.cos((pan * Math.PI) / 2);
    const gainR = Math.sin((pan * Math.PI) / 2);
    // Each voice breathes at its own slow rate; together they never quite repeat.
    const lfoHz = 0.035 + voiceIndex * 0.017;
    const voiceFilters = filters[voiceIndex]!;

    let phase = voiceIndex * 0.7;
    const inc = (2 * Math.PI * freq * detune) / SAMPLE_RATE;

    for (let i = 0; i < totalSamples; i++) {
      phase += inc;
      // Two harmonics is enough body without muddying the voice band.
      const raw =
        Math.sin(phase) * 0.6 + Math.sin(phase * 2) * 0.22 + Math.sin(phase * 3) * 0.08;
      const lfo = 0.72 + 0.28 * Math.sin((2 * Math.PI * lfoHz * i) / SAMPLE_RATE);
      const sample = raw * lfo;
      left[i] = left[i]! + voiceFilters[0]!.process(sample) * gainL;
      right[i] = right[i]! + voiceFilters[1]!.process(sample) * gainR;
    }
  });

  if (bed.bpm > 0) {
    const beatSamples = Math.floor((60 / bed.bpm) * SAMPLE_RATE);
    const pluckFreq = semitone(bed.rootHz, 12);
    for (let beat = 0; beat * beatSamples < totalSamples; beat++) {
      const start = beat * beatSamples;
      // Accent the downbeat of each bar so the pulse has a shape.
      const accent = beat % 4 === 0 ? 1 : 0.55;
      const length = Math.min(Math.floor(SAMPLE_RATE * 0.28), totalSamples - start);
      for (let i = 0; i < length; i++) {
        const t = i / SAMPLE_RATE;
        const envelope = Math.exp(-t * 11) * accent * 0.22;
        const s = Math.sin(2 * Math.PI * pluckFreq * t) * envelope;
        left[start + i] = left[start + i]! + s;
        right[start + i] = right[start + i]! + s;
      }
    }
  }

  applyEnvelope(left, right, totalSamples);
  normalise(left, right, 0.7);

  return encodeWav(interleave(left, right), { sampleRate: SAMPLE_RATE, channels: 2 });
}

/** 2.5s fade in, 3.5s fade out, so the bed never starts or stops abruptly. */
function applyEnvelope(left: Float32Array, right: Float32Array, total: number): void {
  const fadeIn = Math.min(Math.floor(SAMPLE_RATE * 2.5), Math.floor(total / 3));
  const fadeOut = Math.min(Math.floor(SAMPLE_RATE * 3.5), Math.floor(total / 3));
  for (let i = 0; i < fadeIn; i++) {
    const g = i / fadeIn;
    left[i] = left[i]! * g;
    right[i] = right[i]! * g;
  }
  for (let i = 0; i < fadeOut; i++) {
    const idx = total - 1 - i;
    if (idx < 0) break;
    const g = i / fadeOut;
    left[idx] = left[idx]! * g;
    right[idx] = right[idx]! * g;
  }
}

function normalise(left: Float32Array, right: Float32Array, target: number): void {
  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!));
  }
  if (peak < 1e-6) return;
  const gain = target / peak;
  for (let i = 0; i < left.length; i++) {
    left[i] = left[i]! * gain;
    right[i] = right[i]! * gain;
  }
}

function interleave(left: Float32Array, right: Float32Array): Float32Array {
  const out = new Float32Array(left.length * 2);
  for (let i = 0; i < left.length; i++) {
    out[i * 2] = left[i]!;
    out[i * 2 + 1] = right[i]!;
  }
  return out;
}
