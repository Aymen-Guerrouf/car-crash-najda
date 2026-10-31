import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { LogoMark } from '../ui/Logo';
import { TriageShape } from '../ui/TriageShape';
import { VisionResult } from './VisionResult';
import { mediaUrl } from '../../lib/media';
import {
  allergyLabel, answerLabel, conditionLabel, flagLabel, INJURY_LABELS, isConcerning, questionLabel, ROLE_LABELS, statusLabel,
} from '../../lib/labels';
import { getTriageConfig } from '../../lib/triage';
import type { Hospital, IncidentSummary, MedicalProfile, Report } from '../../types/contracts';

const URGENCY: Record<string, string> = { RED: 'Urgence absolue', YELLOW: 'Urgence différée', GREEN: 'Urgence légère', UNKNOWN: 'Non évalué' };

const when = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="report-section px-8 py-5 border-t border-line">
    <h2 className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-text-muted mb-3">{title}</h2>
    {children}
  </section>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <dt className="text-text-muted">{label}</dt>
    <dd className="font-semibold">{children}</dd>
  </>
);

/** The newest report that carries a profile, per distinct person (same name + contact = same person). */
function profiles(reports: Report[]): MedicalProfile[] {
  const seen = new Map<string, MedicalProfile>();
  for (const r of [...reports].reverse()) {
    if (!r.profile || Object.keys(r.profile).length === 0) continue;
    const key = `${(r.profile.name ?? '').toLowerCase()}|${r.profile.contact ?? ''}`;
    if (!seen.has(key)) seen.set(key, r.profile);
  }
  return [...seen.values()];
}

interface Props {
  incident: IncidentSummary;
  reports: Report[];
  hospital?: Hospital;
  onClose: () => void;
}

/**
 * The complete intervention report for one incident (insurance, hospital file, archive): accident, victim and medical
 * profile, the triage answers of every report, the scene photo with the AI analysis, and the dispatch. Everything is
 * read from data already on the incident, so it is always consistent with the screen. Print or save as PDF.
 */
