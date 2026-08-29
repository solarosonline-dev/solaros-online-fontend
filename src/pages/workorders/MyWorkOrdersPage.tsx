import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { listMyWorkOrders, type AssignedWorkOrderListItem, type WorkOrderStatus } from "../../api/workOrders";
import { ApiError } from "../../api/client";
import "../projects/ProjectsPage.css";

const STATUS_TABS: { label: string; value: WorkOrderStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "New", value: "NEW" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
];

export default function MyWorkOrdersPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const navigate = useNavigate();

  const [status, setStatus] = useState<WorkOrderStatus | "">("");
  const [items, setItems] = useState<AssignedWorkOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    listMyWorkOrders(entityId, { status: status || undefined })
      .then((res) => setItems(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load work orders"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, status]);

  return (
    <div className="projects-page">
      <div className="project-detail-header">
        <h1 style={{ margin: 0 }}>My work orders</h1>
      </div>

      {/* Native dropdown ≤640px in place of the tab row -- same swap as
       * .project-funnel-select/.project-funnel-buttons in ProjectsPage.css.
       * "All" stays the default in both layouts. */}
      <select
        className="wo-status-select"
        aria-label="Filter work orders by status"
        value={status}
        onChange={(e) => setStatus(e.target.value as WorkOrderStatus | "")}
      >
        {STATUS_TABS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <div className="project-tabs wo-status-tabs" role="tablist">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={status === t.value}
            className={status === t.value ? "project-tab active" : "project-tab"}
            onClick={() => setStatus(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="projects-table-wrap">
        {loading ? (
          <div className="projects-loading">Loading…</div>
        ) : loadError ? (
          <div className="projects-loading">{loadError}</div>
        ) : items.length === 0 ? (
          <div className="projects-empty">No work orders assigned to you.</div>
        ) : (
          <table className="projects-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Customer</th>
                <th>Address</th>
                <th>Opened</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {items.map((wo) => (
                <tr key={wo.work_order_id} onClick={() => navigate(`/app/work-orders/${wo.work_order_id}`)}>
                  <td data-label="Type">{wo.type.replace("_", " ")}</td>
                  <td data-label="Status">
                    <span className={wo.status === "COMPLETED" ? "project-status-badge completed" : "project-status-badge"}>
                      {wo.status}
                    </span>
                  </td>
                  <td data-label="Customer">{wo.lead.name}</td>
                  <td data-label="Address">{wo.lead.address || "—"}</td>
                  <td data-label="Opened">{new Date(wo.opened_at).toLocaleDateString()}</td>
                  <td data-label="Completed">
                    {wo.closed_at ? new Date(wo.closed_at).toLocaleDateString() : "—"}
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
