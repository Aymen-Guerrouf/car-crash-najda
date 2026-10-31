import { create } from 'zustand';
import type { Channel, LiveStatus, ReportResponse } from '../types';

export interface SentAlert extends ReportResponse {
  channel: Channel;
  alertMs: number;
  sentAt: number;
  mock: boolean;
}

interface IncidentState {
  last: SentAlert | null;
  /** Latest status.updated from the dispatcher for this phone's incident. */
  live: LiveStatus | null;
  /** When the latest dispatcher update arrived (ms), for the timeline. */
  liveAt: number | null;
  /** User confirmed they received the ambulance dispatch SMS (offline flow). */
  smsConfirmed: boolean;
  /** Timestamp when the user confirmed the SMS dispatch. */
  smsConfirmedAt: number | null;
  setLast: (alert: SentAlert | null) => void;
  setLive: (live: LiveStatus | null) => void;
  /** Mark that the user received the ambulance dispatch SMS notification. */
  confirmSmsDispatch: () => void;
}

export const useIncidentStore = create<IncidentState>((set) => ({
  last: null,
  live: null,
  liveAt: null,
  smsConfirmed: false,
  smsConfirmedAt: null,
  // A different incident starts with a clean live status
  setLast: (last) => set((s) => ({
    last,
    live: last && s.last?.short_id === last.short_id ? s.live : null,
    smsConfirmed: last && s.last?.short_id === last.short_id ? s.smsConfirmed : false,
    smsConfirmedAt: last && s.last?.short_id === last.short_id ? s.smsConfirmedAt : null,
  })),
  setLive: (live) => set({ live, liveAt: live ? Date.now() : null }),
  confirmSmsDispatch: () => set({ smsConfirmed: true, smsConfirmedAt: Date.now() }),
}));

