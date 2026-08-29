import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listLeadWorkOrders, createLeadWorkOrder, type WorkOrderListItem } from "../../api/workOrders";
import { ApiError } from "../../api/client";
import "../projects/ProjectsPage.css";

export default function LeadWorkOrders({ entityId, leadId }: { entityId: number; leadId: number }) {
  const navigate = useNavigate();

  const [items, setItems] = useState<WorkOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    listLeadWorkOrders(entityId, leadId)
      .then((res) => setItems(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load site surveys"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, leadId]);

  // Same "one open per type" rule the backend enforces (ensure_work_order_
  // type_not_already_open, scoped by lead_id) -- mirrored here just to keep
  // the button disabled rather than surfacing a 409 after the fact.
  const alreadyOpen = items.some((i) => i.type === "SITE_SURVEY" && i.status !== "COMPLETED");

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      await createLeadWorkOrder(entityId, leadId, { type: "SITE_SURVEY", notes: notes.trim() || undefined });
      setNotes("");
      load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Could not create site survey");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="lead-detail-panel">
      <p className="projects-section-label">Site survey</p>

      <div className="work-orders-new-panel">
        <input
          type="text"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button className="leads-btn primary" disabled={creating || alreadyOpen} onClick={handleCreate}>
          {creating ? "Creating…" : alreadyOpen ? "Already open" : "+ Create site survey"}
        </button>
      </div>
      {createError && <p className="leads-status error">{createError}</p>}

      <div className="leads-table-wrap">
        {loading ? (
          <div className="projects-loading">Loading…</div>
        ) : loadError ? (
          <div className="projects-loading">{loadError}</div>
        ) : items.length === 0 ? (
          <div className="projects-empty">No site surveys created for this lead yet.</div>
        ) : (
          <table className="leads-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Assignee</th>
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
                  <td data-label="Assignee">{wo.assignee ? wo.assignee.name : "Unassigned"}</td>
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
