import React from 'react';
import { hospitalOptions } from '../../lib/hospitals';
import { useOpsStore } from '../../store/useOpsStore';
import type { Hospital, IncidentSummary } from '../../types/contracts';

/**
 * Destination hospital: the recommended one plus the alternatives. The operator can pick another one before
 * sending the ambulance; the choice is never overwritten by a later recommendation.
 */
export const HospitalChoice: React.FC<{
  incident: IncidentSummary;
  hospitals: Hospital[];
  selectedId: number | null;
  locked: boolean;
}> = ({ incident, hospitals, selectedId, locked }) => {
  const choose = useOpsStore((s) => s.chooseHospital);
  const options = hospitalOptions(incident, hospitals);

  if (options.length === 0) {
    return <p className="text-[13px] text-text-muted">Aucun hôpital recommandé pour le moment.</p>;
  }

  return (
    <ul className="space-y-3" role="radiogroup" aria-label="Hôpital de destination">
      {options.map(({ hospital, etaMin, reason, primary }) => {
        const selected = hospital.id === selectedId;
        const facts = [primary ? 'Le plus proche' : reason, `${hospital.beds_available} ${hospital.beds_available > 1 ? 'lits libres' : 'lit libre'}`, ...hospital.capabilities.slice(0, 2).map((c) => c.replace(/_/g, ' ').toLowerCase().replace(/^./, (m) => m.toUpperCase()))]
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={hospital.id}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked}
              onClick={() => choose(incident.id, hospital.id)}
              className={`w-full text-left rounded-xl px-5 py-4 flex items-center gap-4 transition-colors ${
                selected ? 'border-2 border-ink' : 'border border-border hover:border-text-faint'
              } ${locked ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <span className={`w-[22px] h-[22px] rounded-full border-2 shrink-0 flex items-center justify-center ${selected ? 'border-ink' : 'border-text-faint'}`} aria-hidden="true">
                {selected && <span className="w-3 h-3 rounded-full bg-ink" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[17px] font-bold truncate">{hospital.name}</span>
                <span className="block text-[13px] text-text-muted mt-0.5">{facts}</span>
              </span>
              {etaMin != null && (
                <span className="text-right shrink-0 leading-none">
                  <span className="block text-[34px] font-extrabold tabular-nums">{etaMin}</span>
                  <span className="block text-[13px] text-text-muted mt-1">min</span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
};
