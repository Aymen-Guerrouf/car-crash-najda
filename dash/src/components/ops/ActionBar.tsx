import React, { useState } from 'react';
import { AlertTriangle, Check, CheckCheck, Loader2 } from 'lucide-react';
import { ActionError, dispatchIncident, resolveIncident } from '../../lib/api';
import { hospitalIdOf } from '../../lib/hospitals';
import { statusLabel } from '../../lib/labels';
import { useOpsStore } from '../../store/useOpsStore';
import type { Hospital, IncidentDetail, IncidentSummary } from '../../types/contracts';

/**
 * Operator actions. Sending the ambulance is one deliberate click on a button that says exactly what it does
 * (the backend call is idempotent, so a double click cannot send twice). Closing an incident still asks first:
 * it removes the alert from the queue and tells the reporter.
 */
export const ActionBar: React.FC<{ incident: IncidentSummary; hospitals: Hospital[]; selectedId: number | null }> = ({
  incident,
  hospitals,
  selectedId,
}) => {
  const applyDetail = useOpsStore((s) => s.applyDetail);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [busy, setBusy] = useState<'dispatch' | 'resolve' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const closed = incident.status === 'RESOLVED' || incident.status === 'CANCELLED';
  const currentId = hospitalIdOf(incident);
  const target = hospitals.find((h) => h.id === selectedId);
  const alreadyThere = incident.status === 'DISPATCHED' && selectedId === currentId;
  const canDispatch = !closed && !alreadyThere && target !== undefined;

  const run = async (kind: 'dispatch' | 'resolve', action: () => Promise<IncidentDetail>) => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      applyDetail(await action());
      setConfirmResolve(false);
    } catch (e) {
      setError(e instanceof ActionError ? e.message : 'Impossible de joindre le serveur. Rien n’a été modifié.');
    } finally {
      setBusy(null);
    }
  };

  if (closed) {
    return (
      <div className="px-8 py-5 border-t border-border bg-surface text-sm font-bold text-text-muted flex items-center gap-2">
        <CheckCheck className="w-4 h-4 text-triage-green" />
        Incident {statusLabel(incident.status).toLowerCase()}
      </div>
    );
  }

  const label = alreadyThere
    ? 'Ambulance envoyée'
    : incident.status === 'DISPATCHED'
      ? `Changer la destination${target ? ` · ${target.short_name || target.name}` : ''}`
      : `Valider et envoyer${target ? ` · ${target.short_name || target.name}` : ''}`;

  return (
    <div className="border-t border-border bg-surface px-6 py-4 space-y-3" data-testid="action-bar">
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-triage-red font-semibold">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </p>
      )}

      {!confirmResolve ? (
        <>
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              disabled={!canDispatch || busy !== null}
              onClick={() => run('dispatch', () => dispatchIncident(incident.id, selectedId ?? undefined))}
              title="L’ambulance part sur le lieu de l’accident ; l’hôpital choisi est la destination du patient."
              className={`w-full min-h-12 px-5 py-2 rounded-full text-white text-[15px] leading-tight font-bold inline-flex items-center justify-center gap-2.5 text-center transition-opacity ${
                alreadyThere ? 'bg-ink cursor-default' : 'bg-triage-red cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              {busy === 'dispatch' ? <Loader2 className="w-5 h-5 shrink-0 animate-spin" /> : <Check className="w-5 h-5 shrink-0" strokeWidth={3} />}
              <span>{label}</span>
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setConfirmResolve(true)}
              className="w-full h-11 rounded-full border border-ink text-[14px] font-bold cursor-pointer hover:bg-panel disabled:opacity-40 transition-colors"
            >
              Clôturer
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">Marquer cet incident comme résolu ? Il quittera la file ouverte et le déclarant sera prévenu.</p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run('resolve', () => resolveIncident(incident.id))}
              className="flex-1 h-12 rounded-full bg-triage-green text-white text-[15px] font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {busy === 'resolve' && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmer la clôture
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setConfirmResolve(false);
                setError(null);
              }}
              className="h-12 px-6 rounded-lg border border-border text-[15px] font-bold cursor-pointer hover:bg-panel"
            >
              Annuler
            </button>
          </div>
        </>
      )}
    </div>
  );
};
