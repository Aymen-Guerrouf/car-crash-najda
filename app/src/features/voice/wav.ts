/** Reads 16-bit PCM mono WAV bytes into floats in [-1, 1). Walks the chunks, so extra headers (LIST...) are fine. */
export function decodeWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  let pos = 12;
  let sampleRate = 16000;
  let channels = 1;
  let bits = 16;
  while (pos + 8 <= bytes.length) {
    const id = tag(pos);
    let size = v.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === 'fmt ') {
      channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
    } else if (id === 'data') {
      if (bits !== 16) return null;
      size = Math.min(size, bytes.length - body); // streamed files may carry a bogus size
      const frames = Math.floor(size / (2 * channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) samples[i] = v.getInt16(body + i * 2 * channels, true) / 32768;
      return { samples, sampleRate };
    }
    pos = body + size + (size % 2);
  }
  return null;
}
