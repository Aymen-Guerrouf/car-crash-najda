import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Eye, Hand, MessageSquare, Search, User, Wifi, X } from 'lucide-react';
import { TriageShape } from '../ui/TriageShape';
import { useOpsStore } from '../../store/useOpsStore';
import { countByTriage, EMPTY_FILTER, filterIncidents, isOpen, sortIncidents, timeAgo, type QueueFilter } from '../../lib/incidents';
import type { IncidentSummary, Role, Triage } from '../../types/contracts';

const FLASH_MS = 3000;

const TRIAGE_FILTERS: { value: Triage | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Toutes' },
  { value: 'RED', label: 'Rouge' },
  { value: 'YELLOW', label: 'Jaune' },
  { value: 'GREEN', label: 'Vert' },
  { value: 'UNKNOWN', label: 'Inconnu' },
];

const ROLE_ICON: Record<Role, React.ReactNode> = {
  VICTIM: <User className="w-[18px] h-[18px]" />,
  WITNESS: <Eye className="w-[18px] h-[18px]" />,
  BYSTANDER: <Hand className="w-[18px] h-[18px]" />,
  AUTO: <Bot className="w-[18px] h-[18px]" />,
};
const ROLE_NAME: Record<Role, string> = { VICTIM: 'Victime', WITNESS: 'Témoin', BYSTANDER: 'Passant', AUTO: 'Alerte automatique' };

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Row({ incident, selected, flashing, now, onSelect }: { incident: IncidentSummary; selected: boolean; flashing: boolean; now: number; onSelect: () => void }) {
  const role = incident.roles?.[incident.roles.length - 1];
  const sms = (incident.channels ?? []).includes('SMS');
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        data-incident={incident.id}
        className={`w-full text-left grid grid-cols-[26px_1fr_auto] gap-x-3 items-center px-4 py-3 cursor-pointer transition-colors border-b border-line ${
          selected ? 'bg-surface outline outline-[1.5px] -outline-offset-[1.5px] outline-triage-red' : 'hover:bg-surface/60'
        } ${flashing ? 'animate-row-flash' : ''}`}
      >
        <TriageShape triage={incident.worst_triage} size={26} />
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[15px] font-semibold tracking-wide">{incident.short_id}</span>
            <span className="text-xs text-text-muted tabular-nums whitespace-nowrap">il y a {timeAgo(incident.created_at, now)}</span>
            {incident.status === 'NEW' && (
              <span className="h-5 px-2 inline-flex items-center rounded-full bg-triage-red/10 text-triage-red text-[10px] font-extrabold tracking-wide">NOUVEAU</span>
            )}
            {incident.status === 'DISPATCHED' && (
              <span className="h-5 px-2 inline-flex items-center rounded-full bg-text/10 text-text text-[10px] font-extrabold tracking-wide">ENVOYÉE</span>
            )}
          </div>
          <p className="mt-0.5 text-[14px] font-medium truncate">{incident.location_note || `${incident.lat.toFixed(4)}, ${incident.lng.toFixed(4)}`}</p>
        </div>
        <div className="flex items-center gap-2.5 text-text-muted">
          <span title={sms ? 'Reçu par SMS' : 'Reçu par internet'} aria-label={sms ? 'SMS' : 'Internet'}>
            {sms ? <MessageSquare className="w-[18px] h-[18px] text-info" /> : <Wifi className="w-[18px] h-[18px]" />}
          </span>
          {role && (
            <span title={ROLE_NAME[role]} aria-label={ROLE_NAME[role]}>
              {ROLE_ICON[role]}
            </span>
          )}
          <span className="w-7 h-7 rounded-full bg-panel text-text text-xs font-bold inline-flex items-center justify-center tabular-nums" title="Signalements">
            {incident.report_count ?? 1}
          </span>
        </div>
      </button>
    </li>
  );
}

