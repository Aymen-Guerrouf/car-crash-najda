import { getRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import voiceModelFile from '../../../assets/voice/voice_model.json';
import { CLIP_SAMPLES, SAMPLE_RATE, features, fixLength } from './melFeatures';
import { decide, forward, loadModel, softmax, type VoiceAnswer, type VoiceModelFile } from './kwsModel';
import { RECORD_OPTIONS, recordTake, sleep } from './recordTake';

const MODEL = loadModel(voiceModelFile as unknown as VoiceModelFile);
const CHUNK_MS = 2200; // one listening window; the loudest second of it is classified
const PAUSE_MS = 150;

/**
 * Probabilities for one listening window, averaged over three crops (the loudest second, and the same second
 * shifted 0.2 s each way). The model is sensitive to where the word falls in its 1 s frame; averaging makes a
 * confident answer less dependent on that luck, while the output gate itself is left exactly as trained.
 */
function classifyWindow(samples: Float32Array): number[] {
  const loud = fixLength(samples);
  const start = loud.byteOffset / Float32Array.BYTES_PER_ELEMENT - samples.byteOffset / Float32Array.BYTES_PER_ELEMENT;
  const shift = Math.round(0.2 * SAMPLE_RATE);
  const probs: number[][] = [];
  for (const d of [-shift, 0, shift]) {
    const s = Math.min(Math.max(0, start + d), Math.max(0, samples.length - CLIP_SAMPLES));
    probs.push(softmax(forward(MODEL, features(samples.subarray(s, s + CLIP_SAMPLES)))));
  }
  return probs[0]!.map((_, i) => probs.reduce((sum, p) => sum + p[i]!, 0) / probs.length);
}

/** True when the whole window is near-silent: skip the model, a quiet room must never become an answer. */
function isSilent(x: Float32Array): boolean {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, x.length)) < 0.004;
}

/**
 * Hands-free yes/no: while `active`, listens in short windows and calls `onAnswer` as soon as the offline model is
 * confident (gate: p >= 0.90 and 0.30 ahead). It never fires on silence or on a low-confidence guess, so it can only
 * help; the buttons stay. Does nothing when the microphone permission has not been granted (no dialog mid-emergency).
 */
export function useVoiceAnswer(active: boolean, onAnswer: (a: VoiceAnswer) => void): { listening: boolean } {
  const recorder = useAudioRecorder(RECORD_OPTIONS);
  const [listening, setListening] = useState(false);
  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = onAnswer;

  useEffect(() => {
    if (!active) return;
    let stopped = false;

    const loop = async () => {
      const perm = await getRecordingPermissionsAsync().catch(() => null);
      if (!perm?.granted) return;
      while (!stopped) {
        try {
          setListening(true);
          const samples = await recordTake(recorder, CHUNK_MS);
          setListening(false);
          if (stopped) break;
          if (!samples || samples.length < CLIP_SAMPLES / 4 || isSilent(samples)) continue;
          const answer = decide(MODEL, classifyWindow(samples));
          if (answer) {
            onAnswerRef.current(answer);
            return;
          }
        } catch {
          setListening(false);
          await sleep(500);
        }
        await sleep(PAUSE_MS);
      }
    };
    void loop();

    return () => {
      stopped = true;
      setListening(false);
      recorder.stop().catch(() => {});
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    };
  }, [active, recorder]);

  return { listening };
}
