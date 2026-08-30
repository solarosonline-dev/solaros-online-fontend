import { useEffect } from "react";
import { writeDraft } from "../lib/drafts";

const DEBOUNCE_MS = 800;

/** Write-side of draft autosave — debounces writes while the user types, and
 * forces one last synchronous write right before the tab actually closes.
 * Restore is handled separately per-page (see readDraft in lib/drafts.ts),
 * since each form's data shape/setters differ.
 *
 * Pass `key: null` (not ready yet, e.g. before the initial fetch resolves)
 * or `enabled: false` (e.g. a locked quote/agreement) to disable writes
 * entirely without unmounting the hook. */
export function useDraftAutosave<T>(key: string | null, data: T, enabled: boolean): void {
  const serialized = JSON.stringify(data);

  useEffect(() => {
    if (!key || !enabled) return;
    const timer = setTimeout(() => writeDraft(key, data), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, serialized]);

  useEffect(() => {
    if (!key || !enabled) return;
    const flush = () => writeDraft(key, data);
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, serialized]);
}
