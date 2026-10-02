import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listLeadWorkOrders, createLeadWorkOrder, type WorkOrderListItem, type WorkOrderType } from "../../api/workOrders";
import { ApiError } from "../../api/client";
import "../projects/ProjectsPage.css";

const TYPE_LABEL: Record<string, string> = {
  SITE_SURVEY: "Site survey",
  SITE_DESIGN: "Site design",
};

export default function LeadWorkOrders({ entityId, leadId }: { entityId: number; leadId: number }) {
  const navigate = useNavigate();

  const [items, setItems] = useState<WorkOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [notes, setNotes] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<WorkOrderType>("SITE_SURVEY");

  function load() {
    setLoading(true);
    setLoadError(null);
    listLeadWorkOrders(entityId, leadId)
      .then((res) => setItems(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load work orders"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, leadId]);

  const openTypes = new Set(items.filter((i) => i.status !== "COMPLETED").map((i) => i.type));
  const hasCompletedSurvey = items.some((i) => i.type === "SITE_SURVEY" && i.status === "COMPLETED");

  const allowedTypes: WorkOrderType[] = ["SITE_SURVEY"];
  if (hasCompletedSurvey) {
    allowedTypes.push("SITE_DESIGN");
  }

  useEffect(() => {
    if (hasCompletedSurvey && !openTypes.has("SITE_DESIGN") && selectedType !== "SITE_DESIGN") {
      setSelectedType("SITE_DESIGN");
    } else if (!hasCompletedSurvey && selectedType !== "SITE_SURVEY") {
      setSelectedType("SITE_SURVEY");
    }
  }, [hasCompletedSurvey, openTypes, selectedType]);

  const alreadyOpen = openTypes.has(selectedType);

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      await createLeadWorkOrder(entityId, leadId, {
        type: selectedType,
        notes: notes.trim() || undefined,
        visit_date: visitDate || undefined,
      });
      setNotes("");
      setVisitDate("");
      load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : `Could not create ${TYPE_LABEL[selectedType].toLowerCase()}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="lead-detail-panel">
      <p className="projects-section-label">Pre-project work orders</p>

      <div className="work-orders-new-panel">
        {allowedTypes.length === 1 ? (
          <span className="work-order-current-type">{TYPE_LABEL[allowedTypes[0]]}</span>
        ) : (
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as WorkOrderType)}
            className="admin-input"
            style={{ width: "auto", margin: 0 }}
          >
            {allowedTypes.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        )}
        <input
          type="text"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <input
          type="date"
          title="Visit date (optional)"
          value={visitDate}
          onChange={(e) => setVisitDate(e.target.value)}
        />
        <button className="leads-btn primary" disabled={creating || alreadyOpen} onClick={handleCreate}>
          {creating ? "Creating…" : alreadyOpen ? "Already open" : `+ Create ${TYPE_LABEL[selectedType].toLowerCase()}`}
        </button>
      </div>
      {createError && <p className="leads-status error">{createError}</p>}

      <div className="leads-table-wrap">
        {loading ? (
          <div className="projects-loading">Loading…</div>
        ) : loadError ? (
          <div className="projects-loading">{loadError}</div>
        ) : items.length === 0 ? (
          <div className="projects-empty">No work orders created for this lead yet.</div>
        ) : (
          <table className="leads-table leads-table-clickable">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Opened</th>
                <th>Completed</th>
                <th>Visit date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((wo) => (
                <tr key={wo.work_order_id} onClick={() => navigate(`/app/work-orders/${wo.work_order_id}`)}>
                  <td data-label="Type">{TYPE_LABEL[wo.type] || wo.type.replace("_", " ")}</td>
                  <td data-label="Status">
                    <span className={wo.status === "COMPLETED" ? "project-status-badge completed" : "project-status-badge"}>
                      {wo.status}
                    </span>
                  </td>
                  <td data-label="Assignee">
                    {wo.assignee ? (
                      <>
                        <div>{wo.assignee.name}</div>
                        {(wo.assignee.email || wo.assignee.phone) && (
                          <div className="work-order-assignee-contact">
                            {[wo.assignee.email, wo.assignee.phone].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </>
                    ) : (
                      "Unassigned"
                    )}
                  </td>
                  <td data-label="Opened">{new Date(wo.opened_at).toLocaleDateString()}</td>
                  <td data-label="Completed">
                    {wo.closed_at ? new Date(wo.closed_at).toLocaleDateString() : "—"}
                  </td>
                  <td data-label="Visit date">
                    {wo.visit_date ? new Date(wo.visit_date).toLocaleDateString() : "—"}
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
