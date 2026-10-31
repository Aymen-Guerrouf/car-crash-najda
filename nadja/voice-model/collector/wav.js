// Audio helpers shared by the recording page and the node tests. Pure functions, no browser APIs.
// Spec (AI_Layer_Guide.md §11.2): 16 kHz, mono, 16-bit PCM WAV, 1.0 s window = the loudest second of the take.

export const SAMPLE_RATE = 16000;
export const CLIP_SECONDS = 1.0;

export function rms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function peak(samples) {
  let max = 0;
  for (let i = 0; i < samples.length; i++) max = Math.max(max, Math.abs(samples[i]));
  return max;
}

/** Downmix is done by the caller; this converts mono samples between rates (box filter when decimating). */
export function resample(samples, fromRate, toRate) {
  if (fromRate === toRate) return Float32Array.from(samples);
  const ratio = fromRate / toRate;
  const outLength = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = i * ratio;
    const end = Math.min(samples.length, start + ratio);
    const first = Math.floor(start);
    const last = Math.max(first, Math.ceil(end) - 1);
    let sum = 0;
    let count = 0;
    for (let j = first; j <= last && j < samples.length; j++) { sum += samples[j]; count++; }
    out[i] = count ? sum / count : 0;
  }
  return out;
}

/** The loudest `seconds` of the take (sliding RMS, 10 ms hop), zero-padded if the take is shorter. */
export function cropLoudest(samples, sampleRate = SAMPLE_RATE, seconds = CLIP_SECONDS) {
  const length = Math.round(sampleRate * seconds);
  if (samples.length <= length) {
    const out = new Float32Array(length);
    out.set(samples, Math.floor((length - samples.length) / 2));
    return out;
  }
  const hop = Math.round(sampleRate * 0.01);
  let bestStart = 0;
  let bestEnergy = -1;
  // running energy over the window, advanced hop by hop
  let energy = 0;
  for (let i = 0; i < length; i++) energy += samples[i] * samples[i];
  for (let start = 0; start + length <= samples.length; start += hop) {
    if (start > 0) {
      for (let i = start - hop; i < start; i++) energy -= samples[i] * samples[i];
      for (let i = start + length - hop; i < start + length; i++) energy += samples[i] * samples[i];
    }
    if (energy > bestEnergy) { bestEnergy = energy; bestStart = start; }
  }
  return Float32Array.from(samples.subarray(bestStart, bestStart + length));
}

/** Float32 [-1,1] -> 16-bit PCM WAV bytes (44-byte header, mono). */
export function encodeWav16(samples, sampleRate = SAMPLE_RATE) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const writeStr = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);          // PCM chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
  }
  return bytes;
}
