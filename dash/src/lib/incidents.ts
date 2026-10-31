import type { Hospital, IncidentSummary, IncidentStatus, Triage } from '../types/contracts';
import { getTriageConfig } from './triage';

export const OPEN_STATUSES: IncidentStatus[] = ['NEW', 'VALIDATED', 'DISPATCHED'];

export const isOpen = (i: IncidentSummary) => OPEN_STATUSES.includes(i.status);

/** Newest first: the queue reads as a timeline. Severity is a filter and a colour, not the order. */
export function sortIncidents(list: IncidentSummary[]): IncidentSummary[] {
  return [...list].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export interface QueueFilter {
  /** Free text: matches the incident code (any part, any case), the location note or the hospital name. */
  query: string;
  triage: Triage | 'ALL';
  /** NEW = still to handle, DISPATCHED = ambulance already sent. */
  status: 'ALL' | 'TODO' | 'DISPATCHED';
}

export const EMPTY_FILTER: QueueFilter = { query: '', triage: 'ALL', status: 'ALL' };

export function filterIncidents(list: IncidentSummary[], f: QueueFilter, hospitals: Hospital[]): IncidentSummary[] {
  const q = f.query.trim().toLowerCase();
  return list.filter((i) => {
    if (f.triage !== 'ALL' && getTriageConfig(i.worst_triage).letter !== getTriageConfig(f.triage).letter) return false;
    if (f.status === 'DISPATCHED' && i.status !== 'DISPATCHED') return false;
    if (f.status === 'TODO' && i.status === 'DISPATCHED') return false;
    if (!q) return true;
    const haystack = [i.short_id, i.location_note, hospitalName(i, hospitals)].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

export function countByTriage(list: IncidentSummary[]): Record<Triage, number> {
  const counts: Record<Triage, number> = { RED: 0, YELLOW: 0, GREEN: 0, UNKNOWN: 0 };
  for (const i of list) counts[(i.worst_triage in counts ? i.worst_triage : 'UNKNOWN') as Triage] += 1;
  return counts;
}

/** `incident.hospital` may be a full object, a partial one, or an id (OPEN_QUESTIONS A1). */
export function hospitalName(i: IncidentSummary, hospitals: Hospital[]): string | null {
  const h = i.hospital;
  if (h == null) return null;
  if (typeof h === 'number') return hospitals.find((x) => x.id === h)?.name ?? `Hospital #${h}`;
  return h.name;
}

/** "à l'instant", "3 min", "2 h" — compact age for queue rows. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (Number.isNaN(s)) return '—';
  if (s < 10) return "à l'instant";
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} j`;
}

/** "il y a 3 min" / "à l'instant" for sentences. */
export function agoPhrase(iso: string, now = Date.now()): string {
  const t = timeAgo(iso, now);
  return t === "à l'instant" || t === '—' ? t : `il y a ${t}`;
}
