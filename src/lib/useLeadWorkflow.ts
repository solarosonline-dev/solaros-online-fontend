import { useEffect, useState } from "react";
import { DEFAULT_LEAD_WORKFLOW, getLeadWorkflow } from "../api/leads";

/** The entity's configured lead-workflow stages (falls back to the default
 * list until/unless the fetch succeeds). `reload` re-fetches after an edit. */
export function useLeadWorkflow(entityId: number | null | undefined) {
  const [stages, setStages] = useState<string[]>(DEFAULT_LEAD_WORKFLOW);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!entityId) return;
    let cancelled = false;
    getLeadWorkflow(entityId)
      .then((res) => !cancelled && setStages(res.stages))
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  return { stages, loaded, setStages };
}
