import React, { useEffect, useState } from 'react';
import { FileText, IdCard, TriangleAlert, User, Wifi, MessageSquare } from 'lucide-react';
import { TriageShape } from '../ui/TriageShape';
import { LogoFull } from '../ui/Logo';
import { ReportCard } from './ReportCard';
import { ActionBar } from './ActionBar';
import { HospitalChoice } from './HospitalChoice';
import { VictimBadge } from './VictimBadge';
import { AiPanel } from './AiPanel';
import { FinalReport } from './FinalReport';
import { allergyLabel, conditionLabel, ROLE_LABELS, statusLabel } from '../../lib/labels';
import { hospitalIdOf } from '../../lib/hospitals';
import { agoPhrase } from '../../lib/incidents';
import { useRoute } from '../../lib/useRoute';
import { useOpsStore } from '../../store/useOpsStore';
import type { Hospital, IncidentSummary, Report } from '../../types/contracts';

const PANEL = 'w-[380px] max-w-[28vw] shrink-0 bg-surface border-l border-border flex flex-col overflow-hidden';

const TRIAGE_LINE: Record<string, string> = {
  RED: 'Rouge · urgence absolue',
  YELLOW: 'Jaune · urgence différée',
  GREEN: 'Vert · urgence légère',
  UNKNOWN: 'Inconnu · pas encore évalué',
};

const hasProfile = (r: Report) => Boolean(r.profile && Object.keys(r.profile).length > 0);

