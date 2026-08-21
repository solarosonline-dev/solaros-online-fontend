import { useEffect, useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { listAmcPlans, deactivateAmcPlan, type AmcPlan } from "../../api/amcPlans";
import { ApiError } from "../../api/client";
import AmcPlanForm from "./AmcPlanForm";
import "./AmcPlansPage.css";

type Filter = "all" | "active" | "inactive";

export default function AmcPlansPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;

  const [plans, setPlans] = useState<AmcPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AmcPlan | null>(null);

  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  function load() {
    setLoading(true);
    setLoadError(null);
    listAmcPlans(entityId, { is_active: filter === "all" ? undefined : filter === "active" })
      .then((res) => setPlans(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load plans"))
      .finally(() => setLoading(false));
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

  function handleSaved() {
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

      {formOpen && (
        <AmcPlanForm
          entityId={entityId}
          plan={editingPlan}
          onSaved={handleSaved}
          onCancel={() => {
            setFormOpen(false);
            setEditingPlan(null);
          }}
        />
      )}

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
        {loading ? (
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
              {plans.map((plan) => (
                <tr key={plan.amc_id}>
                  <td>{plan.name}</td>
                  <td>{plan.rate_per_kw ?? "—"}</td>
                  <td>
                    {plan.inclusion.length > 0 ? (
                      <ul className="amc-inclusion-list">
                        {plan.inclusion.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="amc-inclusion-list">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`amc-status-badge ${plan.is_active ? "active" : "inactive"}`}>
                      {plan.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="amc-row-actions">
                      <button className="amc-btn" onClick={() => openEditForm(plan)}>
                        Edit
                      </button>
                      {plan.is_active && (
                        <button
                          className="amc-btn"
                          disabled={deactivatingId === plan.amc_id}
                          onClick={() => handleDeactivate(plan)}
                        >
                          {deactivatingId === plan.amc_id ? "…" : "Deactivate"}
                        </button>
                      )}
                    </div>
                    {rowErrors[plan.amc_id] && <div className="amc-status error">{rowErrors[plan.amc_id]}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