export const IncidentQueue: React.FC = () => {
  const incidents = useOpsStore((s) => s.incidents);
  const hospitals = useOpsStore((s) => s.hospitals);
  const selectedId = useOpsStore((s) => s.selectedId);
  const flashing = useOpsStore((s) => s.flashing);
  const select = useOpsStore((s) => s.select);
  const clearFlash = useOpsStore((s) => s.clearFlash);
  const now = useNow(15_000);

  const [filter, setFilter] = useState<QueueFilter>(EMPTY_FILTER);
  const open = useMemo(() => sortIncidents(Object.values(incidents).filter(isOpen)), [incidents]);
  const rows = useMemo(() => filterIncidents(open, filter, hospitals), [open, filter, hospitals]);
  const counts = useMemo(() => countByTriage(open), [open]);
  const filtering = filter.query.trim() !== '' || filter.triage !== 'ALL' || filter.status !== 'ALL';

  // A row flashes for 3 s after it arrives
  useEffect(() => {
    const ids = Object.keys(flashing);
    if (ids.length === 0) return;
    const timers = ids.map((id) => setTimeout(() => clearFlash(id), FLASH_MS));
    return () => timers.forEach(clearTimeout);
  }, [flashing, clearFlash]);

  // ↑ ↓ move through the list (not while typing in the search box)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (rows.length === 0) return;
      e.preventDefault();
      const i = rows.findIndex((r) => r.id === selectedId);
      const next = e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i === -1 ? 0 : i - 1);
      const target = rows[next];
      if (target) {
        select(target.id);
        document.querySelector(`[data-incident="${target.id}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, selectedId, select]);

  return (
    <aside className="w-[340px] shrink-0 bg-panel border-r border-border flex flex-col" data-testid="incident-queue-panel">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[22px] font-extrabold tracking-tight leading-none">Incidents ouverts</h2>
          <span className="text-[22px] font-extrabold tabular-nums leading-none">{filtering ? `${rows.length}/${open.length}` : open.length}</span>
        </div>
        

        <div className="mt-3 flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Rechercher un code d’alerte</span>
            <Search className="w-4 h-4 text-text-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={filter.query}
              onChange={(e) => setFilter({ ...filter, query: e.target.value })}
              placeholder="Code, lieu…"
              className="w-full h-10 rounded-lg bg-surface border border-border pl-9 pr-8 text-sm font-medium placeholder:text-text-faint outline-none focus:border-ink"
            />
            {filter.query && (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onClick={() => setFilter({ ...filter, query: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md hover:bg-panel flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </label>
          <select
            aria-label="Filtrer par état"
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value as QueueFilter['status'] })}
            className="h-10 rounded-lg bg-surface border border-border px-2.5 text-sm font-semibold outline-none focus:border-ink cursor-pointer"
          >
            <option value="ALL">Tous états</option>
            <option value="TODO">À traiter</option>
            <option value="DISPATCHED">Envoyées</option>
          </select>
        </div>

        <div className="mt-3 flex gap-0.5 -mx-1.5" role="group" aria-label="Filtrer par gravité">
          {TRIAGE_FILTERS.map((f) => {
            const active = filter.triage === f.value;
            const n = f.value === 'ALL' ? open.length : counts[f.value];
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter({ ...filter, triage: f.value })}
                className={`h-8 px-2 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                  active ? 'bg-ink text-white' : 'text-text-muted hover:bg-surface hover:text-text'
                }`}
              >
                {f.label}
                <span className={`tabular-nums ${active ? 'text-white/60' : 'text-text-faint'}`}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-line" />

      {rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <h3 className="text-base font-extrabold mb-1">{filtering ? 'Aucun résultat' : 'Aucune alerte en cours'}</h3>
          <p className="text-[13px] text-text-muted max-w-[250px]">
            {filtering ? 'Aucune alerte ne correspond à cette recherche.' : 'En attente d’alertes envoyées par l’application, les passants ou par SMS.'}
          </p>
          {filtering && (
            <button type="button" onClick={() => setFilter(EMPTY_FILTER)} className="mt-4 h-9 px-4 rounded-lg bg-ink text-white text-xs font-bold cursor-pointer">
              Réinitialiser
            </button>
          )}
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto scroll-soft">
          {rows.map((i) => (
            <Row key={i.id} incident={i} selected={i.id === selectedId} flashing={Boolean(flashing[i.id])} now={now} onSelect={() => select(i.id)} />
          ))}
        </ul>
      )}

    </aside>
  );
};
