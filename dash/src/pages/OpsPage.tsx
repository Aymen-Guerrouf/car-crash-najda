import React, { useEffect } from 'react';
import { IncidentQueue } from '../components/ops/IncidentQueue';
import { OpsMap } from '../components/ops/OpsMap';
import { IncidentDetail } from '../components/ops/IncidentDetail';
import { useOpsStore } from '../store/useOpsStore';

/** `/?incident=Q8Z21M` opens that alert as soon as it is loaded (a link an operator can share). */
function useDeepLink() {
  const incidents = useOpsStore((s) => s.incidents);
  const select = useOpsStore((s) => s.select);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('incident')?.trim().toUpperCase();
    if (!code || useOpsStore.getState().selectedId) return;
    const found = Object.values(incidents).find((i) => i.short_id === code);
    if (found) select(found.id);
  }, [incidents, select]);
}

/** Queue · map · detail (spec §7.1): three flat panels side by side, as in the design. */
export const OpsPage: React.FC = () => {
  useDeepLink();
  return (
    <div className="flex-1 flex overflow-hidden">
      <IncidentQueue />
      <main className="flex-1 relative min-w-0" data-testid="ops-map-panel">
        <OpsMap />
      </main>
      <IncidentDetail />
    </div>
  );
};
