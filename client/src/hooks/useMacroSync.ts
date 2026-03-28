import { useEffect } from "react";

/** Re-run when the offline sync engine finishes a pull or push. */
export function useMacroSync(onSync: () => void) {
  useEffect(() => {
    const h = () => onSync();
    window.addEventListener("macro-sync", h);
    return () => window.removeEventListener("macro-sync", h);
  }, [onSync]);
}
