import { useEffect, useState } from "react";
import {
  listEntities,
  updateEntityState,
  updateEntityFeatures,
  updateEntityTrial,
  type AdminEntity,
  type EntityState,
} from "../../api/adminEntities";
import { ApiError } from "../../api/client";
import type { Feature } from "../../api/auth";
import "./EntitiesPage.css";

// Product modules a system admin can toggle per entity. New entities get CRM
// only; DESIGN (plant design) is granted here.
const FEATURES: { key: Feature; label: string }[] = [
  { key: "CRM", label: "CRM" },
  { key: "DESIGN", label: "Design" },
];

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

  async function handleUpdateTrial(entityId: number, opts: { extend_days?: number; convert_to_paid?: boolean }) {
    setPendingId(entityId);
    setRowErrors((prev) => ({ ...prev, [entityId]: "" }));
    try {
      const updated = await updateEntityTrial(entityId, opts);
      setEntities((prev) =>
        prev.map((e) => (e.entity_id === entityId ? { ...e, trial_ends_at: updated.trial_ends_at } : e)),
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not update trial";
      setRowErrors((prev) => ({ ...prev, [entityId]: message }));
    } finally {
      setPendingId(null);
    }
  }

  async function handleToggleFeature(entity: AdminEntity, feature: Feature, enabled: boolean) {
    const next = FEATURES.map((f) => f.key).filter((k) =>
      k === feature ? enabled : entity.features.includes(k),
    );
    setPendingId(entity.entity_id);
    setRowErrors((prev) => ({ ...prev, [entity.entity_id]: "" }));
    try {
      const updated = await updateEntityFeatures(entity.entity_id, next);
      setEntities((prev) =>
        prev.map((e) => (e.entity_id === entity.entity_id ? { ...e, features: updated.features } : e)),
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not update modules";
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
                <th>Tax ID</th>
                <th>Type</th>
                <th>State</th>
                <th>Founder</th>
                <th>Created</th>
                <th>Trial Status</th>
                <th>Modules</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entities.map((entity) => {
                const action = nextAction(entity);
                const rowError = rowErrors[entity.entity_id];
                const founderVerified = entity.founder_state === "ACTIVE";
                const isPaid = entity.trial_ends_at === null;
                const trialLabel = isPaid
                  ? "Paid Customer"
                  : `Ends: ${new Date(entity.trial_ends_at!).toLocaleDateString()}`;

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
                      <div style={{ marginBottom: "8px", fontSize: "0.85em", fontWeight: isPaid ? 600 : 400 }}>
                        {trialLabel}
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {!isPaid && (
                          <button
                            className="entities-action-btn"
                            disabled={pendingId === entity.entity_id}
                            onClick={() => handleUpdateTrial(entity.entity_id, { convert_to_paid: true })}
                            title="Convert to Paid Customer"
                          >
                            Set Paid
                          </button>
                        )}
                        <button
                          className="entities-action-btn"
                          disabled={pendingId === entity.entity_id}
                          onClick={() => handleUpdateTrial(entity.entity_id, { extend_days: 7 })}
                          title="Add 7 Days to Trial"
                        >
                          +7 Days
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="entities-features">
                        {FEATURES.map((f) => {
                          const checked = entity.features.includes(f.key);
                          // Can't switch off the last enabled module -- the
                          // backend rejects an empty set (deactivate the
                          // entity instead).
                          const isLast = checked && entity.features.length === 1;
                          return (
                            <label key={f.key} title={isLast ? "At least one module must stay enabled" : undefined}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={pendingId === entity.entity_id || isLast}
                                onChange={(e) => handleToggleFeature(entity, f.key, e.target.checked)}
                              />
                              {f.label}
                            </label>
                          );
                        })}
                      </div>
                    </td>
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
