import { useEffect, useState } from "react";
import { api } from "../api.js";

export function OfflineStatus() {
  const [online, setOnline] = useState(() => api.isOnline());
  const [pending, setPending] = useState(0);
  const [last, setLast] = useState<string | null>(null);

  async function refresh() {
    setOnline(api.isOnline());
    setPending(await api.pendingCount());
    setLast(await api.lastSyncedAt());
  }

  useEffect(() => {
    void refresh();
    const onSync = () => void refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("macro-sync", onSync);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("macro-sync", onSync);
    };
  }, []);

  const label = online ? "Online" : "Offline";
  const detail =
    pending > 0
      ? `${pending} change${pending === 1 ? "" : "s"} waiting to sync`
      : online
        ? "All changes saved"
        : "Edits are saved on this device";

  return (
    <div className="offline-status" role="status">
      <span className={`offline-dot ${online ? "online" : "offline"}`} aria-hidden />
      <span className="offline-label">{label}</span>
      <span className="offline-detail">{detail}</span>
      {last ? (
        <span className="offline-synced muted" title="Last full sync with server">
          Synced {new Date(last).toLocaleString()}
        </span>
      ) : null}
    </div>
  );
}
