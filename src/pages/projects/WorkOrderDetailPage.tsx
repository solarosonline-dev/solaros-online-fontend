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
  generateSldPdf,
  type WorkOrderDetail,
} from "../../api/workOrders";
import { listEntityUsers, type EntityUser } from "../../api/entityUsers";
import { listTeams, type TeamListItem } from "../../api/teams";
import { getEntityPreferences } from "../../api/entityPreferences";
import { ApiError } from "../../api/client";
import WorkOrderDocuments from "./WorkOrderDocuments";
import ConfirmDialog from "../../components/ConfirmDialog";
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [photoRequired, setPhotoRequired] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [hasAnyDocument, setHasAnyDocument] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);

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

  // Drives the completion-hint below -- purely advisory; the backend's own
  // 409 PHOTO_REQUIRED on the status PATCH is the actual enforcement, so a
  // failure here just means the hint doesn't show, not that the rule is
  // unenforced.
  useEffect(() => {
    getEntityPreferences(entityId)
      .then((res) => setPhotoRequired(res.document_customization.require_work_order_photo))
      .catch(() => {});
  }, [entityId]);

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
    setDeleteConfirmOpen(false);
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

  // SLD_GENERATION only -- asks the backend to render sld_layout/sld_specs
  // into a PDF (real electrical symbols via schemdraw, see
  // app/services/sld_diagram.py) and attach it as a work order document in
  // one call. That attached document is what satisfies the backend's 409
  // SLD_DOCUMENT_REQUIRED completion gate -- see handleTransition's error
  // surfacing above.
  async function handleGeneratePdf() {
    if (!workOrderId) return;
    setGeneratingPdf(true);
    setPdfError(null);
    try {
      await generateSldPdf(entityId, Number(workOrderId));
      setDocumentsRefreshKey((k) => k + 1);
      setStatus({ kind: "success", message: "SLD PDF generated and attached." });
    } catch (err) {
      setPdfError(err instanceof ApiError ? err.message : "Could not generate the SLD PDF");
    } finally {
      setGeneratingPdf(false);
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
  const isSld = wo.type === "SLD_GENERATION";

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
          {/* Advisory only -- clicking through anyway is fine, the backend's
              409 PHOTO_REQUIRED is the actual gate. hasPhoto is derived from
              WorkOrderDocuments' own already-loaded list, so this can lag
              slightly (e.g. right after a delete) without being unsafe.
              Excluded for SLD_GENERATION: the backend skips this gate for
              that type entirely (the generated SLD PDF is itself the proof
              of completion), so showing this hint there would be misleading. */}
          {next === "COMPLETED" && !isSld && photoRequired && !hasPhoto && (
            <span className="work-order-type-hint" style={{ color: "var(--app-danger)" }}>
              A photo is required before this work order can be completed.
            </span>
          )}
          {/* Same advisory idea as the photo hint above, but unconditional
              for this type (no EPC toggle) -- the backend's own 409
              SLD_DOCUMENT_REQUIRED is the actual gate. hasAnyDocument covers
              any content type, not just images, since the generated PDF is
              what satisfies it. */}
          {next === "COMPLETED" && isSld && !hasAnyDocument && (
            <span className="work-order-type-hint" style={{ color: "var(--app-danger)" }}>
              Generate and attach the SLD PDF before this work order can be completed.
            </span>
          )}
          {admin && wo.status === "NEW" && (
            <button className="projects-btn danger" disabled={deleting} onClick={() => setDeleteConfirmOpen(true)}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete this work order?"
        message="This permanently deletes the work order. This can't be undone."
        confirmLabel="Delete"
        confirming={deleting}
        confirmingLabel="Deleting…"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

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
        {isSld && (
          <>
            <div className="project-detail-row">
              <span>Panels</span>
              <span>
                {wo.panel_count} × {wo.panel_wattage_w} W ({wo.string_count} string
                {wo.string_count === 1 ? "" : "s"})
                {(wo.panel_make || wo.panel_model) && ` — ${[wo.panel_make, wo.panel_model].filter(Boolean).join(" ")}`}
              </span>
            </div>
            <div className="project-detail-row">
              <span>Inverters</span>
              <span>
                {wo.inverter_capacity_kw} kW total
                {wo.sld_layout ? ` across ${wo.sld_layout.length} inverter${wo.sld_layout.length === 1 ? "" : "s"}` : ""}
              </span>
            </div>
            {wo.sld_layout && (
              <div className="project-detail-row">
                <span></span>
                <span className="sld-inverter-summary-list">
                  {wo.sld_layout.map((inv, idx) => (
                    <span key={idx} className="sld-inverter-summary-item">
                      Inv {idx + 1}: {inv.make} {inv.model} · {inv.capacity_kw} kW · {inv.strings.length} string
                      {inv.strings.length === 1 ? "" : "s"} · AC cable {inv.ac_cable} · AC breaker {inv.ac_breaker}
                    </span>
                  ))}
                </span>
              </div>
            )}
            {wo.sld_specs && (
              <div className="project-detail-row">
                <span>System specs</span>
                <span className="sld-inverter-summary-list">
                  <span className="sld-inverter-summary-item">DC string cable: {wo.sld_specs.dc_string_cable}</span>
                  <span className="sld-inverter-summary-item">DC combiner protection: {wo.sld_specs.dc_combiner_protection}</span>
                  <span className="sld-inverter-summary-item">DC earthing cable: {wo.sld_specs.dc_earthing_cable}</span>
                  <span className="sld-inverter-summary-item">
                    Lightning arrestor: {wo.sld_specs.lightning_arrestor ? "Fitted" : "Not fitted"}
                  </span>
                  <span className="sld-inverter-summary-item">Busbar rating: {wo.sld_specs.busbar_rating_a} A</span>
                  <span className="sld-inverter-summary-item">Main incomer protection: {wo.sld_specs.main_incomer_protection}</span>
                  <span className="sld-inverter-summary-item">Meter cable: {wo.sld_specs.meter_cable}</span>
                </span>
              </div>
            )}
          </>
        )}
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

      {isSld && wo.panel_wattage_w != null && wo.sld_layout != null && (
        <>
          <p className="projects-section-label">Single line diagram</p>
          <p className="work-order-type-hint">
            The PDF is rendered server-side from the specs above (real electrical symbols, cable/protection
            labels, and a title block) -- there's no separate live preview to keep in sync; generate it below,
            then view/download it from the documents list.
          </p>
          <div className="work-orders-new-panel">
            <button className="projects-btn primary" disabled={generatingPdf} onClick={handleGeneratePdf}>
              {generatingPdf ? "Generating…" : hasAnyDocument ? "Regenerate PDF" : "Generate PDF"}
            </button>
            {pdfError && (
              <span className="work-order-type-hint" style={{ color: "var(--app-danger)" }}>
                {pdfError}
              </span>
            )}
          </div>
        </>
      )}

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
        <WorkOrderDocuments
          key={documentsRefreshKey}
          entityId={entityId}
          workOrderId={Number(workOrderId)}
          onDocumentsChange={setHasPhoto}
          onAnyDocumentChange={setHasAnyDocument}
        />
      </div>
      </div>
    </div>
  );
}
