// Generates assets/audio/alarm.wav: a 2 s two-tone siren (880/660 Hz, 0.25 s each), loop-friendly.
import { writeFileSync } from 'node:fs';
const rate = 22050, secs = 2, n = rate * secs;
const pcm = Buffer.alloc(n * 2);
for (let i = 0; i < n; i++) {
  const t = i / rate;
  const freq = Math.floor(t / 0.25) % 2 === 0 ? 880 : 660;
  const seg = (t % 0.25) / 0.25;
  const env = Math.min(1, seg * 20, (1 - seg) * 20); // short fade in/out per tone: no clicks
  // square-ish wave (sine + 3rd harmonic) carries well in a noisy street
  const s = Math.sin(2 * Math.PI * freq * t) + Math.sin(2 * Math.PI * freq * 3 * t) / 3;
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * 0.7)) * env * 32767), i * 2);
}
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
writeFileSync(new URL('../assets/audio/alarm.wav', import.meta.url), Buffer.concat([h, pcm]));
console.log('alarm.wav written', 44 + pcm.length, 'bytes');