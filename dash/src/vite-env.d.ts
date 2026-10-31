/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_USE_MOCK: string;
  readonly VITE_TILE_URL: string;
  readonly VITE_MAP_CENTER: string;
  readonly VITE_MAP_ZOOM: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
