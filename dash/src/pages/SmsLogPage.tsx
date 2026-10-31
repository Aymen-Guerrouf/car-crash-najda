import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, MessageSquare } from 'lucide-react';
import { useOpsStore } from '../store/useOpsStore';
import { agoPhrase } from '../lib/incidents';
import { answerLabel, flagLabel, questionLabel } from '../lib/labels';
import type { SmsLog } from '../types/contracts';

const ERROR_LABELS: Record<string, string> = {
  bad_version: 'Pas un message GH1',
  bad_field_count: 'Nombre de champs incorrect',
  bad_short_id: 'Code d’incident invalide',
  bad_position: 'Position invalide',
  bad_role: 'Rôle inconnu',
  bad_triage: 'Triage inconnu',
  bad_counts: 'Nombre de victimes invalide',
  bad_answers: 'Réponses invalides',
  bad_profile: 'Profil médical invalide',
  unparseable_gateway_payload: 'Message de la passerelle illisible',
  gateway_not_configured: 'Passerelle SMS non configurée',
};

function s(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
}

/** Decoded view of `parsed`. Tolerant: the shape is only partially specified (OPEN_QUESTIONS A7). */
const Decoded: React.FC<{ parsed: Record<string, unknown> | null }> = ({ parsed }) => {
  if (!parsed) return <span className="text-text-muted">—</span>;
  const answers = Array.isArray(parsed.answers) ? (parsed.answers as { q?: unknown; v?: unknown }[]) : [];
  const flags = Array.isArray(parsed.flags) ? (parsed.flags as unknown[]).map(s) : [];
  const counts = parsed.victim_counts && typeof parsed.victim_counts === 'object' ? (parsed.victim_counts as Record<string, unknown>) : null;
  const profile = parsed.profile && typeof parsed.profile === 'object' ? (parsed.profile as Record<string, unknown>) : null;
  const rows: [string, string][] = [
    ['Code', s(parsed.short_id)],
    ['Rôle', s(parsed.role)],
    ['Triage', s(parsed.triage)],
    ['Position', parsed.lat !== undefined ? `${s(parsed.lat)}, ${s(parsed.lng)}` : ''],
    ['Victimes', counts ? `R${s(counts.RED)} Y${s(counts.YELLOW)} G${s(counts.GREEN)}` : ''],
    ['Réponses', answers.map((a) => `${questionLabel(s(a.q))}: ${answerLabel(s(a.v))}`).join(' · ')],
    ['Flags', flags.map(flagLabel).join(', ')],
    ['Profil', profile ? [s(profile.blood) || 'sang ??', ...(Array.isArray(profile.conditions) ? profile.conditions.map(s) : []), ...(Array.isArray(profile.allergies) ? profile.allergies.map((a) => `allergie ${s(a)}`) : [])].join(' · ') : ''],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {rows
        .filter(([, v]) => v !== '')
        .map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-text-muted">{k}</dt>
            <dd className="text-text font-medium break-words">{v}</dd>
          </React.Fragment>
        ))}
    </dl>
  );
};

const Row: React.FC<{ log: SmsLog; onOpen: (id: string) => void }> = ({ log, onOpen }) => {
  const inbound = log.direction === 'IN';
  const failed = Boolean(log.error);
  return (
    <div className={`grid grid-cols-[104px_1fr_1fr] gap-4 px-6 py-4 border-t border-border ${failed ? 'bg-triage-red/5' : ''}`} data-testid="sms-log-row">
      <div className="text-xs">
        <span className={`inline-flex items-center gap-1 px-2.5 h-6 rounded-full font-bold ${inbound ? 'bg-info/10 text-info' : 'bg-[var(--green-soft)] text-triage-green'}`}>
          {inbound ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
          {inbound ? 'REÇU' : 'ENVOYÉ'}
        </span>
        <p className="text-text-muted mt-1.5 tabular-nums">{agoPhrase(log.at)}</p>
      </div>

      <div className="min-w-0">
        <p className="text-xs text-text-muted mb-1.5 font-mono">{log.phone || 'expéditeur inconnu'}</p>
        <p className="font-mono text-xs text-text bg-bg rounded-[var(--radius-sm)] px-3 py-2 break-all">{log.raw || '—'}</p>
      </div>

      <div className="min-w-0">
        {failed ? (
          <p className="flex items-start gap-1.5 text-xs text-triage-red font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {ERROR_LABELS[log.error] ?? log.error}
              <span className="block font-mono font-normal text-[11px] opacity-80">{log.error}</span>
            </span>
          </p>
        ) : inbound ? (
          <Decoded parsed={log.parsed} />
        ) : (
          <span className="text-xs text-text-muted">Confirmation envoyée au déclarant</span>
        )}
        {log.incident_id && (
          <button
            type="button"
            onClick={() => onOpen(log.incident_id!)}
            className="mt-2 px-3.5 h-8 rounded-lg bg-ink text-white text-xs font-bold cursor-pointer"
          >
            Ouvrir l’incident {log.short_id ?? ''} →
          </button>
        )}
      </div>
    </div>
  );
};

export const SmsLogPage: React.FC = () => {
  const logs = useOpsStore((st) => st.smsLogs);
  const select = useOpsStore((st) => st.select);
  const navigate = useNavigate();

  const open = (incidentId: string) => {
    select(incidentId);
    navigate('/');
  };

  return (
    <div className="flex-1 overflow-auto scroll-soft bg-panel p-8" data-testid="sms-log-page">
      <div className="max-w-6xl mx-auto w-full">
        <div className="mb-5 px-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-text">Journal des SMS hors ligne</h1>
          <p className="text-sm text-text-muted mt-1">Historique des SMS d’urgence codés reçus et des confirmations renvoyées aux déclarants.</p>
        </div>

        <div className="card overflow-hidden">
          <div className="px-6 py-4 flex items-center justify-between">
            <h2 className="text-base font-extrabold text-text">Transmissions récentes (50 max)</h2>
            <span className="text-xs font-bold px-3 h-7 inline-flex items-center rounded-full bg-bg text-text-muted">{logs.length} affichés · en direct</span>
          </div>
          <div className="grid grid-cols-[104px_1fr_1fr] gap-4 px-6 py-2.5 border-t border-border text-[11px] font-extrabold uppercase tracking-wider text-text-muted bg-bg/60">
            <span>Sens</span>
            <span>SMS brut</span>
            <span>Décodé</span>
          </div>

          {logs.length === 0 ? (
            <div className="p-12 text-center border-t border-border">
              <MessageSquare className="w-12 h-12 text-surface-3 mx-auto mb-3" />
              <h3 className="text-base font-extrabold text-text mb-1">Aucun SMS pour l’instant</h3>
              <p className="text-xs text-text-muted max-w-md mx-auto">
                Quand un téléphone sans internet envoie une alerte codée, le message brut et son contenu décodé apparaissent ici.
              </p>
            </div>
          ) : (
            logs.map((log) => <Row key={String(log.id)} log={log} onOpen={open} />)
          )}
        </div>
      </div>
    </div>
  );
};