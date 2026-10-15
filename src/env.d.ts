/// <reference types="vite/client" />

/** Injected by Vite from package.json; the single source of truth for the app version. */
declare const __APP_VERSION__: string;

interface Navigator {
  /** iOS Safari: true when launched from the Home Screen. */
  readonly standalone?: boolean;
}
