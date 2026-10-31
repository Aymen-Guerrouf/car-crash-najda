import React from 'react';
import { Activity, Bed, Building2, Phone } from 'lucide-react';
import { useOpsStore } from '../store/useOpsStore';

/** Hospital directory: the live list from the backend, with bed availability and capabilities. */
export const HospitalsPage: React.FC = () => {
  const hospitals = useOpsStore((s) => s.hospitals);
  const active = hospitals.filter((h) => h.active);
  const totalBeds = active.reduce((n, h) => n + h.beds_available, 0);

  return (
    <div className="flex-1 overflow-auto scroll-soft bg-panel p-8" data-testid="hospitals-page">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-5 px-1">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-text">Ressources et capacités hospitalières</h1>
            <p className="text-sm text-text-muted mt-1">Centres de traumatologie, lits disponibles et capacités d’accueil des urgences.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-4 h-10 inline-flex items-center gap-2 rounded-lg bg-surface border border-border text-sm font-bold">
              <Building2 className="w-4 h-4" /> {active.length} {active.length > 1 ? 'hôpitaux' : 'hôpital'}
            </span>
            <span className="px-4 h-10 inline-flex items-center gap-2 rounded-lg bg-ink text-white text-sm font-bold">
              <Bed className="w-4 h-4" /> {totalBeds} {totalBeds > 1 ? 'lits libres' : 'lit libre'}
            </span>
          </div>
        </div>

        {hospitals.length === 0 ? (
          <div className="card p-12 text-center">
            <Building2 className="w-12 h-12 text-surface-3 mx-auto mb-3" />
            <h3 className="text-base font-extrabold text-text mb-1">Aucun hôpital chargé</h3>
            <p className="text-xs text-text-muted max-w-md mx-auto">La liste apparaît dès que le serveur répond.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {hospitals.map((h) => {
              const full = h.beds_available <= 0;
              return (
                <article key={h.id} className={`card p-5 ${h.active ? '' : 'opacity-50'}`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h2 className="font-extrabold text-base leading-snug text-text">{h.name}</h2>
                    <span
                      className={`shrink-0 px-3 h-7 inline-flex items-center rounded-full text-xs font-bold tabular-nums ${
                        full ? 'bg-triage-red/10 text-triage-red' : 'bg-[var(--green-soft)] text-triage-green'
                      }`}
                    >
                      {full ? 'Complet' : `${h.beds_available} ${h.beds_available > 1 ? 'lits' : 'lit'}`}
                    </span>
                  </div>
                  {h.capabilities.length > 0 && (
                    <div className="flex items-start gap-2 text-xs text-text-muted mb-2">
                      <Activity className="w-3.5 h-3.5 text-info mt-0.5 shrink-0" />
                      <span className="font-semibold">{h.capabilities.map((c) => c.replace(/_/g, ' ')).join(' · ')}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Phone className="w-3.5 h-3.5" />
                    <span className="font-mono">{h.phone}</span>
                  </div>
                  {full && <p className="text-xs font-semibold text-triage-red mt-2">Capacité saturée</p>}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
