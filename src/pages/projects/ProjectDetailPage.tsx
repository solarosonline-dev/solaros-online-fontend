import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import {
  getProject,
  updateProjectStatus,
  canRejectProject,
  type ProjectDetail,
  type ProjectStatus,
} from "../../api/projects";
import { ApiError } from "../../api/client";
import ProjectWorkOrders from "./ProjectWorkOrders";
import GenerateSldPanel from "./GenerateSldPanel";
import ProjectAmcTab from "./ProjectAmcTab";
import ProjectDocumentsTab from "./ProjectDocumentsTab";
import MaterialRoutingTab from "./tabs/MaterialRoutingTab";
import ProcurementOrdersTab from "./tabs/ProcurementOrdersTab";
import { ProjectPaymentsTab } from "./tabs/ProjectPaymentsTab";
import CommissioningSummaryCard from "./CommissioningSummaryCard";
import { PROJECT_PHASE_GROUPS, phaseForStatus, projectBadgeTone, projectFunnelLabel, projectPhaseProgress } from "./projectFunnel";
import ConfirmDialog from "../../components/ConfirmDialog";
import "./ProjectsPage.css";

type MobileTab = "work" | "money" | "documents" | "more";

type ProjectTab = "installations" | "amc" | "sld" | "documents" | "routing" | "procurement" | "payments";

function badgeClass(status: ProjectStatus): string {
  if (status === "REJECTED") return "project-status-badge rejected";
  if (status === "COMPLETED") return "project-status-badge completed";
  return "project-status-badge";
}

