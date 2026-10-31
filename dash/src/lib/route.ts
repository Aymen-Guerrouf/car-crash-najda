import { config } from '../config';

export type LatLng = [number, number];

export interface RoadRoute {
  /** Polyline following the roads, as [lat, lng] points. */
  coords: LatLng[];
  distanceKm: number;
  durationMin: number;
}

interface OsrmResponse {
  code?: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
}

const cache = new Map<string, Promise<RoadRoute>>();
const key = (a: LatLng, b: LatLng) => [...a, ...b].map((n) => n.toFixed(4)).join(',');

/** Parses an OSRM `route` response (GeoJSON geometry is [lng, lat], Leaflet wants [lat, lng]). */
export function parseOsrmRoute(data: OsrmResponse): RoadRoute {
  const route = data.routes?.[0];
  if (data.code !== 'Ok' || !route || route.geometry.coordinates.length < 2) {
    throw new Error(`No route (${data.code ?? 'unknown'})`);
  }
  return {
    coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng),
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
  };
}

/**
 * Driving route between two points from the OSRM routing API (the same service the backend uses for ETAs).
 * Results are cached per pair, and a failed lookup is forgotten so the next selection can retry.
 */
export function fetchRoute(from: LatLng, to: LatLng): Promise<RoadRoute> {
  const k = key(from, to);
  const hit = cache.get(k);
  if (hit) return hit;

  const url = `${config.osrmUrl}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
  const request = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
      return res.json() as Promise<OsrmResponse>;
    })
    .then(parseOsrmRoute);
  cache.set(k, request);
  request.catch(() => cache.delete(k));
  return request;
}
