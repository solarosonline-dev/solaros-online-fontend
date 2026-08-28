import { useRef } from "react";

/**
 * Wall-clock stopwatch for best-effort "time to fill out / generate this"
 * metrics — e.g. `Lead.entry_duration_ms`, `Quote.generation_duration_ms`,
 * `Agreement.generation_duration_ms` on the backend. Starts counting the
 * instant the owning component mounts; call the returned function at
 * submit time to get the elapsed milliseconds.
 *
 * Relying on mount time only works if the caller genuinely gets a fresh
 * mount per "attempt" — either a component that's conditionally rendered
 * (`{open && <Form />}`, fully unmounted when closed) or a page mounted
 * once per route navigation both qualify, since a ref's initializer only
 * ever runs on that first mount. It would NOT correctly reset for a
 * component that's kept mounted and merely hidden (CSS `display: none`)
 * across separate attempts — reuse with that in mind.
 */
export function useElapsedMs(): () => number {
  const startedAtRef = useRef(Date.now());
  return () => Date.now() - startedAtRef.current;
}
