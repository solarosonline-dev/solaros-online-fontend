import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import {
  getWorkOrder,
  updateWorkOrderStatus,
  assignWorkOrder,
  deleteWorkOrder,
  nextWorkOrderStatus,
  type WorkOrderDetail,
} from "../../api/workOrders";
import { listEntityUsers, type EntityUser } from "../../api/entityUsers";
import { ApiError } from "../../api/client";
import "./ProjectsPage.css";

const NEXT_ACTION_LABEL: Record<string, string> = {
  NEW: "Start work",
  IN_PROGRESS: "Mark completed",
};

export default function WorkOrderDetailPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const { workOrderId } = useParams();
  const navigate = useNavigate();

  const [wo, setWo] = useState<WorkOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [users, setUsers] = useState<EntityUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");

  const [transitioning, setTransitioning] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  function load() {
    if (!workOrderId) return;
    setLoading(true);
    setLoadError(null);
    getWorkOrder(entityId, Number(workOrderId))
      .then(setWo)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load work order"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, workOrderId]);

  useEffect(() => {
    listEntityUsers(entityId)
      .then((res) => setUsers(res.items))
      .catch(() => {});
  }, [entityId]);

  async function handleTransition(target: string) {
    if (!workOrderId) return;
    setTransitioning(true);
    setStatus(null);
    try {
      const res = await updateWorkOrderStatus(entityId, Number(workOrderId), target as "IN_PROGRESS" | "COMPLETED");
      setWo((prev) => (prev ? { ...prev, status: res.status, closed_at: res.closed_at } : prev));
      // project_status reflects the project's status after this call either way — it only advances
      // on COMPLETED, and only if the project was still at the exact status this work order type maps
      // from; otherwise it's unchanged. Report it as current state, not as a claimed transition.
      const projectNote = res.status === "COMPLETED" && res.project_status ? ` Project is now ${res.project_status}.` : "";
      setStatus({ kind: "success", message: `Status updated to ${res.status}.${projectNote}` });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Could not update status" });
    } finally {
      setTransitioning(false);
    }
  }

  async function handleAssign() {
    if (!workOrderId || !selectedUserId) return;
    setAssigning(true);
    setStatus(null);
    try {
      const res = await assignWorkOrder(entityId, Number(workOrderId), Number(selectedUserId));
      const assignedUser = users.find((u) => u.user_id === res.assignee_id);
      setWo((prev) =>
        prev
          ? { ...prev, assignee: { assignee_type: "USER", assignee_id: res.assignee_id, name: assignedUser?.full_name ?? "" } }
          : prev,
      );
      setStatus({ kind: "success", message: "Assigned." });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Could not assign" });
    } finally {
      setAssigning(false);
    }
  }

  async function handleDelete() {
    if (!workOrderId || !wo) return;
    setDeleting(true);
    setStatus(null);
    try {
      await deleteWorkOrder(entityId, Number(workOrderId));
      navigate(wo.project_id ? `/app/projects/${wo.project_id}` : "/app/projects");
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Could not delete" });
      setDeleting(false);
    }
  }

  if (loading) return <div className="projects-loading">Loading…</div>;
  if (loadError || !wo) {
    return (
      <div className="projects-page">
        <Link to="/app/projects" className="project-detail-back">
          ← Back to projects
        </Link>
        <p className="projects-status error">{loadError ?? "Work order not found."}</p>
      </div>
    );
  }

  const next = nextWorkOrderStatus(wo.status);
  const backLink = wo.project_id ? `/app/projects/${wo.project_id}` : "/app/projects";

  return (
    <div className="projects-page">
      <Link to={backLink} className="project-detail-back">
        ← Back to project
      </Link>

      <div className="project-detail-header">
        <h1 style={{ margin: 0 }}>
          {wo.type.replace("_", " ")} <span className="project-status-badge">{wo.status}</span>
        </h1>
        <div className="project-detail-actions">
          {next && (
            <button className="projects-btn primary" disabled={transitioning} onClick={() => handleTransition(next)}>
              {NEXT_ACTION_LABEL[wo.status] ?? `Advance to ${next}`}
            </button>
          )}
          {wo.status === "NEW" && (
            <button className="projects-btn danger" disabled={deleting} onClick={handleDelete}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>

      <div className="project-detail-panel">
        <div className="project-detail-row">
          <span>Work order ID</span>
          <span>{wo.work_order_id}</span>
        </div>
        <div className="project-detail-row">
          <span>Type</span>
          <span>{wo.type}</span>
        </div>
        <div className="project-detail-row">
          <span>Status</span>
          <span>{wo.status}</span>
        </div>
        <div className="project-detail-row">
          <span>Opened</span>
          <span>{new Date(wo.opened_at).toLocaleString()}</span>
        </div>
        <div className="project-detail-row">
          <span>Closed</span>
          <span>{wo.closed_at ? new Date(wo.closed_at).toLocaleString() : "—"}</span>
        </div>
        <div className="project-detail-row">
          <span>Notes</span>
          <span>{wo.notes || "—"}</span>
        </div>
        <div className="project-detail-row">
          <span>Assignee</span>
          <span>{wo.assignee ? `${wo.assignee.name} (${wo.assignee.assignee_type})` : "Unassigned"}</span>
        </div>
      </div>

      <p className="projects-section-label">Assign to</p>
      <div className="projects-filters">
        <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
          <option value="">Select a user…</option>
          {users.map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.full_name} ({u.email})
            </option>
          ))}
        </select>
        <button className="projects-btn primary" disabled={!selectedUserId || assigning} onClick={handleAssign}>
          {assigning ? "Assigning…" : "Assign"}
        </button>
      </div>

      {status && <p className={`projects-status ${status.kind}`}>{status.message}</p>}
    </div>
  );
}
