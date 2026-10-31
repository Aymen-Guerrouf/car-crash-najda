import { z } from 'zod';

const rawEnv = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/dashboard/',
  useMock: import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.VITE_USE_MOCK === '1',
  tileUrl: import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  osrmUrl: (import.meta.env.VITE_OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, ''),
  mapCenter: (() => {
    const raw = import.meta.env.VITE_MAP_CENTER;
    if (typeof raw === 'string' && raw.includes(',')) {
      const parts = raw.split(',').map((p) => parseFloat(p.trim()));
      if (parts.length === 2 && !isNaN(parts[0]!) && !isNaN(parts[1]!)) {
        return [parts[0]!, parts[1]!] as [number, number];
      }
    }
    return [36.75, 3.06] as [number, number];
  })(),
  mapZoom: (() => {
    const raw = import.meta.env.VITE_MAP_ZOOM;
    const parsed = parseInt(String(raw), 10);
    return !isNaN(parsed) ? parsed : 12;
  })(),
};

const configSchema = z.object({
  apiUrl: z.string().min(1),
  wsUrl: z.string().min(1),
  useMock: z.boolean(),
  tileUrl: z.string().min(1),
  osrmUrl: z.string().min(1),
  mapCenter: z.tuple([z.number(), z.number()]),
  mapZoom: z.number().int().min(1).max(20),
});

export type AppConfig = z.infer<typeof configSchema>;

export const config: AppConfig = configSchema.parse(rawEnv);