/** The victim's medical card. The photo comes from the alert itself (added by the victim in the app's medical profile). */
const ProfileCard: React.FC<{ reports: Report[]; onBadge: (r: Report) => void }> = ({ reports, onBadge }) => {
  // The newest report that carries a profile; otherwise the newest report
  const withProfile = [...reports].reverse().find(hasProfile);
  const target = withProfile ?? reports[reports.length - 1];
  const p = withProfile?.profile ?? {};
  if (!target) return null;

  const who = [p.age != null ? `${p.age} ans` : null, p.sex === 'M' ? 'Homme' : p.sex === 'F' ? 'Femme' : null].filter(Boolean).join(' · ');
  const empty = !withProfile;

  return (
    <div className="rounded-xl border border-border p-5">
      <div className="flex items-center gap-4">
        <div className="w-[68px] h-[68px] rounded-full bg-panel border border-border overflow-hidden shrink-0 flex items-center justify-center">
          {p.photo_url ? <img src={p.photo_url} alt="Photo de la victime" className="w-full h-full object-cover" /> : <User className="w-7 h-7 text-text-faint" />}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[18px] leading-tight font-bold break-words">{p.name || 'Identité inconnue'}</p>
        </div>

        <button
          type="button"
          onClick={() => onBadge(target)}
          className="h-9 px-3.5 rounded-lg border border-ink text-[13px] font-bold inline-flex items-center gap-2 hover:bg-panel cursor-pointer transition-colors"
          title="Générer le badge de cette victime"
        >
          <IdCard className="w-4 h-4" />
          Badge
        </button>
      </div>

      {empty ? (
        <p className="mt-5 text-[13px] text-text-muted">Aucun profil médical joint à ce signalement.</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-6">
            <div>
              <p className="text-[13px] text-text-muted">Groupe sanguin</p>
              <p className="text-[48px] leading-[1.05] font-extrabold tracking-tight">{p.blood && p.blood !== '??' ? p.blood : '?'}</p>
              <p className="text-[15px] font-medium mt-1">{who || 'Âge / sexe non renseignés'}</p>
            </div>
            <div className="space-y-5">
              <div>
                <p className="text-[13px] text-text-muted mb-2">Antécédents</p>
                <div className="flex flex-wrap gap-2">
                  {(p.conditions ?? []).length > 0 ? (
                    p.conditions!.map((c) => (
                      <span key={c} className="h-7 px-3 inline-flex items-center rounded-full bg-panel text-[13px] font-semibold">
                        {conditionLabel(c, p)}
                      </span>
                    ))
                  ) : (
                    <span className="text-[13px] text-text-muted">Aucun renseigné</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[13px] text-text-muted mb-2">Allergies</p>
                <div className="flex flex-wrap gap-2">
                  {(p.allergies ?? []).length > 0 ? (
                    p.allergies!.map((a) => (
                      <span key={a} className="h-7 px-3 inline-flex items-center gap-1.5 rounded-full border border-ink text-[13px] font-bold">
                        <TriangleAlert className="w-3.5 h-3.5" />
                        {allergyLabel(a, p)}
                      </span>
                    ))
                  ) : (
                    <span className="text-[13px] text-text-muted">Aucune connue</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {p.contact && (
            <div className="mt-5 pt-4 border-t border-line flex items-baseline gap-3 text-[14px]">
              <span className="text-text-muted">Contact d’urgence</span>
              {p.contact_name && <span className="font-bold text-[16px]">{p.contact_name}</span>}
              <span className="ml-auto font-mono tracking-wide">{p.contact}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/** Distance and time by road from the accident to the destination hospital (OSRM). */
const RoadRouteLine: React.FC<{ incident: IncidentSummary; hospital: Hospital }> = ({ incident, hospital }) => {
  const route = useRoute([incident.lat, incident.lng], [hospital.lat, hospital.lng]);
  if (route.status === 'loading') return <p className="text-[13px] text-text-muted mt-3">Calcul du trajet vers l’hôpital…</p>;
  if (route.status !== 'ok') return null;
  return (
    <p className="text-[13px] text-text-muted mt-3" title="Trajet du patient, du lieu de l’accident à l’hôpital">
      Lieu de l’accident → hôpital :{' '}
      <span className="font-bold text-text tabular-nums">
        {route.route.distanceKm.toFixed(1)} km · ~{Math.max(1, Math.round(route.route.durationMin))} min
      </span>
    </p>
  );
};

type Tab = 'reports' | 'victim' | 'ai' | 'hospital';

export const IncidentDetail: React.FC = () => {
  const selectedId = useOpsStore((s) => s.selectedId);
  const incident = useOpsStore((s) => (s.selectedId ? s.incidents[s.selectedId] : undefined));
  const detail = useOpsStore((s) => (s.selectedId ? s.details[s.selectedId] : undefined));
  const hospitals = useOpsStore((s) => s.hospitals);
  const chosenId = useOpsStore((s) => (s.selectedId ? s.chosen[s.selectedId] : undefined));
  const [badgeFor, setBadgeFor] = useState<Report | null>(null);
  const [tab, setTab] = useState<Tab>('reports');
  const [reportOpen, setReportOpen] = useState(false);

  // A new alert always opens on its reports
  useEffect(() => {
    setTab('reports');
    setReportOpen(false);
  }, [selectedId]);

  if (!selectedId || !incident) {
    return (
      <section className={PANEL} data-testid="incident-detail-panel">
        <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
          <LogoFull className="w-36 h-auto mb-6" />
          <h3 className="text-lg font-extrabold mb-1">Sélectionnez une alerte</h3>
          <p className="text-[13px] text-text-muted max-w-[250px]">Dans la liste ou sur la carte.</p>
        </div>
      </section>
    );
  }

  const reports = detail?.reports ?? [];
  const reportTotal = reports.length || incident.report_count || 0;
  const closed = incident.status === 'RESOLVED' || incident.status === 'CANCELLED';
  // The operator's pick wins over the recommendation until it is dispatched
  const hospitalId = chosenId ?? hospitalIdOf(incident);
  const hospital = hospitals.find((h) => h.id === hospitalId);
  const channels = incident.channels ?? [];
  const roles = [...new Set(incident.roles ?? [])];
  const created = new Date(incident.created_at);
  const clock = Number.isNaN(created.getTime()) ? '' : created.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false });

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'reports', label: 'Rapports', count: reportTotal },
    { id: 'victim', label: 'Victime' },
    { id: 'ai', label: 'Analyse IA' },
    { id: 'hospital', label: 'Hôpital' },
  ];

  return (
    <section className={PANEL} data-testid="incident-detail-panel">
      {incident.is_mci && (
        <div role="alert" className="px-6 py-2 bg-triage-red text-on-red text-[13px] font-bold">
          Afflux de victimes — {incident.victim_counts.RED + incident.victim_counts.YELLOW + incident.victim_counts.GREEN} victimes
        </div>
      )}

      <header className="px-6 pt-5 pb-4 flex gap-4 items-start">
        <TriageShape triage={incident.worst_triage} size={58} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="font-mono text-[26px] leading-none font-semibold tracking-wide">{incident.short_id}</h1>
            <span
              className={`h-5 px-2 inline-flex items-center rounded-full text-[10px] font-extrabold tracking-wide uppercase ${
                incident.status === 'NEW' ? 'bg-triage-red/10 text-triage-red' : 'bg-ink text-white'
              }`}
            >
              {statusLabel(incident.status)}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] text-text-muted">
            {TRIAGE_LINE[incident.worst_triage] ?? TRIAGE_LINE.UNKNOWN} · {agoPhrase(incident.created_at)}
            {clock && ` (${clock})`}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {channels.map((ch) => (
              <span key={ch} className="h-6 px-2.5 inline-flex items-center gap-1.5 rounded-full border border-ink text-[12px] font-bold">
                {ch === 'SMS' ? <MessageSquare className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                {ch === 'SMS' ? 'SMS' : 'Internet'}
              </span>
            ))}
            {roles.map((r) => (
              <span key={r} className="h-6 px-2.5 inline-flex items-center gap-1.5 rounded-full bg-panel text-[12px] font-bold">
                <User className="w-3.5 h-3.5" />
                {ROLE_LABELS[r]?.label ?? r}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            disabled={!detail}
            className="mt-3 h-8 px-3 rounded-lg border border-border text-[12px] font-bold inline-flex items-center gap-1.5 hover:border-ink cursor-pointer transition-colors disabled:opacity-40"
            title="Rapport complet à imprimer ou enregistrer en PDF"
          >
            <FileText className="w-3.5 h-3.5" />
            Rapport final PDF
          </button>
        </div>
      </header>

      <nav className="px-6 flex gap-5 border-b border-border overflow-x-auto" role="tablist" aria-label="Détail de l’alerte">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`pb-3 -mb-px shrink-0 whitespace-nowrap text-[14px] font-bold border-b-2 cursor-pointer transition-colors ${
              tab === t.id ? 'border-ink text-text' : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {t.label}
            {t.count != null && <span className="ml-1.5 text-text-faint tabular-nums">{t.count}</span>}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto scroll-soft px-6 py-5" role="tabpanel">
        {tab === 'reports' &&
          (!detail ? (
            <p className="text-[13px] text-text-muted">Chargement…</p>
          ) : (
            <ul className="space-y-3">
              {reports.map((r) => (
                <ReportCard key={r.id} report={r} incident={incident} onBadge={() => setBadgeFor(r)} />
              ))}
            </ul>
          ))}

        {tab === 'victim' &&
          (!detail ? (
            <p className="text-[13px] text-text-muted">Chargement…</p>
          ) : reports.length === 0 ? (
            <p className="text-[13px] text-text-muted">Aucun signalement pour l’instant.</p>
          ) : (
            <ProfileCard reports={reports} onBadge={setBadgeFor} />
          ))}

        {tab === 'ai' && (!detail ? <p className="text-[13px] text-text-muted">Chargement…</p> : <AiPanel incident={incident} reports={reports} />)}

        {tab === 'hospital' && (
          <>
            <p className="text-[13px] text-text-muted mb-3">Hôpital de destination du patient. L’ambulance part sur le lieu de l’accident.</p>
            <HospitalChoice incident={incident} hospitals={hospitals} selectedId={hospitalId ?? null} locked={closed} />
            {hospital && <RoadRouteLine incident={incident} hospital={hospital} />}
          </>
        )}
      </div>

      <ActionBar key={incident.id} incident={incident} hospitals={hospitals} selectedId={hospitalId ?? null} />
      {reportOpen && <FinalReport incident={incident} reports={reports} hospital={hospital} onClose={() => setReportOpen(false)} />}
      {badgeFor && <VictimBadge incident={incident} report={badgeFor} hospital={hospital} onClose={() => setBadgeFor(null)} />}
    </section>
  );
};
