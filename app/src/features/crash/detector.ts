// Rule-based crash detector (plan §8.1): free fall → impact spike → phone lying still.
// Pure state machine fed with accelerometer magnitudes (in g, gravity included, ≈1.0 at rest),
// so it can be exercised without a device. Thresholds are STARTING values: calibrate on the demo
// phone, cushion and drop height.

export const THRESHOLDS = {
  freefallG: 0.4,       // magnitude below this ...
  freefallMs: 80,       // ... for this long = free fall
  impactAfterFallG: 2.5, // spike after a fall
  impactMs: 1000,       // ... within this window
  hardStopG: 4.0,       // spike without a fall (hard braking / collision)
  settleMs: 400,        // ignore the bounce right after the impact
  stillMs: 1500,        // then the phone must stay still for this long
  stillStdG: 0.15,
  stillMeanDevG: 0.2,
  cooldownMs: 10_000,
} as const;

export type Path = 'fall+impact' | 'hard-stop';

export interface Detection {
  at: number;
  path: Path;
  peakG: number;
}

type State =
  | { kind: 'IDLE'; lowSince: number | null }
  | { kind: 'FREEFALL'; since: number }
  | { kind: 'IMPACT'; at: number; path: Path; peak: number; samples: number[] }
  | { kind: 'COOLDOWN'; until: number };

export class CrashDetector {
  private state: State = { kind: 'IDLE', lowSince: null };

  reset() {
    this.state = { kind: 'IDLE', lowSince: null };
  }

  /** Feed one sample. Returns a Detection the moment a crash is confirmed. */
  push(t: number, m: number): Detection | null {
    const T = THRESHOLDS;
    const s = this.state;

    switch (s.kind) {
      case 'COOLDOWN':
        if (t >= s.until) this.reset();
        return null;

      case 'IDLE': {
        if (m > T.hardStopG) {
          this.state = { kind: 'IMPACT', at: t, path: 'hard-stop', peak: m, samples: [] };
        } else if (m < T.freefallG) {
          const since = s.lowSince ?? t;
          this.state = t - since >= T.freefallMs ? { kind: 'FREEFALL', since: t } : { kind: 'IDLE', lowSince: since };
        } else {
          this.state = { kind: 'IDLE', lowSince: null };
        }
        return null;
      }

      case 'FREEFALL':
        if (m > T.impactAfterFallG) {
          this.state = { kind: 'IMPACT', at: t, path: 'fall+impact', peak: m, samples: [] };
        } else if (t - s.since > T.impactMs) {
          this.reset();
        }
        return null;

      case 'IMPACT': {
        const elapsed = t - s.at;
        if (elapsed < T.settleMs) {
          s.peak = Math.max(s.peak, m);
          return null;
        }
        s.samples.push(m);
        if (elapsed < T.settleMs + T.stillMs) return null;

        const mean = s.samples.reduce((a, b) => a + b, 0) / s.samples.length;
        const variance = s.samples.reduce((a, b) => a + (b - mean) ** 2, 0) / s.samples.length;
        const still = Math.sqrt(variance) < T.stillStdG && Math.abs(mean - 1) < T.stillMeanDevG;
        if (!still) {
          this.reset();
          return null;
        }
        this.state = { kind: 'COOLDOWN', until: t + T.cooldownMs };
        return { at: t, path: s.path, peakG: s.peak };
      }
    }
  }
}