export default function ProjectDetailPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const { projectId } = useParams();
  const navigate = useNavigate();
  const isMobile = document.body.classList.contains("mobile-view");

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [tab, setTab] = useState<ProjectTab>("installations");
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);

  // Mobile app only: four grouped tabs instead of seven.
  const [mTab, setMTab] = useState<MobileTab>("work");
  const [moneySub, setMoneySub] = useState<"received" | "vendor">("received");
  const [moreSub, setMoreSub] = useState<"amc" | "routing">("amc");
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  function load() {
    if (!projectId) return;
    setLoading(true);
    setLoadError(null);
    getProject(entityId, Number(projectId))
      .then(setProject)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load project"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, projectId]);

  async function handleTransition(target: ProjectStatus) {
    if (!projectId) return;
    setTransitioning(true);
    setStatus(null);
    try {
      const res = await updateProjectStatus(entityId, Number(projectId), target);
      setProject((prev) => (prev ? { ...prev, status: res.status } : prev));
      setStatus({ kind: "success", message: `Status updated to ${res.status}.` });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Could not update status" });
    } finally {
      setTransitioning(false);
    }
  }

  if (loading) return <div className="projects-loading">Loading…</div>;
  if (loadError || !project) {
    return (
      <div className="projects-page">
        <Link to="/app/projects" className="project-detail-back">
          ← Back to projects
        </Link>
        <p className="projects-status error">{loadError ?? "Project not found."}</p>
      </div>
    );
  }

  // Collapsed 3-stage stepper (Site survey / Installation / Commissioning)
  // instead of every individual IN_PROGRESS/COMPLETED status -- the exact
  // status is still shown in the header badge and the detail panel below.
  // A project sitting at COMPLETED is fully past the Commissioning stage
  // (folded into it, see PROJECT_PHASE_GROUPS), not merely "current" there.
  const phase = phaseForStatus(project.status);
  const phaseIdx = PROJECT_PHASE_GROUPS.findIndex((g) => g.phase === phase);
  const phaseFullyDone = project.status === "COMPLETED";


  if (isMobile) {
    const prog = projectPhaseProgress(project.status);
    const phoneDigits = project.customer_mobile.replace(/\D/g, "");
    return (
      <div className="projects-page m-page">
        <div className="m-detail-head">
          <button type="button" className="m-icon-btn" aria-label="Back to projects" onClick={() => navigate("/app/projects")}>
            ←
          </button>
          <div className="m-detail-head-main">
            <h1>{project.customer_name}</h1>
            <span className={`m-badge ${projectBadgeTone(project.status)}`}>{projectFunnelLabel(project.status)}</span>
          </div>
          {canRejectProject(project.status) && (
            <div className="m-menu">
              <button type="button" className="m-icon-btn" aria-label="More actions" onClick={() => setMenuOpen((o) => !o)}>
                ⋯
              </button>
              {menuOpen && (
                <div className="m-menu-pop">
                  <button
                    type="button"
                    className="danger"
                    disabled={transitioning}
                    onClick={() => {
                      setMenuOpen(false);
                      setRejectConfirmOpen(true);
                    }}
                  >
                    Reject project
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <ConfirmDialog
          open={rejectConfirmOpen}
          title="Reject this project?"
          message="This marks the project as rejected. This can't be undone."
          confirmLabel="Reject project"
          confirming={transitioning}
          confirmingLabel="Rejecting…"
          onConfirm={() => {
            setRejectConfirmOpen(false);
            handleTransition("REJECTED");
          }}
          onCancel={() => setRejectConfirmOpen(false)}
        />

        <div className="m-comm-row">
          <a href={`tel:${project.customer_mobile}`} className="m-comm-btn call">
            📞 Call Client
          </a>
          <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer" className="m-comm-btn wa">
            💬 WhatsApp
          </a>
        </div>

        {project.status === "COMMISSIONING_COMPLETED" && (
          <button type="button" className="m-btn primary block" disabled={transitioning} onClick={() => handleTransition("COMPLETED")}>
            Mark project completed
          </button>
        )}

        {status && <p className={`m-status ${status.kind}`}>{status.message}</p>}

        <div className="m-card">
          {prog && (
            <div style={{ marginBottom: 14 }}>
              <div className="m-progress">
                {PROJECT_PHASE_GROUPS.map((g, i) => (
                  <span key={g.phase} className={i < prog.index || (i === prog.index && prog.done) ? "done" : i === prog.index ? "current" : ""} />
                ))}
              </div>
              <div className="m-progress-caption">
                <span>
                  Step {prog.index + 1} of {prog.total} · <strong>{prog.label}</strong>
                </span>
              </div>
            </div>
          )}
          <button type="button" className="m-collapse-toggle" onClick={() => setSummaryOpen((o) => !o)} aria-expanded={summaryOpen}>
            <span>Project details</span>
            <span>{summaryOpen ? "▲" : "▼"}</span>
          </button>
          {summaryOpen && (
            <div className="m-collapse-body">
              <div className="m-kv">
                <span className="m-kv-label">Address</span>
                <span className="m-kv-value">{project.customer_address || "—"}</span>
              </div>
              <div className="m-kv-grid" style={{ marginTop: 10 }}>
                <div className="m-kv">
                  <span className="m-kv-label">Created</span>
                  <span className="m-kv-value">{new Date(project.created_at).toLocaleDateString()}</span>
                </div>
                <div className="m-kv">
                  <span className="m-kv-label">{project.completed_at ? "Completed" : "Mobile"}</span>
                  <span className="m-kv-value">
                    {project.completed_at ? new Date(project.completed_at).toLocaleDateString() : project.customer_mobile}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="m-tabs" role="tablist">
          {(
            [
              ["work", "Work"],
              ["money", "Money"],
              ["documents", "Documents"],
              ["more", "More"],
            ] as [MobileTab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mTab === key}
              className={`m-tab${mTab === key ? " active" : ""}`}
              onClick={() => setMTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {mTab === "work" && (
          <>
            {project.commissioning && <CommissioningSummaryCard commissioning={project.commissioning} />}
            <ProjectWorkOrders
              entityId={entityId}
              projectId={project.project_id}
              leadId={project.lead_id}
              projectStatus={project.status}
              onProjectStatusChange={(newStatus) => setProject((prev) => (prev ? { ...prev, status: newStatus } : prev))}
            />
          </>
        )}

        {mTab === "money" && (
          <>
            <div className="m-segment">
              <button type="button" className={moneySub === "received" ? "active" : ""} onClick={() => setMoneySub("received")}>
                Received
              </button>
              <button type="button" className={moneySub === "vendor" ? "active" : ""} onClick={() => setMoneySub("vendor")}>
                Vendor orders
              </button>
            </div>
            {moneySub === "received" ? (
              <ProjectPaymentsTab entityId={entityId} projectId={project.project_id} />
            ) : (
              <ProcurementOrdersTab entityId={entityId} projectId={project.project_id} />
            )}
          </>
        )}

        {mTab === "documents" && <ProjectDocumentsTab entityId={entityId} projectId={project.project_id} />}

        {mTab === "more" && (
          <>
            <div className="m-segment">
              <button type="button" className={moreSub === "amc" ? "active" : ""} onClick={() => setMoreSub("amc")}>
                AMC
              </button>
              <button type="button" className={moreSub === "routing" ? "active" : ""} onClick={() => setMoreSub("routing")}>
                Material routing
              </button>
            </div>
            {moreSub === "amc" ? (
              <ProjectAmcTab
                entityId={entityId}
                projectId={project.project_id}
                projectStatus={project.status}
                hasAmc={project.amc_id != null && project.amc_duration_years != null}
              />
            ) : (
              <MaterialRoutingTab entityId={entityId} projectId={project.project_id} />
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="projects-page">
      <Link to="/app/projects" className="project-detail-back">
        ← Back to projects
      </Link>

      <div className="project-detail-header">
        <h1 style={{ margin: 0 }}>
          {project.customer_name} <span className={badgeClass(project.status)}>{project.status}</span>
        </h1>
        <div className="project-detail-actions">
          {(
            <>
              <Link to={`/app/leads/${project.lead_id}`} className="projects-btn">
                View lead
              </Link>
              {/* A project only exists once the lead's agreement is accepted,
                  which requires an accepted quote first -- so there's always at
                  least one quote by this point. Same route LeadDetailPage links
                  to; QuoteBuilderPage loads the lead's existing quote in view
                  mode rather than starting a blank one. */}
              <Link to={`/app/leads/${project.lead_id}/quote`} className="projects-btn">
                View quote
              </Link>
            </>
          )}
          {/* Every other transition is now reached by creating/completing
              that phase's work order, or by Skip (see ProjectWorkOrders) --
              a manual advance button for those would just flip the status
              with no work order behind it. COMPLETED has no work-order type
              and no skip entry, so it's the one manual step left. */}
          {project.status === "COMMISSIONING_COMPLETED" && (
            <button
              className="projects-btn primary"
              disabled={transitioning}
              onClick={() => handleTransition("COMPLETED")}
            >
              Mark completed
            </button>
          )}
          {canRejectProject(project.status) && (
            <button
              className="projects-btn danger"
              disabled={transitioning}
              onClick={() => setRejectConfirmOpen(true)}
            >
              Reject project
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={rejectConfirmOpen}
        title="Reject this project?"
        message="This marks the project as rejected. This can't be undone."
        confirmLabel="Reject project"
        confirming={transitioning}
        confirmingLabel="Rejecting…"
        onConfirm={() => {
          setRejectConfirmOpen(false);
          handleTransition("REJECTED");
        }}
        onCancel={() => setRejectConfirmOpen(false)}
      />

      <div className="project-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "installations"}
          className={`project-tab${tab === "installations" ? " active" : ""}`}
          onClick={() => setTab("installations")}
        >
          Installations
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "amc"}
          className={`project-tab${tab === "amc" ? " active" : ""}`}
          onClick={() => setTab("amc")}
        >
          AMC
        </button>
        {/* Its own tab rather than a funnel phase -- SLD generation can
            happen at any point in the project's life, same idea as AMC
            above, so it doesn't belong inside the phase-gated
            Installations tab alongside ProjectWorkOrders. */}
        <button
          type="button"
          role="tab"
          aria-selected={tab === "sld"}
          className={`project-tab${tab === "sld" ? " active" : ""}`}
          onClick={() => setTab("sld")}
        >
          SLD
        </button>
        {/* Aggregates Quote/Agreement/every WorkOrderDocument (site photos,
            the generated SLD PDF, etc) into one grid -- see
            ProjectDocumentsTab -- rather than living inside Installations,
            since it spans every phase and every tab above, not just one. */}
        <button
          type="button"
          role="tab"
          aria-selected={tab === "documents"}
          className={`project-tab${tab === "documents" ? " active" : ""}`}
          onClick={() => setTab("documents")}
        >
          All documents
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "routing"}
          className={`project-tab${tab === "routing" ? " active" : ""}`}
          onClick={() => setTab("routing")}
        >
          Material Routing
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "procurement"}
          className={`project-tab${tab === "procurement" ? " active" : ""}`}
          onClick={() => setTab("procurement")}
        >
          Procurement Orders
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "payments"}
          className={`project-tab${tab === "payments" ? " active" : ""}`}
          onClick={() => setTab("payments")}
        >
          Project Payments
        </button>
      </div>

      {tab === "installations" ? (
        <>
          {project.status !== "REJECTED" && (
            <div className="project-detail-stepper">
              {PROJECT_PHASE_GROUPS.map((g, i) => (
                <span
                  key={g.phase}
                  className={`project-step${
                    i < phaseIdx || (i === phaseIdx && phaseFullyDone) ? " done" : ""
                  }${i === phaseIdx && !phaseFullyDone ? " current" : ""}`}
                >
                  {g.label}
                </span>
              ))}
            </div>
          )}

          {/* Project ID/customer name/mobile/email are deliberately left out
              here -- customer name is already in the header above, and every
              other bit of contact info is already on each row of the work
              orders table below (see ProjectWorkOrders' "Customer" column),
              so repeating them in this tile would just be noise. */}
          <div className="project-detail-panel">
            <div className="project-detail-row">
              <span>Address</span>
              <span>{project.customer_address || "—"}</span>
            </div>
            <div className="project-detail-row">
              <span>Created</span>
              <span>{new Date(project.created_at).toLocaleString()}</span>
            </div>
            <div className="project-detail-row">
              <span>Status</span>
              <span>{project.status}</span>
            </div>
            {project.completed_at && (
              <div className="project-detail-row">
                <span>Completed</span>
                <span>{new Date(project.completed_at).toLocaleString()}</span>
              </div>
            )}
          </div>

          {status && <p className={`projects-status ${status.kind}`}>{status.message}</p>}

          {/* Read-only -- the Discom application number/screenshot/current
              stage are entered/edited from the Commissioning work order's
              own detail page (CommissioningPanel), not here. Only rendered
              once a COMMISSIONING work order exists for this project. */}
          {project.commissioning && <CommissioningSummaryCard commissioning={project.commissioning} />}

          <ProjectWorkOrders
            entityId={entityId}
            projectId={project.project_id}
            leadId={project.lead_id}
            projectStatus={project.status}
            onProjectStatusChange={(newStatus) => setProject((prev) => (prev ? { ...prev, status: newStatus } : prev))}
          />

          <div style={{ marginTop: 16, display: "flex", gap: "10px" }}>
            <button type="button" className="projects-btn" onClick={() => navigate("/app/projects")}>
              Back to projects
            </button>
          </div>
        </>
      ) : tab === "amc" ? (
        <ProjectAmcTab
          entityId={entityId}
          projectId={project.project_id}
          projectStatus={project.status}
          hasAmc={project.amc_id != null && project.amc_duration_years != null}
        />
      ) : tab === "sld" ? (
        <GenerateSldPanel entityId={entityId} projectId={project.project_id} />
      ) : tab === "routing" ? (
        <MaterialRoutingTab entityId={entityId} projectId={project.project_id} />
      ) : tab === "procurement" ? (
        <ProcurementOrdersTab entityId={entityId} projectId={project.project_id} />
      ) : tab === "payments" ? (
        <ProjectPaymentsTab entityId={entityId} projectId={project.project_id} />
      ) : (
        <ProjectDocumentsTab entityId={entityId} projectId={project.project_id} />
      )}
    </div>
  );
}
