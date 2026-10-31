import { useEffect, useState } from 'react';
import { config } from '../config';
import { fetchRoute, type LatLng, type RoadRoute } from './route';

export type RouteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; route: RoadRoute }
  | { status: 'failed' };

/** Road route from an incident to its hospital. `failed` lets the map fall back to a straight line. */
export function useRoute(from: LatLng | null, to: LatLng | null): RouteState {
  const [state, setState] = useState<RouteState>({ status: 'idle' });
  const [fromLat, fromLng] = from ?? [NaN, NaN];
  const [toLat, toLng] = to ?? [NaN, NaN];

  useEffect(() => {
    if (config.useMock || Number.isNaN(fromLat) || Number.isNaN(toLat)) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    fetchRoute([fromLat, fromLng], [toLat, toLng])
      .then((route) => !cancelled && setState({ status: 'ok', route }))
      .catch(() => !cancelled && setState({ status: 'failed' }));
    return () => {
      cancelled = true;
    };
  }, [fromLat, fromLng, toLat, toLng]);

  return state;
}
