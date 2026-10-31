import { create } from 'zustand';
import type { ConnectionStatus } from '../components/layout/ConnectionBanner';
import type { AiVision, Hospital, IncidentDetail, IncidentSummary, Report, SmsLog } from '../types/contracts';

const SMS_CAP = 50;

interface OpsState {
  connection: ConnectionStatus;
  incidents: Record<string, IncidentSummary>;
  /** Full detail (reports) for incidents the operator has opened. */
  details: Record<string, IncidentDetail>;
  hospitals: Hospital[];
  /** SMS log, newest first, capped. */
  smsLogs: SmsLog[];
  selectedId: string | null;
  /** Hospital the operator picked per incident, before dispatching (overrides the recommendation). */
  chosen: Record<string, number>;
  /** Incident ids that just arrived: the queue flashes them for a few seconds. */
  flashing: Record<string, true>;

  setConnection: (status: ConnectionStatus) => void;
  replaceIncidents: (list: IncidentSummary[]) => void;
  upsertIncident: (incident: IncidentSummary) => void;
  setDetail: (detail: IncidentDetail) => void;
  addReport: (incidentId: string, report: Report) => void;
  /** Scene photos whose AI analysis failed (report id -> reason): shown as Analyse indisponible. */
  visionFailed: Record<string, string>;
  /** The AI finished analysing a report's scene photo. */
  setVision: (incidentId: string, reportId: string, vision: AiVision, photo: string | null) => void;
  setVisionFailed: (reportId: string, reason: string) => void;
  /** The operator attached a photo to a victim's report. */
  setReportPhoto: (incidentId: string, reportId: string, url: string) => void;
  setHospitals: (hospitals: Hospital[]) => void;
  setSmsLogs: (logs: SmsLog[]) => void;
  addSmsLog: (log: SmsLog) => void;
  select: (id: string | null) => void;
  chooseHospital: (incidentId: string, hospitalId: number) => void;
  /** Apply the full incident returned by dispatch / resolve (same data the websocket will push). */
  applyDetail: (detail: IncidentDetail) => void;
  clearFlash: (id: string) => void;
}

export const useOpsStore = create<OpsState>((set) => ({
  connection: 'connecting',
  incidents: {},
  details: {},
  hospitals: [],
  smsLogs: [],
  selectedId: null,
  chosen: {},
  flashing: {},
  visionFailed: {},

  setVision: (incidentId, reportId, vision, photo) =>
    set((s) => {
      const detail = s.details[incidentId];
      const { [reportId]: _failed, ...visionFailed } = s.visionFailed;
      if (!detail) return { visionFailed };
      const reports = detail.reports.map((r) => (r.id === reportId ? { ...r, ai_vision: vision, photo: photo ?? r.photo } : r));
      return { visionFailed, details: { ...s.details, [incidentId]: { ...detail, reports } } };
    }),

  setVisionFailed: (reportId, reason) => set((s) => ({ visionFailed: { ...s.visionFailed, [reportId]: reason } })),

  setConnection: (connection) => set({ connection }),

  replaceIncidents: (list) =>
    set({ incidents: Object.fromEntries(list.map((i) => [i.id, i])) }),

  upsertIncident: (incident) =>
    set((s) => ({
      incidents: { ...s.incidents, [incident.id]: incident },
      flashing: s.incidents[incident.id] ? s.flashing : { ...s.flashing, [incident.id]: true },
    })),

  setDetail: (detail) => set((s) => ({ details: { ...s.details, [detail.id]: detail } })),

  // Same report can arrive twice (REST detail + websocket): keyed by id, never duplicated
  addReport: (incidentId, report) =>
    set((s) => {
      const detail = s.details[incidentId];
      if (!detail || detail.reports.some((r) => r.id === report.id)) return s;
      return { details: { ...s.details, [incidentId]: { ...detail, reports: [...detail.reports, report] } } };
    }),

  setReportPhoto: (incidentId, reportId, url) =>
    set((s) => {
      const detail = s.details[incidentId];
      if (!detail) return s;
      const reports = detail.reports.map((r) => (r.id === reportId ? { ...r, profile: { ...(r.profile ?? {}), photo_url: url } } : r));
      return { details: { ...s.details, [incidentId]: { ...detail, reports } } };
    }),

  setHospitals: (hospitals) => set({ hospitals }),

  setSmsLogs: (smsLogs) => set({ smsLogs: smsLogs.slice(0, SMS_CAP) }),

  // A log row can arrive both from the websocket and from a REST resync: dedupe by id
  addSmsLog: (log) =>
    set((s) => {
      if (s.smsLogs.some((l) => String(l.id) === String(log.id))) return s;
      return { smsLogs: [log, ...s.smsLogs].slice(0, SMS_CAP) };
    }),

  select: (selectedId) => set({ selectedId }),

  chooseHospital: (incidentId, hospitalId) => set((s) => ({ chosen: { ...s.chosen, [incidentId]: hospitalId } })),

  applyDetail: (detail) =>
    set((s) => {
      const { reports: _reports, ...summary } = detail;
      const { [detail.id]: _picked, ...chosen } = s.chosen; // the dispatch made the choice official
      return { details: { ...s.details, [detail.id]: detail }, incidents: { ...s.incidents, [detail.id]: summary }, chosen };
    }),

  clearFlash: (id) =>
    set((s) => {
      const { [id]: _removed, ...rest } = s.flashing;
      return { flashing: rest };
    }),
}));
