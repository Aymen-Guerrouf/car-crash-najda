import { create } from 'zustand';
import type { AnswerItem } from '../features/triage/trees';
import type { Channel, Flag, Injury, Role, Triage } from '../types';

export interface Counts {
  RED: number;
  YELLOW: number;
  GREEN: number;
}

/** One report = one victim of the accident, built on this phone. */
export interface Draft {
  clientId: string;
  shortId: string;
  role: Role;
  triage: Triage;
  answers: AnswerItem[];
  /** Flags from the triage answers (the tree's own flag). */
  flags: Flag[];
  /** Scene hazards the witness ticked (fire, fuel leak...): only the first victim's report carries them. */
  hazards: Flag[];
  bodyPain: Injury[];
  lat: number;
  lng: number;
  accuracyM: number | null;
  /** Only the victim's own reports carry the phone owner's medical profile (not a witness's). */
  sendProfile: boolean;
  /** Landmark typed by a witness ("near the Sidi Bel Abbès exit"). */
  locationNote: string;
  /** Counts for the whole accident, set on the first victim's report (the backend max-merges counts). */
  victimCounts: Counts | null;
  /** "It's a different accident": skip the backend's duplicate detection. */
  forceNew: boolean;
  /** Re-running the triage from the status screen: the result goes straight back to sending. */
  updating: boolean;
  /** `online` = send early and PATCH after each answer; `offline` = answer everything, then one SMS. */
  mode: 'online' | 'offline';
  /** Server id of the report once the first POST succeeded. */
  reportId: string | null;
  /** How it was delivered, once it was. */
  deliveredVia: Channel | null;
  createdAt: number;
}

/** Witness-wide facts that are not part of one victim's report. */
export interface WitnessState {
  /** Number of victims the witness reports. */
  total: number;
  /** Mass casualty (5+): counts only, no per-victim questions. */
  mciCounts: Counts | null;
}

const NO_WITNESS: WitnessState = { total: 1, mciCounts: null };

interface ReportState {
  /** The victim being worked on (always `victims[active]`). */
  draft: Draft | null;
  victims: Draft[];
  active: number;
  witness: WitnessState;
  /** Start over with a single report (or none). */
  setDraft: (draft: Draft | null) => void;
  patchDraft: (patch: Partial<Draft>) => void;
  /** Update any victim, not only the active one. */
  patchVictim: (index: number, patch: Partial<Draft>) => void;
  /** Add the next victim's report and make it the active one. */
  addVictim: (draft: Draft) => void;
  setActive: (index: number) => void;
  setWitness: (patch: Partial<WitnessState>) => void;
}

export const useReportStore = create<ReportState>((set) => ({
  draft: null,
  victims: [],
  active: 0,
  witness: NO_WITNESS,

  setDraft: (draft) => set({ draft, victims: draft ? [draft] : [], active: 0, witness: NO_WITNESS }),

  patchDraft: (patch) =>
    set((s) => {
      if (!s.draft) return s;
      const draft = { ...s.draft, ...patch };
      return { draft, victims: s.victims.map((v, i) => (i === s.active ? draft : v)) };
    }),

  patchVictim: (index, patch) =>
    set((s) => {
      if (!s.victims[index]) return s;
      const victims = s.victims.map((v, i) => (i === index ? { ...v, ...patch } : v));
      return { victims, draft: victims[s.active] ?? s.draft };
    }),

  addVictim: (draft) => set((s) => ({ victims: [...s.victims, draft], active: s.victims.length, draft })),

  setActive: (index) => set((s) => (s.victims[index] ? { active: index, draft: s.victims[index] } : s)),

  setWitness: (patch) => set((s) => ({ witness: { ...s.witness, ...patch } })),
}));
