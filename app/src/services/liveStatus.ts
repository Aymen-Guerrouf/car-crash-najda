import { useEffect, useState } from 'react';
import { useIncidentStore } from '../store/useIncidentStore';
import type { LiveStatus } from '../types';
import { WS_URL, isMockApi } from './api';

const BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];

export type SocketState = 'connecting' | 'open' | 'reconnecting' | 'off';

/**
 * Follows the dispatcher's updates for this phone's incident over the websocket
 * (`/ws/incident/<short_id>/`, event `status.updated`, plan §5.4). Reconnects with backoff.
 */
export function useLiveStatus(shortId: string | undefined, enabled = true): SocketState {
  const [state, setState] = useState<SocketState>('off');

  useEffect(() => {
    if (!shortId || !enabled || isMockApi) {
      setState('off');
      return;
    }
    let stopped = false;
    let socket: WebSocket | null = null;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (stopped) return;
      setState(attempt === 0 ? 'connecting' : 'reconnecting');
      socket = new WebSocket(`${WS_URL}/ws/incident/${shortId.toUpperCase()}/`);
      socket.onopen = () => {
        attempt = 0;
        setState('open');
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; data?: LiveStatus };
          if (message.type === 'status.updated' && message.data) useIncidentStore.getState().setLive(message.data);
        } catch {
          // malformed message: ignore, the status screen keeps its last good state
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        setState('reconnecting');
        retry = setTimeout(connect, BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [shortId, enabled]);

  return state;
}
