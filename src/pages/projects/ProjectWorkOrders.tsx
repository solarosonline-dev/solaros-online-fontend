import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listProjectWorkOrders, createProjectWorkOrder, type WorkOrderListItem } from "../../api/workOrders";
import { updateProjectStatus, skipStageFor, currentPhaseWorkOrderType, type ProjectStatus } from "../../api/projects";
import { ApiError } from "../../api/client";

const TYPE_LABEL: Record<string, string> = {
  SITE_SURVEY: "Site survey",
  INSTALLATION: "Installation",
  DOCUMENTATION: "Documentation",
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

  // Only the type matching the project's current phase is offered here --
  // e.g. while the project is NEW, only a Site survey work order can be
  // created; once it's INSTALLATION_COMPLETED, only Documentation. Mirrors
  // currentPhaseWorkOrderType on the backend's PROJECT_ADVANCE_ON_WORK_ORDER_
  // CREATION/_COMPLETION maps -- null once the project has moved past every
  // work-order-driven phase (DOCUMENTATION_COMPLETED, COMPLETED, REJECTED).
  const currentType = currentPhaseWorkOrderType(projectStatus);
  const openTypes = new Set(items.filter((i) => i.status !== "COMPLETED").map((i) => i.type));
  const alreadyOpen = currentType != null && openTypes.has(currentType);

  // Skip lets an admin bypass the current phase entirely (no work order of
  // that type ever created) and jump the project straight to the next
  // phase -- only offered while no work order of the skipped type exists
  // yet (open or completed); once one does, the phase must be resolved by
  // completing/deleting it instead. See SKIP_STAGE_TRANSITIONS in
  // api/projects.ts and the backend's mirror in projects.py.
  const skip = skipStageFor(projectStatus);
  const canSkip = skip != null && !items.some((i) => i.type === skip.workOrderType);

  async function handleCreate() {
    if (!currentType) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createProjectWorkOrder(entityId, projectId, {
        type: currentType,
        notes: newNotes.trim() || undefined,
      });
      setNewNotes("");
      load();
      // Creating a work order can itself advance the project's status (e.g.
      // NEW -> SITE_SURVEY_IN_PROGRESS) -- without this the header badge,
      // stepper, and the type/skip options above stay stale until the page
      // is reloaded.
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

      {currentType && (
        <div className="work-orders-new-panel">
          <span className="work-order-current-type">{TYPE_LABEL[currentType]}</span>
          <input
            type="text"
            placeholder="Notes (optional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
          />
          <button className="projects-btn primary" disabled={creating || alreadyOpen} onClick={handleCreate}>
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
                <th>Customer</th>
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
                  <td data-label="Customer">
                    <div>{wo.lead.name}</div>
                    <div className="work-order-assignee-contact">
                      {[wo.lead.mobile, wo.lead.email].filter(Boolean).join(" · ")}
                    </div>
                  </td>
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
    </>
  );
}
