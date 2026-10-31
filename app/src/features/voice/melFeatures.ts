/**
 * Log-mel features, hand-written from the contract in nadja/voice-model/kws/features.py (same numbers, same order):
 * 1 s of 16 kHz mono, 98 frames of 400 samples every 160, periodic Hann, 512-point power spectrum, 40 HTK mel
 * triangles 20..7600 Hz, ln(x + 1e-8), then mean/std normalisation over the whole clip. Output [40 * 98], band-major.
 */

export const SAMPLE_RATE = 16000;
export const CLIP_SAMPLES = 16000;
const WIN = 400;
const HOP = 160;
const N_FFT = 512;
export const N_MELS = 40;
const F_MIN = 20;
const F_MAX = 7600;
const LOG_EPS = 1e-8;
const NORM_EPS = 1e-5;
export const N_FRAMES = 1 + Math.floor((CLIP_SAMPLES - WIN) / HOP); // 98
const BINS = N_FFT / 2 + 1;

const hzToMel = (f: number) => 2595 * Math.log10(1 + f / 700);
const melToHz = (m: number) => 700 * (Math.pow(10, m / 2595) - 1);

const HANN = Float64Array.from({ length: WIN }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / WIN));

/** Mel triangles, [N_MELS][BINS], peak 1.0, no area normalisation. */
const BANK: Float64Array[] = (() => {
  const lo = hzToMel(F_MIN);
  const hi = hzToMel(F_MAX);
  const pts = Array.from({ length: N_MELS + 2 }, (_, i) => melToHz(lo + ((hi - lo) * i) / (N_MELS + 1)));
  return Array.from({ length: N_MELS }, (_, m) => {
    const [l, c, r] = [pts[m]!, pts[m + 1]!, pts[m + 2]!];
    const row = new Float64Array(BINS);
    for (let k = 0; k < BINS; k++) {
      const f = (k * SAMPLE_RATE) / N_FFT;
      row[k] = Math.max(0, Math.min((f - l) / (c - l), (r - f) / (r - c)));
    }
    return row;
  });
})();

// Twiddles and bit-reversal for an in-place radix-2 FFT of 512 points
const COS = Float64Array.from({ length: N_FFT / 2 }, (_, i) => Math.cos((2 * Math.PI * i) / N_FFT));
const SIN = Float64Array.from({ length: N_FFT / 2 }, (_, i) => -Math.sin((2 * Math.PI * i) / N_FFT));
const REV = (() => {
  const bits = Math.log2(N_FFT);
  return Uint16Array.from({ length: N_FFT }, (_, i) => {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    return r;
  });
})();

function fft(re: Float64Array, im: Float64Array): void {
  for (let i = 0; i < N_FFT; i++) {
    const j = REV[i]!;
    if (j > i) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let size = 2; size <= N_FFT; size <<= 1) {
    const half = size >> 1;
    const step = N_FFT / size;
    for (let start = 0; start < N_FFT; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = COS[k * step]!;
        const wi = SIN[k * step]!;
        const a = start + k;
        const b = a + half;
        const tr = re[b]! * wr - im[b]! * wi;
        const ti = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
      }
    }
  }
}

/** Exactly 1 s: shorter clips are centred in silence, longer ones keep their loudest second. */
export function fixLength(x: Float32Array): Float32Array {
  if (x.length === CLIP_SAMPLES) return x;
  if (x.length < CLIP_SAMPLES) {
    const out = new Float32Array(CLIP_SAMPLES);
    out.set(x, Math.floor((CLIP_SAMPLES - x.length) / 2));
    return out;
  }
  const sq = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) sq[i + 1] = sq[i]! + x[i]! * x[i]!;
  let best = 0;
  let bestE = -1;
  for (let s = 0; s + CLIP_SAMPLES <= x.length; s += HOP) {
    const e = sq[s + CLIP_SAMPLES]! - sq[s]!;
    if (e > bestE) {
      bestE = e;
      best = s;
    }
  }
  return x.subarray(best, best + CLIP_SAMPLES);
}

/** Normalised model input, length N_MELS * N_FRAMES, index = mel * N_FRAMES + frame. */
export function features(samples: Float32Array): Float32Array {
  const x = fixLength(samples);
  const out = new Float64Array(N_MELS * N_FRAMES);
  const re = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  const power = new Float64Array(BINS);

  for (let f = 0; f < N_FRAMES; f++) {
    re.fill(0);
    im.fill(0);
    for (let n = 0; n < WIN; n++) re[n] = x[f * HOP + n]! * HANN[n]!;
    fft(re, im);
    for (let k = 0; k < BINS; k++) power[k] = re[k]! * re[k]! + im[k]! * im[k]!;
    for (let m = 0; m < N_MELS; m++) {
      const row = BANK[m]!;
      let e = 0;
      for (let k = 0; k < BINS; k++) e += power[k]! * row[k]!;
      out[m * N_FRAMES + f] = Math.log(e + LOG_EPS);
    }
  }

  let mean = 0;
  for (let i = 0; i < out.length; i++) mean += out[i]!;
  mean /= out.length;
  let varSum = 0;
  for (let i = 0; i < out.length; i++) varSum += (out[i]! - mean) ** 2;
  const std = Math.sqrt(varSum / out.length);
  const res = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) res[i] = (out[i]! - mean) / (std + NORM_EPS);
  return res;
}
