import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface DriveState {
  /** Drive mode: crash detection running (app in foreground, screen kept awake). */
  on: boolean;
  /** A crash flow is open: ignore new detections until the user is back on Home. */
  busy: boolean;
  /** Sensor detections are ignored until this time (ms): the phone is being handled after an incident. */
  quietUntil: number;
  /** Last ~3 s of accelerometer magnitudes (g), refreshed 10×/s for the live graph. */
  samples: number[];
  /** Crash countdowns the user cancelled ("I'm OK"): shows how well detection is tuned. */
  falseAlarms: number;
  setOn: (on: boolean) => void;
  setBusy: (busy: boolean) => void;
  setQuietUntil: (at: number) => void;
  setSamples: (samples: number[]) => void;
  countFalseAlarm: () => void;
}

export const useDriveStore = create<DriveState>()(
  persist(
    (set) => ({
      on: false,
      busy: false,
      quietUntil: 0,
      samples: [],
      falseAlarms: 0,
      setOn: (on) => set({ on, samples: [] }),
      setBusy: (busy) => set({ busy }),
      setQuietUntil: (quietUntil) => set({ quietUntil }),
      setSamples: (samples) => set({ samples }),
      countFalseAlarm: () => set((s) => ({ falseAlarms: s.falseAlarms + 1 })),
    }),
    {
      name: 'drive',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ falseAlarms: s.falseAlarms }),
    },
  ),
);
