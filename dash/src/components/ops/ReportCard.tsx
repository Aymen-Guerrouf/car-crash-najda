import React from 'react';
import { IdCard } from 'lucide-react';
import { answerLabel, DANGER_FLAGS, flagLabel, INJURY_LABELS, isConcerning, questionLabel, ROLE_LABELS } from '../../lib/labels';
import type { IncidentSummary, Report } from '../../types/contracts';

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

/** One submission from one phone: who sent it, how, what it says, and where. */
export const ReportCard: React.FC<{ report: Report; incident?: IncidentSummary; onBadge?: () => void }> = ({ report, incident, onBadge }) => {
  const role = ROLE_LABELS[report.role] ?? { label: report.role, hint: '' };
  const answers = report.answers ?? [];
  const flags = report.flags ?? [];
  const pain = (report.body_pain ?? []) as string[];
  const auto = report.role === 'AUTO';

  return (
    <li className="rounded-xl border border-border p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[13px] font-bold text-text-muted min-w-0" title={role.hint}>
          <span className={auto ? 'text-triage-red' : 'text-text'}>{role.label}</span>
          <span aria-hidden="true">·</span>
          <span>{report.channel === 'SMS' ? 'SMS' : 'Internet'}</span>
          <span aria-hidden="true">·</span>
          <time className="font-mono font-medium">{clock(report.received_at)}</time>
        </p>
        {onBadge && (
          <button
            type="button"
            onClick={onBadge}
            className="shrink-0 h-8 px-3 rounded-lg border border-border text-xs font-bold inline-flex items-center gap-1.5 hover:border-ink cursor-pointer transition-colors"
            title="Générer le badge de cette victime"
          >
            <IdCard className="w-3.5 h-3.5" />
            Badge
          </button>
        )}
      </div>

      {auto ? (
        <p className="mt-3 text-[15px] font-medium text-triage-red">Alerte automatique — la victime n’a pas répondu au compte à rebours après le choc.</p>
      ) : answers.length === 0 && flags.length === 0 && pain.length === 0 ? (
        <p className="mt-3 text-[15px] font-medium">Alerte SOS depuis l’écran d’accueil. Aucune réponse de triage pour l’instant.</p>
      ) : null}

      {answers.length > 0 && (
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13px]">
          {answers.map((a, i) => (
            <React.Fragment key={`${a.q}-${i}`}>
              <dt className="text-text-muted">{questionLabel(a.q)}</dt>
              <dd className={`font-bold text-right ${isConcerning(a.q, a.v) ? 'text-triage-red' : 'text-text'}`}>{answerLabel(a.v)}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}

      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {flags.map((f) => (
            <span
              key={f}
              className={`px-2.5 h-6 inline-flex items-center rounded-full text-[11px] font-bold ${DANGER_FLAGS.has(f) ? 'bg-triage-red/10 text-triage-red' : 'bg-panel text-text'}`}
            >
              {flagLabel(f)}
            </span>
          ))}
        </div>
      )}

      {pain.length > 0 && (
        <p className="text-[13px] text-text-muted mt-3">
          Douleurs signalées : <span className="font-bold text-text">{pain.map((p) => INJURY_LABELS[p] ?? p).join(', ')}</span>
        </p>
      )}

      {incident && (
        <dl className="mt-4 pt-4 border-t border-line grid grid-cols-[88px_1fr] gap-y-2 text-[13px]">
          <dt className="text-text-muted">Position</dt>
          <dd className="font-mono">
            {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
            {incident.accuracy_m != null && <span className="text-text-muted"> · ± {Math.round(incident.accuracy_m)} m</span>}
          </dd>
          {incident.location_note && (
            <>
              <dt className="text-text-muted">Repère</dt>
              <dd className="font-medium">{incident.location_note}</dd>
            </>
          )}
        </dl>
      )}
    </li>
  );
};
