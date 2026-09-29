import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listProjectWorkOrders, createProjectWorkOrder, type WorkOrderListItem, type WorkOrderType } from "../../api/workOrders";
import { updateProjectStatus, skipStageFor, currentPhaseWorkOrderType, type ProjectStatus } from "../../api/projects";
import { ApiError } from "../../api/client";

const TYPE_LABEL: Record<string, string> = {
  SITE_SURVEY: "Site survey",
  SITE_DESIGN: "Site design",
  PRE_INSTALL_DISCOM_APPROVAL: "Discom approval",
  MATERIAL_PROCUREMENT: "Material procurement",
  MATERIAL_DELIVERY: "Material delivery",
  INSTALLATION: "Installation",
  COMMISSIONING: "Commissioning",
};

export default function ProjectWorkOrders({
  entityId,
  projectId,
  projectStatus,
  onProjectStatusChange,
}: {
  entityId: number;
  projectId: number;
  projectStatus: ProjectStatus;
  onProjectStatusChange: (status: ProjectStatus) => void;
}) {
  const navigate = useNavigate();

  const [items, setItems] = useState<WorkOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newNotes, setNewNotes] = useState("");
  const [newVisitDate, setNewVisitDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [skipping, setSkipping] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    listProjectWorkOrders(entityId, projectId)
      .then((res) => setItems(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load work orders"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, projectId]);

  // Now returns an array of allowed Work Order types based on the project's current status
  const currentTypes = currentPhaseWorkOrderType(projectStatus);
  const openTypes = new Set(items.filter((i) => i.status !== "COMPLETED").map((i) => i.type));
  
  // Track selected type in dropdown when multiple are available
  const [selectedType, setSelectedType] = useState<WorkOrderType | "">("");

  // Default the selected type to the first available one if the dropdown hasn't been touched
  useEffect(() => {
    if (currentTypes.length === 1) {
      setSelectedType(currentTypes[0]);
    } else if (currentTypes.length > 1 && (!selectedType || !currentTypes.includes(selectedType))) {
      setSelectedType(currentTypes[0]);
    }
  }, [currentTypes, selectedType]);

  const alreadyOpen = selectedType !== "" && openTypes.has(selectedType as WorkOrderType);

  const skip = skipStageFor(projectStatus);
  const canSkip = skip != null && !items.some((i) => i.type === skip.workOrderType);

  async function handleCreate() {
    if (!selectedType) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createProjectWorkOrder(entityId, projectId, {
        type: selectedType as WorkOrderType,
        notes: newNotes.trim() || undefined,
        visit_date: newVisitDate || undefined,
      });
      setNewNotes("");
      setNewVisitDate("");
      load();
      if (res.project_status) onProjectStatusChange(res.project_status as ProjectStatus);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Could not create work order");
    } finally {
      setCreating(false);
    }
  }

  async function handleSkip() {
    if (!skip) return;
    setSkipping(true);
    setSkipError(null);
    try {
      const res = await updateProjectStatus(entityId, projectId, skip.to);
      onProjectStatusChange(res.status);
    } catch (err) {
      setSkipError(err instanceof ApiError ? err.message : "Could not skip stage");
    } finally {
      setSkipping(false);
    }
  }

  return (
    <>
      <p className="projects-section-label">Work orders</p>

      {currentTypes.length > 0 && (
        <div className="work-orders-new-panel">
          {currentTypes.length === 1 ? (
            <span className="work-order-current-type">{TYPE_LABEL[currentTypes[0]]}</span>
          ) : (
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as WorkOrderType)}
              className="admin-input"
              style={{ width: "auto", margin: 0 }}
            >
              {currentTypes.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          )}
          
          <input
            type="text"
            placeholder="Notes (optional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
          />
          <input
            type="date"
            title="Visit date (optional)"
            value={newVisitDate}
            onChange={(e) => setNewVisitDate(e.target.value)}
          />
          <button className="projects-btn primary" disabled={creating || alreadyOpen || !selectedType} onClick={handleCreate}>
            {creating ? "Creating…" : alreadyOpen ? "Already open" : "+ New work order"}
          </button>
          {skip && (
            <button className="projects-btn" disabled={!canSkip || skipping} onClick={handleSkip}>
              {skipping ? "Skipping…" : skip.label}
            </button>
          )}
          {createError && (
            <span className="work-order-type-hint" style={{ color: "var(--app-danger)" }}>
              {createError}
            </span>
          )}
          {skipError && (
            <span className="work-order-type-hint" style={{ color: "var(--app-danger)" }}>
              {skipError}
            </span>
          )}
        </div>
      )}

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
                <th>Customer / Address</th>
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
                  <td data-label="Customer/Address">
                    <div>{wo.lead.name}</div>
                    <div className="work-order-assignee-contact">
                      {[wo.lead.mobile, wo.lead.email].filter(Boolean).join(" · ")}
                    </div>
                    {wo.lead.address && <div style={{ fontSize: "12px", marginTop: "2px" }}>{wo.lead.address}</div>}
                    {wo.lead.latitude !== null && wo.lead.longitude !== null && (
                      <div style={{ marginTop: "2px" }}>
                        <a
                          href={`https://maps.google.com/?q=${wo.lead.latitude},${wo.lead.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: "12px", textDecoration: "none" }}
                        >
                          📍 Map
                        </a>
                      </div>
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
    </>
  );
}
