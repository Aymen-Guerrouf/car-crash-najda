import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReportPayload, ReportResponse } from '../types';
import { postReport } from './api';

// Offline retry queue (plan §7 Phase 3): the latest full payload of each report that could not be
// delivered. Retrying is safe: the backend is idempotent on client_id and merges on short_id.
const KEY = 'pending-reports';

interface Pending {
  payload: ReportPayload;
  queuedAt: number;
}

async function load(): Promise<Pending[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as Pending[];
  } catch {
    return [];
  }
}

const save = (items: Pending[]) => AsyncStorage.setItem(KEY, JSON.stringify(items));

export async function enqueue(payload: ReportPayload): Promise<void> {
  const items = (await load()).filter((p) => p.payload.client_id !== payload.client_id);
  items.push({ payload, queuedAt: Date.now() });
  await save(items);
}

export async function pendingCount(): Promise<number> {
  return (await load()).length;
}

/** Tries every queued report once; returns the ones that went through (and removes them). */
export async function flushQueue(): Promise<{ payload: ReportPayload; response: ReportResponse }[]> {
  const items = await load();
  const delivered: { payload: ReportPayload; response: ReportResponse }[] = [];
  const remaining: Pending[] = [];
  for (const item of items) {
    try {
      delivered.push({ payload: item.payload, response: await postReport(item.payload) });
    } catch (e) {
      // 4xx = the backend will never accept this payload: drop it instead of retrying forever
      const status = (e as { status?: number }).status;
      if (status === undefined || status >= 500) remaining.push(item);
    }
  }
  await save(remaining);
  return delivered;
}
