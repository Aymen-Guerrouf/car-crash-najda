import { AudioQuality, IOSOutputFormat, RecordingPresets, setAudioModeAsync, type AudioRecorder } from 'expo-audio';
import { SAMPLE_RATE } from './melFeatures';
import { decodeWav } from './wav';

/** 16 kHz mono 16-bit PCM WAV: exactly what the model is trained on, for the live feature and the data recorder. */
export const RECORD_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.wav',
  sampleRate: SAMPLE_RATE,
  numberOfChannels: 1,
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    sampleRate: SAMPLE_RATE,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Linear resample, only used if the phone refuses 16 kHz. */
function resample(x: Float32Array, from: number): Float32Array {
  if (from === SAMPLE_RATE) return x;
  const out = new Float32Array(Math.floor((x.length * SAMPLE_RATE) / from));
  for (let i = 0; i < out.length; i++) {
    const p = (i * from) / SAMPLE_RATE;
    const i0 = Math.floor(p);
    const frac = p - i0;
    out[i] = x[i0]! * (1 - frac) + (x[Math.min(i0 + 1, x.length - 1)] ?? 0) * frac;
  }
  return out;
}

/** Records `ms` of audio and returns it as 16 kHz floats (null if the file could not be read). Throws on a recorder error. */
export async function recordTake(recorder: AudioRecorder, ms: number): Promise<Float32Array | null> {
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  try {
    await recorder.prepareToRecordAsync();
    recorder.record();
    await sleep(ms);
    await recorder.stop();
  } finally {
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {}); // back to the loudspeaker
  }
  if (!recorder.uri) return null;
  const bytes = new Uint8Array(await (await fetch(recorder.uri)).arrayBuffer());
  const wav = decodeWav(bytes);
  return wav ? resample(wav.samples, wav.sampleRate) : null;
}
