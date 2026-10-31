import React, { useEffect, useMemo } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { config } from '../../config';
import { TriageShape } from '../ui/TriageShape';
import { getTriageConfig } from '../../lib/triage';
import { hospitalIdOf } from '../../lib/hospitals';
import { isOpen } from '../../lib/incidents';
import { useRoute, type RouteState } from '../../lib/useRoute';
import { useOpsStore } from '../../store/useOpsStore';
import type { Hospital, IncidentSummary, Triage } from '../../types/contracts';

/** Incident marker: the same shape + letter as the list, with a ring when selected. */
function incidentIcon(i: IncidentSummary, selected: boolean) {
  const size = selected ? 46 : 38;
  const svg = renderToStaticMarkup(<TriageShape triage={i.worst_triage} size={size} ring />);
  const mci = i.is_mci
    ? `<span style="position:absolute;top:-8px;right:-12px;background:var(--triage-red);color:#fff;font:700 9px var(--font-sans);padding:2px 5px;border-radius:999px;border:1.5px solid #fff">AFFLUX</span>`
    : '';
  const sent =
    i.status === 'DISPATCHED'
      ? `<span style="position:absolute;bottom:-4px;right:-6px;width:17px;height:17px;border-radius:50%;background:var(--ink);color:#fff;font:700 10px sans-serif;display:flex;align-items:center;justify-content:center;border:1.5px solid #fff">&#10003;</span>`
      : '';
  return L.divIcon({
    html: `<div style="position:relative;filter:drop-shadow(0 1px 2px rgba(0,0,0,.28))">${svg}${mci}${sent}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Hospital marker: black square with a cross, and the free beds in a small white badge. */
function hospitalIcon(h: Hospital, selected: boolean) {
  const size = selected ? 40 : 34;
  const dim = h.beds_available <= 0 ? 'opacity:.55;' : '';
  return L.divIcon({
    html: `<div style="position:relative;${dim}filter:drop-shadow(0 1px 2px rgba(0,0,0,.28))">
      <div style="width:${size}px;height:${size}px;border-radius:9px;background:var(--ink);border:2px solid #fff;display:flex;align-items:center;justify-content:center">
        <svg width="${size * 0.5}" height="${size * 0.5}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"><path d="M12 4v16M4 12h16"/></svg>
      </div>
      <span style="position:absolute;top:-9px;right:-9px;min-width:19px;height:19px;padding:0 4px;border-radius:999px;background:#fff;border:1px solid var(--border);color:var(--ink);font:700 11px var(--font-sans);display:flex;align-items:center;justify-content:center">${h.beds_available}</span>
    </div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function routePill(minutes: number) {
  return L.divIcon({ html: `<div class="route-pill">${minutes} min</div>`, className: '', iconSize: [0, 0] });
}

/**
 * Camera for the selected incident (queue → map sync): goes to the incident first, then frames the whole
 * road route once it is known (or the straight line if the routing service is unreachable).
 */
function Camera({ incident, hospital, route }: { incident: [number, number] | null; hospital: [number, number] | null; route: RouteState }) {
  const map = useMap();
  const incidentKey = incident ? `${incident[0]},${incident[1]}` : '';
  useEffect(() => {
    if (!incident) return;
    const frame = { padding: [70, 70] as [number, number], duration: 0.6 };
    if (route.status === 'ok') map.flyToBounds(L.latLngBounds(route.route.coords), { ...frame, maxZoom: 16 });
    else if (route.status === 'failed' && hospital) map.flyToBounds(L.latLngBounds([incident, hospital]), { ...frame, maxZoom: 15 });
    else map.flyTo(incident, Math.max(map.getZoom(), 14), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only move when the selection or the route result changes
  }, [incidentKey, route.status, map]);
  return null;
}

const LEGEND: [Triage, string][] = [
  ['RED', 'Rouge'],
  ['YELLOW', 'Jaune'],
  ['GREEN', 'Vert'],
  ['UNKNOWN', 'Inconnu'],
];

const Legend: React.FC = () => (
  <div
    className="absolute left-4 bottom-4 z-[500] bg-surface/95 border border-border rounded-lg px-3 py-2 flex items-center gap-3.5 text-xs font-semibold pointer-events-none"
    aria-label="Légende"
  >
    {LEGEND.map(([t, label]) => (
      <span key={t} className="flex items-center gap-1.5">
        <TriageShape triage={t} size={14} />
        {label}
      </span>
    ))}
    <span className="flex items-center gap-1.5">
      <span className="w-3.5 h-3.5 rounded-[4px] bg-ink inline-flex items-center justify-center text-white text-[10px] font-bold leading-none">+</span>
      Hôpital · lits libres
    </span>
  </div>
);
export const OpsMap: React.FC = () => {
  const incidents = useOpsStore((s) => s.incidents);
  const hospitals = useOpsStore((s) => s.hospitals);
  const selectedId = useOpsStore((s) => s.selectedId);
  const select = useOpsStore((s) => s.select);

  const open = useMemo(() => Object.values(incidents).filter(isOpen), [incidents]);
  const selected = selectedId ? incidents[selectedId] : undefined;

  // The route follows the operator's pick (before dispatch), otherwise the recommended hospital
  const chosenId = useOpsStore((s) => (s.selectedId ? s.chosen[s.selectedId] : undefined));
  const selectedHospital: Hospital | undefined = useMemo(() => {
    const id = chosenId ?? (selected ? hospitalIdOf(selected) : null);
    return id == null ? undefined : hospitals.find((x) => x.id === id);
  }, [selected, hospitals, chosenId]);

  const incidentPoint = selected ? ([selected.lat, selected.lng] as [number, number]) : null;
  const hospitalPoint = selectedHospital ? ([selectedHospital.lat, selectedHospital.lng] as [number, number]) : null;
  const route = useRoute(incidentPoint, hospitalPoint);

  // Label in the middle of the route: road time when known, else the backend's estimate
  const minutes = route.status === 'ok' ? Math.max(1, Math.round(route.route.durationMin)) : selected?.eta_min ?? null;
  const mid: [number, number] | null =
    route.status === 'ok'
      ? (route.route.coords[Math.floor(route.route.coords.length / 2)] as [number, number])
      : incidentPoint && hospitalPoint
        ? [(incidentPoint[0] + hospitalPoint[0]) / 2, (incidentPoint[1] + hospitalPoint[1]) / 2]
        : null;

  return (
    <>
      <MapContainer center={config.mapCenter} zoom={config.mapZoom} className="w-full h-full z-0" data-testid="ops-map">
        <TileLayer url={config.tileUrl} attribution="&copy; OpenStreetMap contributors" />
        <Camera incident={incidentPoint} hospital={hospitalPoint} route={route} />

        {incidentPoint && hospitalPoint && route.status === 'ok' ? (
          <>
            <Polyline positions={route.route.coords} pathOptions={{ color: '#FFFFFF', weight: 6, opacity: 0.9 }} />
            <Polyline positions={route.route.coords} pathOptions={{ color: '#111111', weight: 2.5 }} />
          </>
        ) : (
          incidentPoint &&
          hospitalPoint && (
            // while the route loads, or if the routing service is unreachable: a straight line
            <Polyline positions={[incidentPoint, hospitalPoint]} pathOptions={{ color: '#111111', weight: 2, dashArray: '5 7', opacity: route.status === 'loading' ? 0.35 : 0.9 }} />
          )
        )}
        {mid && minutes != null && <Marker position={mid} icon={routePill(minutes)} interactive={false} zIndexOffset={900} />}

        {hospitals
          .filter((h) => h.active)
          .map((h) => {
            const isTarget = h.id === selectedHospital?.id;
            return (
              <Marker key={`h-${h.id}`} position={[h.lat, h.lng]} icon={hospitalIcon(h, isTarget)} zIndexOffset={isTarget ? 800 : 0}>
                <Tooltip permanent={isTarget} direction="bottom" offset={[0, 12]}>
                  {h.short_name || h.name} · {h.beds_available} {h.beds_available > 1 ? 'lits' : 'lit'}
                </Tooltip>
              </Marker>
            );
          })}

        {open.map((i) => (
          <Marker
            key={i.id}
            position={[i.lat, i.lng]}
            icon={incidentIcon(i, i.id === selectedId)}
            zIndexOffset={i.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => select(i.id) }}
          >
            <Tooltip>
              {i.short_id} · {getTriageConfig(i.worst_triage).label}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
      <Legend />
    </>
  );
};
