/** Local-only draft autosave for the Lead/Quote/Agreement forms — never sent
 * to the server, purely a client-side safety net against an accidental tab
 * close or navigation away mid-edit (see useDraftAutosave.ts for the write
 * side, DraftRestoredBanner.tsx for the restore UI). */

export const DRAFT_VERSION = 1;

/** Drafts older than this are treated as gone — dropped silently, no restore
 * offered, no conflict resolution. Single source of truth so the read-time
 * check and the periodic sweep (sweepExpiredDrafts) never drift apart. */
export const DRAFT_TTL_MS = 60 * 60 * 1000;

const KEY_PREFIX = "draft:";

type DraftEnvelope<T> = {
  version: number;
  timestamp: number;
  data: T;
};

export const draftKeys = {
  leadNew: () => `${KEY_PREFIX}lead:new`,
  leadEdit: (leadId: string | number) => `${KEY_PREFIX}lead:${leadId}`,
  quoteNew: (leadId: string | number) => `${KEY_PREFIX}quote:new:${leadId}`,
  quoteEdit: (quoteId: string | number) => `${KEY_PREFIX}quote:${quoteId}`,
  agreementNew: (leadId: string | number) => `${KEY_PREFIX}agreement:new:${leadId}`,
  agreementEdit: (agreementId: string | number) => `${KEY_PREFIX}agreement:${agreementId}`,
};

/** Returns the draft's `data` + `timestamp` if present, current-version, and
 * within TTL — otherwise `null`, silently clearing the stale/invalid entry
 * as a side effect so it doesn't linger. The timestamp is what
 * DraftRestoredBanner shows ("Draft restored from N minutes ago"). */
export function readDraft<T>(key: string): { data: T; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    if (parsed.version !== DRAFT_VERSION || Date.now() - parsed.timestamp > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return { data: parsed.data, timestamp: parsed.timestamp };
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, data: T): void {
  try {
    const envelope: DraftEnvelope<T> = { version: DRAFT_VERSION, timestamp: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Quota exceeded or storage unavailable (private browsing) -- autosave
    // is a nice-to-have, never worth surfacing an error for.
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Drops every stored draft whose version or TTL no longer checks out. Run
 * once per app session (see AppLayout.tsx) so abandoned drafts don't
 * accumulate in localStorage indefinitely. */
export function sweepExpiredDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      readDraft(key); // self-clears if expired/invalid, no-op otherwise
    }
  } catch {
    // ignore
  }
}
