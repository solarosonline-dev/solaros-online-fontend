import { useEffect, useState } from "react";
import {
  listEntities,
  updateEntityState,
  type AdminEntity,
  type EntityState,
} from "../../api/adminEntities";
import { ApiError } from "../../api/client";
import "./EntitiesPage.css";

const STATE_FILTERS: { label: string; value: EntityState | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Pending approval", value: "PENDING_APPROVAL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

function nextAction(entity: AdminEntity): { label: string; target: EntityState; primary: boolean } | null {
  if (entity.state === "PENDING_APPROVAL") return { label: "Approve", target: "ACTIVE", primary: true };
  if (entity.state === "ACTIVE") return { label: "Deactivate", target: "INACTIVE", primary: false };
  if (entity.state === "INACTIVE") return { label: "Reactivate", target: "ACTIVE", primary: true };
  return null;
}

export default function EntitiesPage() {
  const [stateFilter, setStateFilter] = useState<EntityState | undefined>(undefined);
  const [entities, setEntities] = useState<AdminEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    listEntities({ state: stateFilter })
      .then((res) => {
        if (!cancelled) setEntities(res.items);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Failed to load entities");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stateFilter]);

  async function handleTransition(entity: AdminEntity, target: EntityState) {
    setPendingId(entity.entity_id);
    setRowErrors((prev) => ({ ...prev, [entity.entity_id]: "" }));
    try {
      const updated = await updateEntityState(entity.entity_id, target);
      setEntities((prev) =>
        prev.map((e) =>
          e.entity_id === entity.entity_id ? { ...e, state: updated.state, approved_at: updated.approved_at } : e,
        ),
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not update entity";
      setRowErrors((prev) => ({ ...prev, [entity.entity_id]: message }));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="entities-page">
      <h1>Entities</h1>

      <div className="entities-filters">
        {STATE_FILTERS.map((f) => (
          <button
            key={f.label}
            className={stateFilter === f.value ? "active" : ""}
            onClick={() => setStateFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="entities-table-wrap">
        {loading ? (
          <div className="entities-loading">Loading…</div>
        ) : loadError ? (
          <div className="entities-loading">{loadError}</div>
        ) : entities.length === 0 ? (
          <div className="entities-empty">No entities found.</div>
        ) : (
          <table className="entities-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>GST</th>
                <th>Type</th>
                <th>State</th>
                <th>Founder</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entities.map((entity) => {
                const action = nextAction(entity);
                const rowError = rowErrors[entity.entity_id];
                const founderVerified = entity.founder_state === "ACTIVE";
                return (
                  <tr key={entity.entity_id}>
                    <td>{entity.name}</td>
                    <td>{entity.gstno}</td>
                    <td>{entity.type}</td>
                    <td>
                      <span className={`entity-state-badge state-${entity.state}`}>{entity.state}</span>
                    </td>
                    <td>
                      <div>{entity.founder_email}</div>
                      <div className="entities-founder-phone">{entity.founder_phone}</div>
                      <span className={`entity-founder-badge${founderVerified ? " verified" : " pending"}`}>
                        {founderVerified ? "Verified" : "Pending verification"}
                      </span>
                    </td>
                    <td>{new Date(entity.created_at).toLocaleDateString()}</td>
                    <td>
                      {action && (
                        <button
                          className={`entities-action-btn${action.primary ? " primary" : ""}`}
                          disabled={pendingId === entity.entity_id}
                          onClick={() => handleTransition(entity, action.target)}
                        >
                          {pendingId === entity.entity_id ? "…" : action.label}
                        </button>
                      )}
                      {rowError && <div className="entities-row-error">{rowError}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
