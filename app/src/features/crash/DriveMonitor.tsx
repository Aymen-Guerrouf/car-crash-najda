import { Accelerometer } from 'expo-sensors';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';
import { useDriveStore } from '../../store/useDriveStore';
import { CrashDetector } from './detector';
import { triggerCrash } from './triggerCrash';

const SAMPLE_MS = 20; // 50 Hz
const BUFFER = 150; // 3 s of samples for the graph
const PUBLISH_MS = 100; // the UI only needs 10 Hz

/** Headless: while Drive mode is on, keeps the screen awake and feeds the accelerometer to the detector. */
export function DriveMonitor() {
  const on = useDriveStore((s) => s.on);

  useEffect(() => {
    if (!on) return;

    const detector = new CrashDetector();
    const buffer: number[] = [];
    activateKeepAwakeAsync('drive').catch(() => {});
    Accelerometer.setUpdateInterval(SAMPLE_MS);

    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const m = Math.sqrt(x * x + y * y + z * z);
      buffer.push(m);
      if (buffer.length > BUFFER) buffer.shift();
      // No new detection while a crash flow is already open
      if (useDriveStore.getState().busy) return;
      if (detector.push(Date.now(), m)) triggerCrash('sensor');
    });
    const publish = setInterval(() => useDriveStore.getState().setSamples([...buffer]), PUBLISH_MS);

    return () => {
      sub.remove();
      clearInterval(publish);
      deactivateKeepAwake('drive').catch(() => {});
    };
  }, [on]);

  return null;
}
