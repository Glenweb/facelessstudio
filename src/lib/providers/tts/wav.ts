/** Minimal 16-bit PCM WAV writer. No dependency, no transcode step. */

export interface WavSpec {
  sampleRate: number;
  channels: number;
}

export function encodeWav(samples: Float32Array, spec: WavSpec): Buffer {
  const { sampleRate, channels } = spec;
  const bytesPerSample = 2;
  const dataBytes = samples.length * bytesPerSample;
  const buf = Buffer.alloc(44 + dataBytes);

  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // format = PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * bytesPerSample, 28); // byte rate
  buf.writeUInt16LE(channels * bytesPerSample, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling; a float overshoot wraps to the opposite rail
    // and produces an audible click rather than clipping.
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    buf.writeInt16LE(Math.round(clamped * 32767), offset);
    offset += 2;
  }
  return buf;
}
