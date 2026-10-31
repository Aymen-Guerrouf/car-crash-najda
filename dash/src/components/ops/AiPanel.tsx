import React from 'react';
import { Camera, Loader2, Sparkles } from 'lucide-react';
import { VisionResult } from './VisionResult';
import { mediaUrl } from '../../lib/media';
import { ROLE_LABELS } from '../../lib/labels';
import { useOpsStore } from '../../store/useOpsStore';
import type { IncidentSummary, Report } from '../../types/contracts';

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const FAIL_HINT: Record<string, string> = {
  not_configured: 'Le service d’analyse n’est pas activé sur le serveur.',
  timeout: 'L’analyse a pris trop de temps.',
};

/** One scene photo with what the AI made of it (or why there is nothing yet). */
const PhotoCard: React.FC<{ report: Report }> = ({ report }) => {
  const failed = useOpsStore((s) => s.visionFailed[report.id]);
  const src = mediaUrl(report.photo);
  const role = ROLE_LABELS[report.role]?.label ?? report.role;

  return (
    <li className="rounded-xl border border-border overflow-hidden">
      {src && <img src={src} alt="Photo de la scène" className="w-full max-h-[230px] object-cover bg-panel" />}
      <div className="p-5">
        <p className="text-[12px] font-bold text-text-muted mb-3">
          Photo envoyée par : {role} {clock(report.received_at) && `· ${clock(report.received_at)}`}
        </p>
        {report.ai_vision ? (
          <VisionResult vision={report.ai_vision} />
        ) : failed ? (
          <div>
            <p className="text-[14px] font-bold">Analyse indisponible</p>
            <p className="text-[13px] text-text-muted mt-1">{FAIL_HINT[failed] ?? 'L’analyse automatique a échoué.'} La photo reste consultable.</p>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-[13px] text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours…
          </p>
        )}
      </div>
    </li>
  );
};

/** "Analyse IA": the note for the hospital, then every scene photo with its analysis. */
export const AiPanel: React.FC<{ incident: IncidentSummary; reports: Report[] }> = ({ incident, reports }) => {
  const withPhoto = reports.filter((r) => r.photo);

  return (
    <div className="space-y-5">
      {incident.er_brief && (
        <section className="rounded-xl bg-panel p-5">
          <p className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
            <Sparkles className="w-3.5 h-3.5" />
            Note pour l’hôpital
            <span className="ml-auto normal-case tracking-normal font-bold">{incident.er_brief_source === 'AI' ? 'Rédigée par l’IA' : 'Modèle automatique'}</span>
          </p>
          <p className="text-[14px] font-medium leading-snug mt-2.5">{incident.er_brief}</p>
        </section>
      )}

      {withPhoto.length > 0 ? (
        <ul className="space-y-3">
          {withPhoto.map((r) => (
            <PhotoCard key={r.id} report={r} />
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Camera className="w-6 h-6 mx-auto text-text-faint" />
          <p className="text-[14px] font-bold mt-3">Aucune photo de la scène</p>
          <p className="text-[13px] text-text-muted mt-1">La victime ou un témoin peut en envoyer une depuis l’application, pendant le suivi.</p>
        </div>
      )}
    </div>
  );
};
