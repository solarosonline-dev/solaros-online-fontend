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
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AmcPlan | null>(null);

  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  const isMobile = document.body.classList.contains("mobile-view");

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

  if (isMobile) {
    // High-Fidelity Mobile View
    const isFormModalOpen = formOpen;

    return (
      <div className="mobile-amc-plans-page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, fontFamily: "Bricolage Grotesque, sans-serif" }}>
            AMC SLA Plans
          </h3>
          {!isFormModalOpen && (
            <button type="button" className="mobile-btn-add-primary" onClick={openAddForm} style={{ margin: 0 }}>
              ➕ Add Plan
            </button>
          )}
        </div>

        {/* Filter chips scroll */}
        {!isFormModalOpen && (
          <div className="mobile-leads-filter-scroll" style={{ marginBottom: "12px" }}>
            {(["all", "active", "inactive"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`mobile-filter-chip ${filter === f ? "selected" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All Plans" : f === "active" ? "Active" : "Inactive"}
              </button>
            ))}
          </div>
        )}

        {/* Cards stack list */}
        <div className="mobile-users-list">
          {loading && !hasLoadedOnce ? (
            <div className="mobile-users-state">
              <div className="mobile-users-spinner" />
              <p>Syncing maintenance catalog...</p>
            </div>
          ) : loadError ? (
            <div className="mobile-users-state error">
              <p>{loadError}</p>
              <button onClick={load} className="mobile-users-retry">Retry</button>
            </div>
          ) : plans.length === 0 ? (
            <div className="mobile-users-state empty">
              <p>No AMC plans added yet.</p>
            </div>
          ) : (
            plans.map((plan) => (
              <div key={plan.amc_id} className={`mobile-user-card ${!plan.is_active ? "inactive-row" : ""}`} style={{ padding: "14px" }}>
                <div className="mobile-user-card-main" style={{ paddingRight: 0 }}>
                  <div className="mobile-user-info" style={{ width: "100%" }}>
                    <h3 style={{ fontSize: "15px", marginBottom: "6px" }}>{plan.name}</h3>
                    <p style={{ fontWeight: 700, color: "var(--app-accent)" }}>
                      Rate: ₹{plan.rate_per_kw ?? "—"} / kW / year
                    </p>
                    
                    {/* Compact bullet list for inclusions */}
                    <div style={{ marginTop: "10px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.02em", color: "var(--app-text-muted)" }}>
                        SLA Inclusions:
                      </span>
                      {plan.inclusion.length > 0 ? (
                        <ul style={{ margin: "4px 0 0 0", paddingLeft: "16px", fontSize: "12px", color: "var(--app-text)", lineHeight: "1.4" }}>
                          {plan.inclusion.map((item, i) => (
                            <li key={i} style={{ marginBottom: "2px" }}>{formatAmcInclusion(item)}</li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ margin: "2px 0 0 0", fontSize: "12px", fontStyle: "italic", color: "var(--app-text-muted)" }}>No items added.</p>
                      )}
                    </div>
                  </div>

                  <span className={`project-status-badge ${plan.is_active ? "completed" : "rejected"}`}>
                    {plan.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                {rowErrors[plan.amc_id] && (
                  <div className="mobile-user-row-error" style={{ marginTop: "8px" }}>⚠️ {rowErrors[plan.amc_id]}</div>
                )}

                <div className="mobile-user-card-footer" style={{ marginTop: "12px", borderTop: "1px solid var(--app-border)", paddingTop: "10px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="drawer-action-btn"
                    onClick={() => openEditForm(plan)}
                    style={{ padding: "8px 12px", width: "auto", fontSize: "12px", minHeight: "unset !important" }}
                  >
                    Edit Plan
                  </button>
                  <button
                    type="button"
                    className="drawer-action-btn"
                    onClick={() => (plan.is_active ? handleDeactivate(plan) : handleActivate(plan))}
                    style={{
                      padding: "8px 12px",
                      width: "auto",
                      fontSize: "12px",
                      minHeight: "unset !important",
                      color: plan.is_active ? "var(--app-danger)" : "var(--app-accent)"
                    }}
                  >
                    {plan.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Overlay slide-up sheet for Adding or Editing AMC Plan */}
        {isFormModalOpen && (
          <div className="mobile-user-modal-overlay" onClick={closeForm}>
            <div className="mobile-user-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="mobile-user-modal-handle" onClick={closeForm} />

              <div className="mobile-user-modal-header">
                <h3>{editingPlan ? "Edit AMC Plan Specs" : "Add New Annual Maintenance Plan"}</h3>
                <p>Add annual schedules, rate shares, and custom field-survey inclusions.</p>
              </div>

              <div className="mobile-amc-form-wrapper" style={{ maxHeight: "60vh", overflowY: "auto" }}>
                <AmcPlanForm entityId={entityId} plan={editingPlan} onCancel={closeForm} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop View
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
