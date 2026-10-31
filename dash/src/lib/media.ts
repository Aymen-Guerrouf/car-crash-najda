import { config } from '../config';

/** Photos are stored by the backend as `/media/...`: make them loadable from the dashboard's own origin. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith('/') ? `${config.apiUrl.replace(/\/$/, '')}${path}` : path;
}
