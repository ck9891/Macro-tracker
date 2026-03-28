import { registerSW } from "virtual:pwa-register";
import { api } from "./api.js";

export function setupPwaAndSyncListeners() {
  registerSW({ immediate: true });

  window.addEventListener("online", () => {
    void api
      .sync()
      .catch(() => {})
      .finally(() => window.dispatchEvent(new CustomEvent("macro-sync")));
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (ev: MessageEvent) => {
      if (ev.data?.type === "SYNC_OUTBOX") {
        void api
          .sync()
          .catch(() => {})
          .finally(() => window.dispatchEvent(new CustomEvent("macro-sync")));
      }
    });
  }
}
