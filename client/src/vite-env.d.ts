/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Background Sync (Chromium); optional on registration. */
interface SyncManager {
  register(tag: string): Promise<void>;
}

interface ServiceWorkerRegistration {
  readonly sync?: SyncManager;
}

interface SyncEvent extends Event {
  readonly tag: string;
  waitUntil(p: Promise<unknown>): void;
}
