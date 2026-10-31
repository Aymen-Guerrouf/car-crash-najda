import React from 'react';
import { COLLISION_LABELS, INJURY_LABELS, LEVEL_LABELS } from '../../lib/labels';
import type { AiVision } from '../../types/contracts';

/** True when the model looked at the picture and says it is not a crash (nothing else is worth showing). */
export const isNotAccident = (v: AiVision) => v.gate === 'rejected' || v.is_accident === false;

const yesNo = (b: boolean | null | undefined) => (b == null ? 'Inconnu' : b ? 'Oui' : 'Non');

const LEVEL_STYLE: Record<string, string> = {
  HIGH: 'bg-triage-red text-on-red',
  MEDIUM: 'bg-triage-yellow text-on-yellow',
  LOW: 'bg-triage-green text-on-green',
  UNKNOWN: 'bg-panel text-text-muted',
};

/** What the AI saw in one scene photo: collision, severity, key facts, likely injuries and its own confidence. */
export const VisionResult: React.FC<{ vision: AiVision; compact?: boolean }> = ({ vision, compact }) => {
  if (isNotAccident(vision)) {
    return <p className="text-[13px] text-text-muted">L’analyse n’a pas reconnu de véhicule endommagé sur cette photo.</p>;
  }
  const facts: [string, string, boolean][] = [
    ['Véhicules', vision.vehicles_count != null ? String(vision.vehicles_count) : 'Inconnu', false],
    ['Airbag déclenché', yesNo(vision.airbag_deployed), false],
    ['Déformation', LEVEL_LABELS[vision.deformation] ?? vision.deformation, vision.deformation === 'HIGH'],
    ['Intrusion habitacle', yesNo(vision.cabin_intrusion), vision.cabin_intrusion === true],
    ['Tonneau', yesNo(vision.rollover), vision.rollover === true],
    ['Feu / fumée', yesNo(vision.fire_or_smoke), vision.fire_or_smoke === true],
  ];
  const pct = Math.round(vision.confidence * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[16px] font-extrabold">{COLLISION_LABELS[vision.collision_type] ?? vision.collision_type}</span>
        <span className={`h-6 px-2.5 inline-flex items-center rounded-full text-[11px] font-extrabold ${LEVEL_STYLE[vision.impact_severity] ?? LEVEL_STYLE.UNKNOWN}`}>
          Gravité de l’impact : {(LEVEL_LABELS[vision.impact_severity] ?? vision.impact_severity).toLowerCase()}
        </span>
      </div>

      {vision.summary_fr && <p className="text-[14px] font-medium leading-snug">{vision.summary_fr}</p>}

      <dl className={`grid gap-x-4 gap-y-1.5 text-[13px] ${compact ? 'grid-cols-2' : 'grid-cols-[1fr_auto]'}`}>
        {facts.map(([label, value, alert]) => (
          <React.Fragment key={label}>
            <dt className="text-text-muted">{label}</dt>
            <dd className={`font-bold ${compact ? '' : 'text-right'} ${alert ? 'text-triage-red' : ''}`}>{value}</dd>
          </React.Fragment>
        ))}
      </dl>

      {vision.likely_injuries.length > 0 && (
        <div>
          <p className="text-[12px] text-text-muted mb-1.5">Blessures probables</p>
          <div className="flex flex-wrap gap-1.5">
            {vision.likely_injuries.map((i) => (
              <span key={i} className="h-6 px-2.5 inline-flex items-center rounded-full bg-panel text-[12px] font-semibold">
                {INJURY_LABELS[i] ?? i}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between text-[12px] text-text-muted mb-1">
          <span>Confiance de l’analyse</span>
          <span className="font-bold text-text tabular-nums">{pct} %</span>
        </div>
        <div className="h-1.5 rounded-full bg-panel overflow-hidden" role="presentation">
          <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
        </div>
        {vision.low_confidence && (
          <p className="text-[12px] text-triage-red font-semibold mt-1.5">Confiance faible : résultat indicatif, à vérifier avant toute décision.</p>
        )}
      </div>
    </div>
  );
};
