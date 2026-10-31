import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { TriageShape } from '../ui/TriageShape';
import { LogoMark } from '../ui/Logo';
import { allergyLabel, conditionLabel, flagLabel, INJURY_LABELS } from '../../lib/labels';
import { getTriageConfig } from '../../lib/triage';
import type { Hospital, IncidentSummary, Report } from '../../types/contracts';

const URGENCY: Record<string, string> = { RED: 'Urgence absolue', YELLOW: 'Urgence différée', GREEN: 'Urgence légère', UNKNOWN: 'Non évalué' };

interface Props {
  incident: IncidentSummary;
  report: Report;
  hospital?: Hospital;
  onClose: () => void;
}

/**
 * A small ID card for one victim, ready to print or save as PDF (Ctrl+P): triage colour and code on top, then
 * who they are, blood group, history, allergies and the person to call. Built from the report's own data, so
 * a victim with no profile still gets a badge with the code, severity and findings.
 */
export const VictimBadge: React.FC<Props> = ({ incident, report, hospital, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const p = report.profile ?? {};
  const t = getTriageConfig(report.triage);
  const who = [p.age != null ? `${p.age} ans` : null, p.sex === 'M' ? 'Homme' : p.sex === 'F' ? 'Femme' : null].filter(Boolean).join(' · ');
  const flags = (report.flags ?? []).map(flagLabel);
  const pain = ((report.body_pain ?? []) as string[]).map((x) => INJURY_LABELS[x] ?? x);
  const when = new Date(report.received_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const initials = (p.name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

  const field = 'text-[10px] font-extrabold uppercase tracking-[0.12em] text-text-muted';

  return createPortal(
    <div id="badge-print-root" className="fixed inset-0 z-[2000] bg-ink/50 flex items-center justify-center p-6 overflow-auto" role="dialog" aria-modal="true" aria-label="Badge de la victime">
      <div className="flex flex-col items-center gap-4 my-auto">
        <article className="badge-sheet w-[360px] bg-white rounded-2xl overflow-hidden border border-border">
          {/* severity band */}
          <header className="px-5 py-4 flex items-center gap-3.5" style={{ backgroundColor: t.bgVar, color: t.textVar }}>
            <span className="bg-white rounded-full p-1 shrink-0">
              <TriageShape triage={report.triage} size={34} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] opacity-80">Alerte</p>
              <p className="font-mono text-[26px] font-bold leading-none tracking-wider">{incident.short_id}</p>
            </div>
            <p className="text-right text-[12px] font-extrabold leading-tight">
              {t.label}
              <span className="block font-semibold opacity-90">{URGENCY[report.triage] ?? ''}</span>
            </p>
          </header>

          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-4">
              {p.photo_url ? (
                <img src={p.photo_url} alt="" className="w-[84px] h-[84px] rounded-full object-cover border border-border shrink-0" />
              ) : (
                <span className="w-[84px] h-[84px] rounded-full bg-panel border border-border shrink-0 flex items-center justify-center text-2xl font-extrabold text-text-faint">{initials || '?'}</span>
              )}
              <div className="min-w-0">
                <p className="text-[22px] font-extrabold leading-tight break-words">{p.name || 'Identité inconnue'}</p>
                {who && <p className="text-[14px] text-text-muted mt-0.5">{who}</p>}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-[auto_1fr] gap-x-5 items-end">
              <div>
                <p className={field}>Groupe sanguin</p>
                <p className="text-[52px] leading-none font-extrabold text-triage-red mt-1">{p.blood && p.blood !== '??' ? p.blood : '?'}</p>
              </div>
              <div className="min-w-0">
                <p className={field}>Allergies</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(p.allergies ?? []).length > 0 ? (
                    p.allergies!.map((a) => (
                      <span key={a} className="h-6 px-2.5 inline-flex items-center rounded-full border border-triage-red text-triage-red text-[12px] font-bold">
                        {allergyLabel(a, p)}
                      </span>
                    ))
                  ) : (
                    <span className="text-[13px] text-text-muted">Aucune connue</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <p className={field}>Antécédents</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {(p.conditions ?? []).length > 0 ? (
                  p.conditions!.map((c) => (
                    <span key={c} className="h-6 px-2.5 inline-flex items-center rounded-full bg-panel text-[12px] font-semibold">
                      {conditionLabel(c, p)}
                    </span>
                  ))
                ) : (
                  <span className="text-[13px] text-text-muted">Aucun renseigné</span>
                )}
              </div>
            </div>

            {(flags.length > 0 || pain.length > 0) && (
              <div className="mt-4">
                <p className={field}>Constats sur place</p>
                <p className="text-[13px] font-medium mt-1.5">{[...flags, ...pain.map((x) => `Douleur : ${x}`)].join(' · ')}</p>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-line">
              <p className={field}>Contact d’urgence</p>
              <p className="text-[15px] font-bold mt-1">
                {p.contact_name && <span>{p.contact_name} </span>}
                <span className="font-mono">{p.contact || '—'}</span>
              </p>
            </div>
          </div>

          <footer className="px-5 py-3 bg-panel flex items-center gap-3 text-[11px] text-text-muted">
            <LogoMark className="w-6 h-auto shrink-0" />
            <p className="flex-1 min-w-0 leading-snug">
              {when}
              {hospital && <span className="block truncate">Destination : {hospital.name}</span>}
            </p>
          </footer>
        </article>

        <div className="badge-chrome flex gap-2">
          <button type="button" onClick={() => window.print()} className="h-11 px-5 rounded-full bg-ink text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer">
            <Printer className="w-4 h-4" /> Imprimer / PDF
          </button>
          <button type="button" onClick={onClose} className="h-11 px-5 rounded-full bg-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer">
            <X className="w-4 h-4" /> Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
