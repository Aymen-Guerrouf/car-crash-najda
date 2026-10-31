import * as Location from 'expo-location';

export interface Position {
  lat: number;
  lng: number;
  accuracyM: number | null;
}

const FIX_TIMEOUT_MS = 3000;
const CACHE_MAX_AGE_MS = 2 * 60 * 1000;

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

const toPosition = (loc: Location.LocationObject): Position => {
  // iOS reports a negative accuracy when the fix is invalid, and the API rejects values below 0
  const acc = loc.coords.accuracy;
  return { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracyM: acc != null && acc >= 0 ? acc : null };
};

/** A position fast: a fix from the last 2 minutes if there is one, else a fresh one within 3 s, else the last known. */
export async function getPosition(): Promise<Position | null> {
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted' && !(await requestLocationPermission())) return null;

  const recent = await Location.getLastKnownPositionAsync({ maxAge: CACHE_MAX_AGE_MS }).catch(() => null);
  if (recent) return toPosition(recent);

  const fresh = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
  ]);
  const loc = fresh ?? (await Location.getLastKnownPositionAsync().catch(() => null));
  return loc ? toPosition(loc) : null;
}