export const FinalReport: React.FC<Props> = ({ incident, reports, hospital, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const t = getTriageConfig(incident.worst_triage);
  const people = profiles(reports);
  const photos = reports.filter((r) => r.photo);
  const total = incident.victim_counts.RED + incident.victim_counts.YELLOW + incident.victim_counts.GREEN;
  const hospitalName = hospital?.name ?? (typeof incident.hospital === 'object' && incident.hospital ? incident.hospital.name : null);
  const hospitalPhone = hospital?.phone ?? (typeof incident.hospital === 'object' && incident.hospital ? incident.hospital.phone : undefined);
  const channels = [...new Set(reports.map((r) => (r.channel === 'SMS' ? 'SMS' : 'Internet')))].join(', ') || '—';

  return createPortal(
    <div id="report-print-root" className="fixed inset-0 z-[2000] bg-ink/50 overflow-auto p-6" role="dialog" aria-modal="true" aria-label="Rapport final">
      <div className="report-chrome sticky top-0 z-10 flex justify-center gap-2 pb-4">
        <button type="button" onClick={() => window.print()} className="h-11 px-5 rounded-full bg-ink text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer">
          <Printer className="w-4 h-4" /> Imprimer / enregistrer en PDF
        </button>
        <button type="button" onClick={onClose} className="h-11 px-5 rounded-full bg-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer">
          <X className="w-4 h-4" /> Fermer
        </button>
      </div>

      <article className="report-sheet mx-auto w-full max-w-[820px] bg-white rounded-2xl overflow-hidden text-[13px] leading-snug">
        <header className="px-8 py-6 flex items-center gap-4" style={{ backgroundColor: t.bgVar, color: t.textVar }}>
          <span className="bg-white rounded-full p-1.5 shrink-0">
            <TriageShape triage={incident.worst_triage} size={40} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] opacity-80">Rapport d’intervention</p>
            <p className="font-mono text-[34px] font-bold leading-none tracking-wider mt-1">{incident.short_id}</p>
          </div>
          <p className="text-right text-[14px] font-extrabold leading-tight">
            {t.label}
            <span className="block font-semibold opacity-90">{URGENCY[incident.worst_triage]}</span>
          </p>
        </header>

        <Section title="Synthèse">
          <dl className="grid grid-cols-[150px_1fr_150px_1fr] gap-x-4 gap-y-2">
            <Row label="Alerte reçue">{when(incident.created_at)}</Row>
            <Row label="Statut">{statusLabel(incident.status)}</Row>
            <Row label="Victimes">
              {total > 0 ? `${total} (rouge ${incident.victim_counts.RED} · jaune ${incident.victim_counts.YELLOW} · vert ${incident.victim_counts.GREEN})` : 'Non précisé'}
              {incident.is_mci && ' · afflux de victimes'}
            </Row>
            <Row label="Signalements">{reports.length} ({channels})</Row>
            <Row label="Ambulance envoyée">{when(incident.dispatched_at)}</Row>
            <Row label="Clôturé">{when(incident.resolved_at)}</Row>
          </dl>
          {incident.flags.length > 0 && (
            <p className="mt-3">
              <span className="text-text-muted">Dangers signalés : </span>
              <span className="font-bold">{incident.flags.map(flagLabel).join(' · ')}</span>
            </p>
          )}
        </Section>

        <Section title="Lieu de l’accident">
          <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2">
            <Row label="Coordonnées">
              <span className="font-mono">
                {incident.lat.toFixed(5)}, {incident.lng.toFixed(5)}
              </span>
              {incident.accuracy_m != null && <span className="text-text-muted font-normal"> · précision ± {Math.round(incident.accuracy_m)} m</span>}
            </Row>
            {incident.location_note && <Row label="Repère">{incident.location_note}</Row>}
          </dl>
        </Section>

        <Section title="Victime et profil médical">
          {people.length === 0 ? (
            <p className="text-text-muted">Aucun profil médical n’a été joint aux signalements.</p>
          ) : (
            <div className="space-y-5">
              {people.map((p, i) => (
                <div key={i} className="report-block flex gap-5">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt="" className="w-[92px] h-[92px] rounded-xl object-cover border border-border shrink-0" />
                  ) : (
                    <span className="w-[92px] h-[92px] rounded-xl bg-panel border border-border shrink-0" aria-hidden="true" />
                  )}
                  <dl className="flex-1 grid grid-cols-[130px_1fr] gap-x-4 gap-y-1.5">
                    <Row label="Nom">{p.name || 'Identité inconnue'}</Row>
                    <Row label="Âge · sexe">
                      {[p.age != null ? `${p.age} ans` : null, p.sex === 'M' ? 'Homme' : p.sex === 'F' ? 'Femme' : null].filter(Boolean).join(' · ') || 'Non renseignés'}
                    </Row>
                    <Row label="Groupe sanguin">{p.blood && p.blood !== '??' ? p.blood : 'Inconnu'}</Row>
                    <Row label="Antécédents">{(p.conditions ?? []).map((c) => conditionLabel(c, p)).join(', ') || 'Aucun renseigné'}</Row>
                    <Row label="Allergies">{(p.allergies ?? []).map((a) => allergyLabel(a, p)).join(', ') || 'Aucune connue'}</Row>
                    <Row label="Contact d’urgence">{[p.contact_name, p.contact].filter(Boolean).join(' · ') || '—'}</Row>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Évaluation sur place">
          <div className="space-y-4">
            {reports.map((r) => {
              const role = ROLE_LABELS[r.role]?.label ?? r.role;
              const pain = ((r.body_pain ?? []) as string[]).map((x) => INJURY_LABELS[x] ?? x);
              return (
                <div key={r.id} className="report-block">
                  <p className="font-bold">
                    {role} · {r.channel === 'SMS' ? 'SMS' : 'Internet'} · <span className="font-mono font-medium">{when(r.received_at)}</span>
                  </p>
                  {r.role === 'AUTO' ? (
                    <p className="text-text-muted mt-1">Alerte automatique : la victime n’a pas répondu au compte à rebours après le choc.</p>
                  ) : (r.answers ?? []).length === 0 ? (
                    <p className="text-text-muted mt-1">Aucune réponse au questionnaire de triage.</p>
                  ) : (
                    <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1">
                      {r.answers.map((a, i) => (
                        <React.Fragment key={`${a.q}-${i}`}>
                          <dt className="text-text-muted">{questionLabel(a.q)}</dt>
                          <dd className={`font-bold text-right ${isConcerning(a.q, a.v) ? 'text-triage-red' : ''}`}>{answerLabel(a.v)}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  )}
                  {(r.flags ?? []).length > 0 && <p className="mt-1.5 font-semibold">{r.flags.map(flagLabel).join(' · ')}</p>}
                  {pain.length > 0 && <p className="mt-1">Douleurs signalées : <span className="font-semibold">{pain.join(', ')}</span></p>}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Photo de la scène et analyse IA">
          {photos.length === 0 ? (
            <p className="text-text-muted">Aucune photo de la scène n’a été envoyée.</p>
          ) : (
            <div className="space-y-5">
              {photos.map((r) => (
                <div key={r.id} className="report-block grid grid-cols-[300px_1fr] gap-6">
                  <img src={mediaUrl(r.photo) ?? ''} alt="Photo de la scène" className="w-full rounded-xl object-cover bg-panel border border-border" />
                  {r.ai_vision ? <VisionResult vision={r.ai_vision} compact /> : <p className="text-text-muted">L’analyse automatique n’est pas disponible pour cette photo.</p>}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-text-muted">L’analyse par intelligence artificielle est une aide indicative. Elle ne remplace pas le constat d’un professionnel.</p>
        </Section>

        <Section title="Prise en charge">
          <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2">
            <Row label="Hôpital de destination">{hospitalName ?? 'Non attribué'}{hospitalPhone && <span className="font-mono font-normal"> · {hospitalPhone}</span>}</Row>
            <Row label="Temps estimé">{incident.eta_min != null ? `${incident.eta_min} min` : '—'}</Row>
            {incident.hospital_reason && <Row label="Raison du choix">{incident.hospital_reason}</Row>}
          </dl>
          {incident.er_brief && (
            <p className="mt-3 rounded-lg bg-panel p-4 font-medium">
              <span className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-text-muted mb-1">Note transmise à l’hôpital</span>
              {incident.er_brief}
            </p>
          )}
        </Section>

        <footer className="px-8 py-4 bg-panel flex items-center gap-3 text-[11px] text-text-muted">
          <LogoMark className="w-6 h-auto shrink-0" />
          <p className="flex-1 leading-snug">Document généré par Nadjda le {when(new Date().toISOString())}. Les informations proviennent des signalements reçus et n’ont pas de valeur de diagnostic médical.</p>
        </footer>
      </article>
    </div>,
    document.body,
  );
};
