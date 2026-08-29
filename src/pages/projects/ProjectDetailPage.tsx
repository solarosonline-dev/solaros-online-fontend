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
import ProjectAmcTab from "./ProjectAmcTab";
import { PROJECT_PHASE_GROUPS, phaseForStatus } from "./projectFunnel";
import "./ProjectsPage.css";

type ProjectTab = "installations" | "amc";

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

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [tab, setTab] = useState<ProjectTab>("installations");

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

  // Collapsed 3-stage stepper (Site survey / Installation / Documentation)
  // instead of every individual IN_PROGRESS/COMPLETED status -- the exact
  // status is still shown in the header badge and the detail panel below.
  // A project sitting at COMPLETED is fully past the Documentation stage
  // (folded into it, see PROJECT_PHASE_GROUPS), not merely "current" there.
  const phase = phaseForStatus(project.status);
  const phaseIdx = PROJECT_PHASE_GROUPS.findIndex((g) => g.phase === phase);
  const phaseFullyDone = project.status === "COMPLETED";

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
          {/* Every other transition is now reached by creating/completing
              that phase's work order, or by Skip (see ProjectWorkOrders) --
              a manual advance button for those would just flip the status
              with no work order behind it. COMPLETED has no work-order type
              and no skip entry, so it's the one manual step left. */}
          {project.status === "DOCUMENTATION_COMPLETED" && (
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
              onClick={() => handleTransition("REJECTED")}
            >
              Reject project
            </button>
          )}
        </div>
      </div>

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

          <div className="project-detail-panel">
            <div className="project-detail-row">
              <span>Project ID</span>
              <span>{project.project_id}</span>
            </div>
            <div className="project-detail-row">
              <span>Customer</span>
              <span>{project.customer_name}</span>
            </div>
            <div className="project-detail-row">
              <span>Mobile</span>
              <span>{project.customer_mobile}</span>
            </div>
            <div className="project-detail-row">
              <span>Email</span>
              <span>{project.customer_email || "—"}</span>
            </div>
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

          <ProjectWorkOrders
            entityId={entityId}
            projectId={project.project_id}
            projectStatus={project.status}
            onProjectStatusChange={(newStatus) => setProject((prev) => (prev ? { ...prev, status: newStatus } : prev))}
          />

          <div style={{ marginTop: 16 }}>
            <button type="button" className="projects-btn" onClick={() => navigate("/app/projects")}>
              Back to projects
            </button>
          </div>
        </>
      ) : (
        <ProjectAmcTab
          entityId={entityId}
          projectId={project.project_id}
          projectStatus={project.status}
          hasAmc={project.amc_id != null && project.amc_duration_years != null}
        />
      )}
    </div>
  );
}
