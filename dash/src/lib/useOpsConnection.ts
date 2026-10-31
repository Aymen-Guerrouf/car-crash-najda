import { useEffect, useRef } from 'react';
import { config } from '../config';
import { useOpsStore } from '../store/useOpsStore';
import type { AiVision, IncidentSummary, Report, SmsLog, WsEventEnvelope } from '../types/contracts';
import { fetchHospitals, fetchIncident, fetchOpenIncidents, fetchSmsLogs } from './api';
import { playChime } from './chime';

const BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];
const HOSPITAL_POLL_MS = 30_000; // no hospital websocket event exists (OPEN_QUESTIONS A4)
const DETAIL_REFETCH_MS = 300; // debounce for OPEN_QUESTIONS A3

export function useOpsConnection(soundEnabled: boolean) {
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  useEffect(() => {
    if (config.useMock) {
      useOpsStore.getState().setConnection('open');
      return;
    }

    const store = useOpsStore.getState;
    let stopped = false;
    let ws: WebSocket | null = null;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let detailTimer: ReturnType<typeof setTimeout> | undefined;

    const resync = async () => {
      try {
        const [incidents, hospitals, sms] = await Promise.all([fetchOpenIncidents(), fetchHospitals(), fetchSmsLogs().catch(() => null)]);
        if (stopped) return;
        store().replaceIncidents(incidents);
        store().setHospitals(hospitals);
        if (sms) store().setSmsLogs(sms);
        const selected = store().selectedId;
        if (selected) void refreshDetail(selected);
      } catch (e) {
        console.warn('Resync failed', e);
      }
    };

    const refreshDetail = async (id: string) => {
      try {
        const detail = await fetchIncident(id);
        if (!stopped) store().setDetail(detail);
      } catch (e) {
        console.warn('Detail fetch failed', e);
      }
    };

    const handle = (envelope: WsEventEnvelope) => {
      switch (envelope.type) {
        case 'incident.created':
        case 'incident.updated': {
          const incident = envelope.data as IncidentSummary;
          if (!incident?.id) return;
          const isNew = !store().incidents[incident.id];
          store().upsertIncident(incident);
          if (isNew && soundRef.current) playChime();
          // Reports aren't embedded in incident events: refetch the open detail (A3)
          if (store().selectedId === incident.id) {
            clearTimeout(detailTimer);
            detailTimer = setTimeout(() => void refreshDetail(incident.id), DETAIL_REFETCH_MS);
          }
          break;
        }
        case 'report.created': {
          const data = envelope.data as { incident_id?: string; report?: Report };
          if (data?.incident_id && data.report?.id) store().addReport(data.incident_id, data.report);
          break;
        }
        case 'ai.vision.done': {
          const d = envelope.data as { report_id?: string; incident_id?: string; ai_vision?: AiVision; photo?: string };
          if (d?.report_id && d.incident_id && d.ai_vision) store().setVision(d.incident_id, d.report_id, d.ai_vision, d.photo ?? null);
          break;
        }
        case 'ai.vision.failed': {
          const d = envelope.data as { report_id?: string; reason?: string };
          if (d?.report_id) store().setVisionFailed(d.report_id, d.reason ?? 'failed');
          break;
        }
        case 'sms.received':
        case 'sms.sent': {
          const log = envelope.data as SmsLog;
          if (log?.id !== undefined) store().addSmsLog(log);
          break;
        }
        default:
          // ping and events from later phases: ignored on purpose
          break;
      }
    };

    const connect = () => {
      if (stopped) return;
      store().setConnection(attempt === 0 ? 'connecting' : 'reconnecting');
      ws = new WebSocket(config.wsUrl);
      ws.onopen = () => {
        attempt = 0;
        store().setConnection('open');
        void resync(); // also covers events missed while disconnected
      };
      ws.onmessage = (event) => {
        try {
          handle(JSON.parse(event.data) as WsEventEnvelope);
        } catch {
          // malformed event: never crash the dashboard
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        store().setConnection('reconnecting');
        const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    const hospitalTimer = setInterval(() => {
      fetchHospitals().then((h) => !stopped && store().setHospitals(h)).catch(() => {});
    }, HOSPITAL_POLL_MS);

    // Load the detail whenever the operator selects another incident
    const unsubscribe = useOpsStore.subscribe((s, prev) => {
      if (s.selectedId && s.selectedId !== prev.selectedId) void refreshDetail(s.selectedId);
    });

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearTimeout(detailTimer);
      clearInterval(hospitalTimer);
      unsubscribe();
      ws?.close();
    };
  }, []);
}
