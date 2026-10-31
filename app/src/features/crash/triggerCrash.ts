import { router } from 'expo-router';
import { useDriveStore } from '../../store/useDriveStore';
import { startCrashSession } from './crashSession';

export type CrashSource = 'sensor' | 'manual';

/**
 * Single entry point for "a crash happened": the sensor detector and the hidden triple-tap both call
 * this, so the rest of the flow is identical whichever one fired.
 *
 * Ignored while a crash is already being handled, and (for the sensor only) for a while after it ended:
 * picking the phone up and putting it down must not start a second alert.
 */
export function triggerCrash(source: CrashSource): void {
  const drive = useDriveStore.getState();
  if (drive.busy) return;
  if (source === 'sensor' && Date.now() < drive.quietUntil) return;
  drive.setBusy(true);
  startCrashSession();
  console.log(`Crash triggered (${source})`);
  router.push('/crash');
}
