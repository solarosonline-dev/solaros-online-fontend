import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listProjectWorkOrders,
  createProjectWorkOrder,
  type WorkOrderListItem,
  type WorkOrderType,
} from "../../api/workOrders";
import { ApiError } from "../../api/client";

const TYPE_OPTIONS: { label: string; value: WorkOrderType }[] = [
  { label: "Site survey", value: "SITE_SURVEY" },
  { label: "Installation", value: "INSTALLATION" },
];

export default function ProjectWorkOrders({ entityId, projectId }: { entityId: number; projectId: number }) {
  const navigate = useNavigate();

  const [items, setItems] = useState<WorkOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newType, setNewType] = useState<WorkOrderType>("SITE_SURVEY");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    listProjectWorkOrders(entityId, projectId)
      .then((res) => setItems(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load work orders"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, projectId]);

  const openTypes = new Set(items.filter((i) => i.status !== "COMPLETED").map((i) => i.type));

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      await createProjectWorkOrder(entityId, projectId, { type: newType, notes: newNotes.trim() || undefined });
      setNewNotes("");
      load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Could not create work order");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <p className="projects-section-label">Work orders</p>

      <div className="work-orders-new-panel">
        <select value={newType} onChange={(e) => setNewType(e.target.value as WorkOrderType)}>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} disabled={openTypes.has(o.value)}>
              {o.label}
              {openTypes.has(o.value) ? " (already open)" : ""}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Notes (optional)"
          value={newNotes}
          onChange={(e) => setNewNotes(e.target.value)}
        />
        <button
          className="projects-btn primary"
          disabled={creating || openTypes.has(newType)}
          onClick={handleCreate}
        >
          {creating ? "Creating…" : "+ New work order"}
        </button>
        {createError && <span className="work-order-type-hint" style={{ color: "var(--app-danger)" }}>{createError}</span>}
      </div>

      <div className="projects-table-wrap">
        {loading ? (
          <div className="projects-loading">Loading…</div>
        ) : loadError ? (
          <div className="projects-loading">{loadError}</div>
        ) : items.length === 0 ? (
          <div className="projects-empty">No work orders yet.</div>
        ) : (
          <table className="projects-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Opened</th>
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
                  <td data-label="Assignee">{wo.assignee ? wo.assignee.name : "Unassigned"}</td>
                  <td data-label="Opened">{new Date(wo.opened_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
