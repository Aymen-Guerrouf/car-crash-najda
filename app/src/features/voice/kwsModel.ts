/**
 * Runs `voice_model.json` (int8 weights, per-channel scales, BatchNorm already folded) in plain TypeScript,
 * mirroring nadja/voice-model/kws/infer.py. Classes: other / yes / no. No native module: works in Expo Go.
 */

interface ConvLayer {
  type: 'conv';
  k: number;
  stride: [number, number];
  pad: number;
  in: number;
  out: number;
  groups?: number;
  relu?: boolean;
  w: string;
  scale: number[];
  bias: number[];
}
interface DenseLayer {
  type: 'dense';
  in: number;
  out: number;
  w: string;
  scale: number[];
  bias: number[];
}
interface GapLayer {
  type: 'gap';
}
type Layer = ConvLayer | DenseLayer | GapLayer;

export interface VoiceModelFile {
  classes: string[];
  input: [number, number, number];
  layers: Layer[];
  gate: { p_min: number; margin: number };
}

interface Compiled {
  layer: Layer;
  weights?: Float32Array;
}

export interface VoiceModel {
  classes: string[];
  input: [number, number, number];
  gate: { p_min: number; margin: number };
  layers: Compiled[];
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_INDEX[clean.charCodeAt(i)]!;
    const b = B64_INDEX[clean.charCodeAt(i + 1)]!;
    const c = i + 2 < clean.length ? B64_INDEX[clean.charCodeAt(i + 2)]! : 0;
    const d = i + 3 < clean.length ? B64_INDEX[clean.charCodeAt(i + 3)]! : 0;
    if (o < out.length) out[o++] = (a << 2) | (b >> 4);
    if (o < out.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (o < out.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}

/** int8 * per-output-channel scale -> float32, once at load. */
export function loadModel(file: VoiceModelFile): VoiceModel {
  const layers = file.layers.map((layer): Compiled => {
    if (layer.type === 'gap') return { layer };
    const q = new Int8Array(base64ToBytes(layer.w).buffer);
    const perOut = q.length / layer.out;
    const w = new Float32Array(q.length);
    for (let o = 0; o < layer.out; o++) for (let i = 0; i < perOut; i++) w[o * perOut + i] = q[o * perOut + i]! * layer.scale[o]!;
    return { layer, weights: w };
  });
  return { classes: file.classes, input: file.input, gate: file.gate, layers };
}

function conv(x: Float32Array, c: number, h: number, w: number, l: ConvLayer, wt: Float32Array) {
  const groups = l.groups ?? 1;
  const { k, pad, out: oc } = l;
  const [sh, sw] = l.stride;
  const oh = Math.floor((h + 2 * pad - k) / sh) + 1;
  const ow = Math.floor((w + 2 * pad - k) / sw) + 1;
  const cg = c / groups; // input channels per group
  const og = oc / groups; // output channels per group
  const y = new Float32Array(oc * oh * ow);
  for (let o = 0; o < oc; o++) {
    const g = Math.floor(o / og);
    for (let i = 0; i < oh; i++) {
      for (let j = 0; j < ow; j++) {
        let acc = l.bias[o]!;
        for (let ci = 0; ci < cg; ci++) {
          const plane = (g * cg + ci) * h * w;
          const wBase = (o * cg + ci) * k * k;
          for (let ki = 0; ki < k; ki++) {
            const yy = i * sh + ki - pad;
            if (yy < 0 || yy >= h) continue;
            for (let kj = 0; kj < k; kj++) {
              const xx = j * sw + kj - pad;
              if (xx < 0 || xx >= w) continue;
              acc += x[plane + yy * w + xx]! * wt[wBase + ki * k + kj]!;
            }
          }
        }
        y[(o * oh + i) * ow + j] = l.relu && acc < 0 ? 0 : acc;
      }
    }
  }
  return { y, c: oc, h: oh, w: ow };
}

/** Features [40*98] -> logits. */
export function forward(model: VoiceModel, feat: Float32Array): Float32Array {
  let [c, h, w] = model.input;
  let x: Float32Array = feat;
  for (const { layer, weights } of model.layers) {
    if (layer.type === 'conv') {
      const r = conv(x, c, h, w, layer, weights!);
      x = r.y;
      c = r.c;
      h = r.h;
      w = r.w;
    } else if (layer.type === 'gap') {
      const pooled = new Float32Array(c);
      const n = h * w;
      for (let ch = 0; ch < c; ch++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += x[ch * n + i]!;
        pooled[ch] = s / n;
      }
      x = pooled;
      h = 1;
      w = 1;
    } else {
      const y = new Float32Array(layer.out);
      for (let o = 0; o < layer.out; o++) {
        let acc = layer.bias[o]!;
        for (let i = 0; i < layer.in; i++) acc += weights![o * layer.in + i]! * x[i]!;
        y[o] = acc;
      }
      x = y;
    }
  }
  return x;
}

export function softmax(z: Float32Array): number[] {
  const m = Math.max(...z);
  const e = Array.from(z, (v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export type VoiceAnswer = 'yes' | 'no';

/** The output gate: a yes/no only when confident and clearly ahead of the runner-up; otherwise nothing. */
export function decide(model: VoiceModel, probs: number[]): VoiceAnswer | null {
  const order = probs.map((p, i) => [p, i] as const).sort((a, b) => b[0] - a[0]);
  const [top, second] = [order[0]!, order[1]!];
  if (top[0] < model.gate.p_min || top[0] - second[0] < model.gate.margin) return null;
  const name = model.classes[top[1]];
  return name === 'yes' || name === 'no' ? name : null;
}
