import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { listMyWorkOrders, type AssignedWorkOrderListItem, type WorkOrderStatus } from "../../api/workOrders";
import { ApiError } from "../../api/client";
import "./MobileWorkOrdersPage.css";

export default function MobileWorkOrdersPage() {
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
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "Failed to load work orders")
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, status]);

  const tabs: { label: string; value: WorkOrderStatus | "" }[] = [
    { label: "All Tasks", value: "" },
    { label: "New", value: "NEW" },
    { label: "In Progress", value: "IN_PROGRESS" },
    { label: "Completed", value: "COMPLETED" },
  ];

  return (
    <div className="mobile-wo-page">
      <div className="mobile-wo-header">
        <h1>My Work Orders</h1>
        <p>Your on-site surveys and deployment schedules.</p>
      </div>

      {/* Persistent Filters scroll */}
      <div className="mobile-wo-filters">
        {tabs.map((t) => (
          <button
            key={t.label}
            type="button"
            className={`mobile-filter-chip ${status === t.value ? "selected" : ""}`}
            onClick={() => setStatus(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List Container */}
      <div className="mobile-wo-list">
        {loading ? (
          <div className="mobile-wo-state-msg">
            <div className="mobile-wo-spinner" />
            <p>Syncing schedules...</p>
          </div>
        ) : loadError ? (
          <div className="mobile-wo-state-msg error">
            <p>{loadError}</p>
            <button onClick={load} className="mobile-wo-retry-btn">
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="mobile-wo-state-msg empty">
            <span>📋</span>
            <p>No work orders found in this category.</p>
          </div>
        ) : (
          items.map((wo) => {
            const isCompleted = wo.status === "COMPLETED";
            return (
              <div
                key={wo.work_order_id}
                className="mobile-wo-card"
                onClick={() => navigate(`/app/work-orders/${wo.work_order_id}`)}
              >
                <div className="mobile-wo-card-header">
                  <span className="mobile-wo-type-badge">
                    {wo.type.replace("_", " ")}
                  </span>
                  <span className={`mobile-wo-status-badge ${isCompleted ? "completed" : ""}`}>
                    {wo.status}
                  </span>
                </div>

                <div className="mobile-wo-card-body">
                  <h3>{wo.lead.name}</h3>
                  <p className="mobile-wo-address">📍 {wo.lead.address || "No address added"}</p>
                </div>

                <div className="mobile-wo-card-footer">
                  <span className="mobile-wo-date">
                    📅 Opened: {new Date(wo.opened_at).toLocaleDateString()}
                  </span>
                  {wo.visit_date && (
                    <span className="mobile-wo-visit">
                      ⏰ Visit: {new Date(wo.visit_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
