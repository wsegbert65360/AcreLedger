/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_UPGRADE_URL?: string;
  readonly VITE_ERROR_REPORTING_DSN?: string;
  readonly VITE_EQUIPMENT_UI_ENABLED?: string;
  readonly VITE_AU_PILOT_ENABLED?: string;
  readonly VITE_AU_PILOT_ALLOWLIST?: string;
}
