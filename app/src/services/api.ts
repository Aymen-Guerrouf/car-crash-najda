import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import type { NearbyIncident, ReportPatch, ReportPayload, ReportResponse } from '../types';

/**
 * Where the backend is. `EXPO_PUBLIC_API_URL=auto` means "on the same computer as the Expo dev server, port 8000":
 * the address is read from Expo itself, so it follows the computer when it changes Wi-Fi (no .env edit).
 * A fixed URL (https tunnel, deployed server) is used as given.
 */
function resolveApiUrl(): string {
  const configured = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  if (configured !== 'auto') return configured;
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? '';
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? `http://${host}:8000` : '';
}

const API_URL = resolveApiUrl();

/** No backend configured: reports are answered locally so the app can be demoed alone. */
export const isMockApi = API_URL === '';

/** Websocket address of the same server (http -> ws, https -> wss). */
export const WS_URL = API_URL.replace(/^http/, 'ws');

export class ApiError extends Error {
  /** HTTP status, undefined for network errors / timeouts (those are worth retrying later). */
  status?: number;
  /** Backend error code, e.g. "validation_error", "cloudinary_not_configured". */
  code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  /** True when retrying the same request later can succeed (no answer, or server-side failure). */
  get retryable() {
    return this.status === undefined || this.status >= 500;
  }
}

async function request<T>(path: string, init: RequestInit, timeoutMs = 5000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'ngrok-skip-browser-warning': '1',
        ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(`HTTP ${res.status}`, res.status, body?.error);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e instanceof Error ? e.message : 'network error');
  } finally {
    clearTimeout(timer);
  }
}

/** Real reachability check (NetInfo can say "connected" on a captive Wi-Fi with no internet). */
export async function pingBackend(timeoutMs = 2500): Promise<boolean> {
  if (isMockApi) return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/api/health/`, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'ngrok-skip-browser-warning': '1' },
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function mockPostReport(payload: ReportPayload): Promise<ReportResponse> {
  await new Promise((r) => setTimeout(r, 400));
  return {
    report_id: payload.client_id,
    incident_id: payload.short_id,
    short_id: payload.short_id,
    merged: false,
    worst_triage: payload.triage,
    hospital: { id: 0, name: 'CHU (démo)', eta_min: 12 },
  };
}

export function postReport(payload: ReportPayload): Promise<ReportResponse> {
  if (isMockApi) return mockPostReport(payload);
  return request<ReportResponse>('/api/reports/', { method: 'POST', body: JSON.stringify(payload) });
}

export function patchReport(reportId: string, patch: ReportPatch, shortId: string): Promise<ReportResponse> {
  if (isMockApi) {
    return Promise.resolve({
      report_id: reportId,
      incident_id: shortId,
      short_id: shortId,
      merged: false,
      worst_triage: patch.triage,
      hospital: { id: 0, name: 'CHU (démo)', eta_min: 12 },
    });
  }
  return request<ReportResponse>(`/api/reports/${reportId}/`, { method: 'PATCH', body: JSON.stringify(patch) });
}

/** Multipart upload of a profile picture; resolves to the Cloudinary URL to send as profile.photo_url. */
export async function uploadProfilePhoto(fileUri: string): Promise<string> {
  if (isMockApi) throw new ApiError('no backend configured', undefined, 'mock');
  const form = new FormData();
  // Expo's fetch only accepts real file objects in a FormData (the old { uri, name, type } descriptor is rejected)
  form.append('photo', new File(fileUri) as unknown as Blob, 'profile.jpg');
  const out = await request<{ url: string }>('/api/profile-photo/', { method: 'POST', body: form }, 20000);
  return out.url;
}

/** Scene photo of a report (JPEG, <= 300 KB): the backend analyses it and shows the result to the dispatcher. */
export async function uploadScenePhoto(reportId: string, fileUri: string): Promise<void> {
  if (isMockApi) throw new ApiError('no backend configured', undefined, 'mock');
  const form = new FormData();
  form.append('photo', new File(fileUri) as unknown as Blob, 'scene.jpg');
  await request(`/api/reports/${reportId}/photo/`, { method: 'POST', body: form }, 20000);
}

/** "Is there already an open incident within 300 m / 10 min?" (witness duplicate prompt). */
export async function checkNearby(lat: number, lng: number): Promise<NearbyIncident | null> {
  if (isMockApi) return null;
  const out = await request<{ incident: NearbyIncident | null }>('/api/incidents/nearby-check/', {
    method: 'POST',
    body: JSON.stringify({ lat, lng }),
  });
  return out.incident;
}

/** "Situation resolved" from the reporter's phone. Idempotent on the backend. */
export async function resolveIncident(incidentId: string): Promise<void> {
  if (isMockApi) return;
  await request(`/api/incidents/${incidentId}/resolve/`, { method: 'POST', body: JSON.stringify({ by: 'REPORTER' }) });
}

/** Hospital the dispatcher chose for an incident (offline reporters look it up once the phone is back online). */
export async function fetchDispatchInfo(shortId: string): Promise<{ hospital: { name: string; phone: string } | null; eta_min: number | null } | null> {
  if (isMockApi) return null;
  const inc = await request<{ hospital: { name: string; phone: string } | null; eta_min: number | null }>(`/api/incidents/by-short/${shortId.toUpperCase()}/`, { method: 'GET' });
  return { hospital: inc.hospital ?? null, eta_min: inc.eta_min ?? null };
}