import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { canManageAmc, isEntityAdmin } from "../../lib/roles";
import {
  getWorkOrder,
  updateWorkOrderStatus,
  assignWorkOrder,
  deleteWorkOrder,
  nextWorkOrderStatus,
  type WorkOrderDetail,
} from "../../api/workOrders";
import { listEntityUsers, type EntityUser } from "../../api/entityUsers";
import { listTeams, type TeamListItem } from "../../api/teams";
import { ApiError } from "../../api/client";
import WorkOrderDocuments from "./WorkOrderDocuments";
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
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [assigneeType, setAssigneeType] = useState<"USER" | "TEAM">("USER");

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

  // Prefill the assign form with the current assignee once the work order
  // (and, for a team assignee, the teams list) has loaded, so reassigning is
  // a one-field change from the existing value rather than a blank form.
  useEffect(() => {
    if (!wo?.assignee) return;
    setAssigneeType(wo.assignee.assignee_type);
    if (wo.assignee.assignee_type === "USER") {
      setSelectedUserId(String(wo.assignee.assignee_id));
    } else {
      setSelectedTeamId(String(wo.assignee.assignee_id));
    }
  }, [wo?.assignee]);

  // Both listEntityUsers and listTeams are entity-admin-only endpoints now
  // (see app/api/v1/router.py on the backend) -- skip the calls entirely for
  // WORKER/TECHNICIAN, who can never assign work orders anyway.
  const canManageAssignment = isEntityAdmin(user!.roles) || canManageAmc(user!.roles);
  useEffect(() => {
    if (!canManageAssignment) return;
    listEntityUsers(entityId)
      .then((res) => setUsers(res.items))
      .catch(() => {});
    listTeams(entityId, { active: true })
      .then((res) => setTeams(res.items))
      .catch(() => {});
  }, [entityId, canManageAssignment]);

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
    const selectedId = assigneeType === "USER" ? selectedUserId : selectedTeamId;
    if (!workOrderId || !selectedId) return;
    setAssigning(true);
    setStatus(null);
    try {
      const wasAssigned = wo?.assignee != null;
      const res = await assignWorkOrder(entityId, Number(workOrderId), assigneeType, Number(selectedId));
      const matchedUser = assigneeType === "USER" ? users.find((u) => u.user_id === res.assignee_id) : undefined;
      const name =
        assigneeType === "USER"
          ? matchedUser?.full_name ?? ""
          : teams.find((t) => t.team_id === res.assignee_id)?.name ?? "";
      setWo((prev) =>
        prev
          ? {
              ...prev,
              assignee: {
                assignee_type: assigneeType,
                assignee_id: res.assignee_id,
                name,
                email: matchedUser?.email ?? null,
                phone: matchedUser?.phone ?? null,
              },
            }
          : prev,
      );
      setStatus({ kind: "success", message: wasAssigned ? "Reassigned." : "Assigned." });
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
      navigate(wo.project_id ? `/app/projects/${wo.project_id}` : `/app/leads/${wo.lead_id}`);
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
  // Non-admins (WORKER/TECHNICIAN) can't reach the admin-only project/
  // projects-list pages any more, so send them back to their own queue
  // instead of a link that would just bounce them straight back out.
  const admin = isEntityAdmin(user!.roles);
  const backLink = admin
    ? wo.project_id
      ? `/app/projects/${wo.project_id}`
      : `/app/leads/${wo.lead_id}`
    : "/app/my-work-orders";
  const backLabel = admin ? (wo.project_id ? "← Back to project" : "← Back to lead") : "← Back to my work orders";
  // AMC_SERVICE assignment is backend-gated to entity admins/
  // ENTITY_SERVICE_MANAGER (see require_amc_manager / is_amc_manager);
  // every other work order type is entity-admin only -- WORKER/TECHNICIAN
  // can never assign, only be assigned.
  const canAssign = wo.type === "AMC_SERVICE" ? canManageAmc(user!.roles) : admin;

  return (
    <div className="projects-page">
      <Link to={backLink} className="project-detail-back">
        {backLabel}
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
          {admin && wo.status === "NEW" && (
            <button className="projects-btn danger" disabled={deleting} onClick={handleDelete}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>

      <div className="project-detail-layout">
      <div className="project-detail-main">
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
          <span>Completed</span>
          <span>{wo.closed_at ? new Date(wo.closed_at).toLocaleString() : "—"}</span>
        </div>
        <div className="project-detail-row">
          <span>Notes</span>
          <span>{wo.notes || "—"}</span>
        </div>
        <div className="project-detail-row">
          <span>Customer</span>
          <span>
            {wo.lead.name}
            <div className="work-order-assignee-contact">
              {[wo.lead.mobile, wo.lead.email].filter(Boolean).join(" · ")}
            </div>
          </span>
        </div>
        <div className="project-detail-row">
          <span>Address</span>
          <span>{wo.lead.address || "—"}</span>
        </div>
        <div className="project-detail-row">
          <span>Assignee</span>
          <span>
            {wo.assignee ? (
              <>
                {wo.assignee.name} ({wo.assignee.assignee_type})
                {(wo.assignee.email || wo.assignee.phone) && (
                  <div className="work-order-assignee-contact">
                    {[wo.assignee.email, wo.assignee.phone].filter(Boolean).join(" · ")}
                  </div>
                )}
              </>
            ) : (
              "Unassigned"
            )}
          </span>
        </div>
      </div>

      {/* No explanatory hint for the non-permitted case -- a WORKER/
          TECHNICIAN viewing their own assigned work order can never assign
          one regardless, so "only entity admins can assign" is just noise
          for them, not actionable information. */}
      {canAssign && (
        <>
          <p className="projects-section-label">{wo.assignee ? "Reassign to" : "Assign to"}</p>
          <div className="projects-filters">
            <select value={assigneeType} onChange={(e) => setAssigneeType(e.target.value as "USER" | "TEAM")}>
              <option value="USER">Individual</option>
              <option value="TEAM">Team</option>
            </select>
            {assigneeType === "USER" ? (
              <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                <option value="">Select a user…</option>
                {users.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
              </select>
            ) : (
              <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}>
                <option value="">Select a team…</option>
                {teams.map((t) => (
                  <option key={t.team_id} value={t.team_id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className="projects-btn primary"
              disabled={
                (assigneeType === "USER" ? !selectedUserId : !selectedTeamId) ||
                assigning ||
                (wo.assignee != null &&
                  wo.assignee.assignee_type === assigneeType &&
                  String(wo.assignee.assignee_id) === (assigneeType === "USER" ? selectedUserId : selectedTeamId))
              }
              onClick={handleAssign}
            >
              {assigning ? "Assigning…" : wo.assignee ? "Reassign" : "Assign"}
            </button>
          </div>
        </>
      )}

      {status && <p className={`projects-status ${status.kind}`}>{status.message}</p>}
      </div>

      <div className="project-detail-side">
        <WorkOrderDocuments entityId={entityId} workOrderId={Number(workOrderId)} />
      </div>
      </div>
    </div>
  );
}
