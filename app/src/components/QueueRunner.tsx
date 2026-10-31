import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { flushQueue, pendingCount } from '../services/queue';
import { useIncidentStore } from '../store/useIncidentStore';
import { useReportStore } from '../store/useReportStore';

const RETRY_MS = 15_000;

/** Headless: retries undelivered reports when the network comes back and every 15 s while any are waiting. */
export function QueueRunner() {
  useEffect(() => {
    let running = false;

    const run = async () => {
      if (running || (await pendingCount()) === 0) return;
      running = true;
      try {
        for (const { payload, response } of await flushQueue()) {
          // The report on screen got through: switch the draft to HTTP delivery and show the status
          const draft = useReportStore.getState().draft;
          if (draft?.clientId === payload.client_id) {
            useReportStore.getState().patchDraft({ reportId: response.report_id, deliveredVia: 'HTTP' });
            useIncidentStore.getState().setLast({
              ...response,
              channel: 'HTTP',
              alertMs: 0,
              sentAt: Date.now(),
              mock: false,
            });
          }
        }
      } finally {
        running = false;
      }
    };

    void run();
    const timer = setInterval(run, RETRY_MS);
    const unsubscribe = NetInfo.addEventListener((s) => {
      if (s.isConnected) void run();
    });
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, []);

  return null;
}
