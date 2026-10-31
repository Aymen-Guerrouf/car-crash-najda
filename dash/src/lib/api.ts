import { config } from '../config';
import type { Hospital, IncidentDetail, IncidentSummary, SmsLog } from '../types/contracts';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${config.apiUrl}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${path} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const fetchOpenIncidents = () => getJson<IncidentSummary[]>('/api/incidents/?open=1');
export const fetchIncident = (id: string) => getJson<IncidentDetail>(`/api/incidents/${id}/`);
export const fetchHospitals = () => getJson<Hospital[]>('/api/hospitals/');
/** Newest first. Tolerates a paginated `{ results }` shape too (OPEN_QUESTIONS A7). */
export async function fetchSmsLogs(limit = 50): Promise<SmsLog[]> {
  const data = await getJson<SmsLog[] | { results: SmsLog[] }>(`/api/sms/logs/?limit=${limit}`);
  return Array.isArray(data) ? data : data.results ?? [];
}

/** Error from a failed POST, carrying the backend's own message (`{error, detail}`) when it sent one. */
export class ActionError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string; detail?: unknown } | null;
    const detail = typeof err?.detail === 'string' ? err.detail : `HTTP ${res.status}`;
    throw new ActionError(detail, res.status, err?.error ?? 'error');
  }
  return (await res.json()) as T;
}

/** "Validate & dispatch": sends the chosen hospital (or the recommended one when omitted). Idempotent. */
export const dispatchIncident = (id: string, hospitalId?: number) =>
  postJson<IncidentDetail>(`/api/incidents/${id}/dispatch/`, hospitalId === undefined ? {} : { hospital_id: hospitalId });

export const resolveIncident = (id: string) => postJson<IncidentDetail>(`/api/incidents/${id}/resolve/`, { by: 'OPERATOR' });

/** Operator adds a photo to a victim's report. Max 2 MB, JPEG/PNG/WEBP (same rules as the phone upload). */
export async function uploadReportPhoto(reportId: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('photo', file);
  const res = await fetch(`${config.apiUrl}/api/reports/${reportId}/profile-photo/`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string; detail?: unknown } | null;
    const known: Record<string, string> = {
      photo_too_large: 'Photo trop lourde (2 Mo maximum).',
      invalid_image: 'Image non valide (JPEG, PNG ou WEBP).',
      cloudinary_not_configured: 'Le stockage des photos n’est pas configuré sur le serveur.',
      upload_failed: 'Le téléversement a échoué, réessayez.',
    };
    throw new ActionError(known[err?.error ?? ''] ?? (typeof err?.detail === 'string' ? err.detail : `Erreur ${res.status}`), res.status, err?.error ?? 'error');
  }
  return ((await res.json()) as { url: string }).url;
}