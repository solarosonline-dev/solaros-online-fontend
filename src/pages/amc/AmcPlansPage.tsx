import { useEffect, useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { listAmcPlans, activateAmcPlan, deactivateAmcPlan, formatAmcInclusion, type AmcPlan } from "../../api/amcPlans";
import { ApiError } from "../../api/client";
import AmcPlanForm from "./AmcPlanForm";
import "./AmcPlansPage.css";

type Filter = "all" | "active" | "inactive";

export default function AmcPlansPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;

  const [plans, setPlans] = useState<AmcPlan[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguishes the very first fetch from a background refresh (e.g.
  // closing the inline edit form) -- only the former should replace the
  // whole table with the "Loading…" placeholder. Swapping a tall table for
  // that one-line placeholder and back collapses and re-expands the page,
  // which is what made closing the edit form look like it jumped to the
  // top: the scroll position never actually moved, but the content under
  // it did. Keeping the existing rows on screen during a refresh avoids
  // that shift entirely.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AmcPlan | null>(null);

  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  function load() {
    setLoading(true);
    setLoadError(null);
    listAmcPlans(entityId, { is_active: filter === "all" ? undefined : filter === "active" })
      .then((res) => setPlans(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load plans"))
      .finally(() => {
        setLoading(false);
        setHasLoadedOnce(true);
      });
  }

  useEffect(load, [entityId, filter]);

  function openAddForm() {
    setEditingPlan(null);
    setFormOpen(true);
  }

  function openEditForm(plan: AmcPlan) {
    setEditingPlan(plan);
    setFormOpen(true);
  }

  // The form now stays open after a successful save (its own Save button
  // flips to a disabled "Saved" -- see AmcPlanForm.tsx) instead of closing
  // straight back to this list, so this only needs to fire when the admin
  // is actually done -- covers both "never saved, just cancelling" and
  // "saved, now closing" since either way the underlying list may be stale.
  function closeForm() {
    setFormOpen(false);
    setEditingPlan(null);
    load();
  }

  async function handleDeactivate(plan: AmcPlan) {
    setDeactivatingId(plan.amc_id);
    setRowErrors((prev) => ({ ...prev, [plan.amc_id]: "" }));
    try {
      await deactivateAmcPlan(entityId, plan.amc_id);
      load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not deactivate plan";
      setRowErrors((prev) => ({ ...prev, [plan.amc_id]: message }));
    } finally {
      setDeactivatingId(null);
    }
  }

  async function handleActivate(plan: AmcPlan) {
    setActivatingId(plan.amc_id);
    setRowErrors((prev) => ({ ...prev, [plan.amc_id]: "" }));
    try {
      await activateAmcPlan(entityId, plan.amc_id);
      load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not activate plan";
      setRowErrors((prev) => ({ ...prev, [plan.amc_id]: message }));
    } finally {
      setActivatingId(null);
    }
  }

  return (
    <div className="amc-page">
      <h1>
        AMC Plans
        {!formOpen && (
          <button className="amc-btn primary" onClick={openAddForm}>
            + Add plan
          </button>
        )}
      </h1>

      {/* Adding has no existing row to anchor to, so it still opens up here at
          the top. Editing opens inline in place of the row that was tapped
          instead (see the table below) -- on mobile, where each row is a
          full-width stacked card, popping the form in up here meant it
          could open far below the fold with no obvious sign that anything
          had happened. */}
      {formOpen && editingPlan == null && <AmcPlanForm entityId={entityId} plan={null} onCancel={closeForm} />}

      {!formOpen && (
        <div className="amc-filters">
          {(["all", "active", "inactive"] as Filter[]).map((f) => (
            <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "active" ? "Active" : "Inactive"}
            </button>
          ))}
        </div>
      )}

      <div className="amc-table-wrap">
        {loading && !hasLoadedOnce ? (
          <div className="amc-loading">Loading…</div>
        ) : loadError ? (
          <div className="amc-loading">{loadError}</div>
        ) : plans.length === 0 ? (
          <div className="amc-empty">No AMC plans yet.</div>
        ) : (
          <table className="amc-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Rate (₹/kW/yr)</th>
                <th>Inclusions</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) =>
                formOpen && editingPlan?.amc_id === plan.amc_id ? (
                  <tr key={plan.amc_id} className="amc-table-inline-form-row">
                    <td colSpan={5}>
                      <AmcPlanForm entityId={entityId} plan={editingPlan} onCancel={closeForm} />
                    </td>
                  </tr>
                ) : (
                  <tr key={plan.amc_id}>
                    <td data-label="Name">{plan.name}</td>
                    <td data-label="Rate (₹/kW/yr)">{plan.rate_per_kw ?? "—"}</td>
                    <td data-label="Inclusions">
                      {plan.inclusion.length > 0 ? (
                        <ul className="amc-inclusion-list">
                          {plan.inclusion.map((item, i) => (
                            <li key={i}>{formatAmcInclusion(item)}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="amc-inclusion-list">—</span>
                      )}
                    </td>
                    <td data-label="Status">
                      <span className={`amc-status-badge ${plan.is_active ? "active" : "inactive"}`}>
                        {plan.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td data-label="Actions">
                      <div className="amc-row-actions">
                        <button className="amc-btn" disabled={formOpen} onClick={() => openEditForm(plan)}>
                          Edit
                        </button>
                        {plan.is_active ? (
                          <button
                            className="amc-btn"
                            disabled={formOpen || deactivatingId === plan.amc_id}
                            onClick={() => handleDeactivate(plan)}
                          >
                            {deactivatingId === plan.amc_id ? "…" : "Deactivate"}
                          </button>
                        ) : (
                          <button
                            className="amc-btn primary"
                            disabled={formOpen || activatingId === plan.amc_id}
                            onClick={() => handleActivate(plan)}
                          >
                            {activatingId === plan.amc_id ? "…" : "Activate"}
                          </button>
                        )}
                      </div>
                      {rowErrors[plan.amc_id] && <div className="amc-status error">{rowErrors[plan.amc_id]}</div>}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
