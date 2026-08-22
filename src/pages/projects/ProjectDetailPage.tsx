import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import {
  getProject,
  updateProjectStatus,
  nextProjectStatus,
  canRejectProject,
  type ProjectDetail,
  type ProjectStatus,
} from "../../api/projects";
import { ApiError } from "../../api/client";
import "./ProjectsPage.css";

const STEPS: { status: ProjectStatus; label: string }[] = [
  { status: "NEW", label: "New" },
  { status: "SITE_SURVEY_IN_PROGRESS", label: "Site survey" },
  { status: "INSTALLATION_IN_PROGRESS", label: "Installation" },
  { status: "INSTALLATION_COMPLETED", label: "Installation done" },
  { status: "DOCUMENTATION_IN_PROGRESS", label: "Documentation" },
  { status: "COMPLETED", label: "Completed" },
];

const NEXT_ACTION_LABEL: Record<ProjectStatus, string | null> = {
  NEW: "Start site survey",
  SITE_SURVEY_IN_PROGRESS: "Start installation",
  INSTALLATION_IN_PROGRESS: "Mark installation completed",
  INSTALLATION_COMPLETED: "Start documentation",
  DOCUMENTATION_IN_PROGRESS: "Mark completed",
  COMPLETED: null,
  REJECTED: null,
};

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

  const next = nextProjectStatus(project.status);
  const stepIdx = STEPS.findIndex((s) => s.status === project.status);

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
          {next && (
            <button
              className="projects-btn primary"
              disabled={transitioning}
              onClick={() => handleTransition(next)}
            >
              {NEXT_ACTION_LABEL[project.status] ?? `Advance to ${next}`}
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

      {project.status !== "REJECTED" && (
        <div className="project-detail-stepper">
          {STEPS.map((s, i) => (
            <span
              key={s.status}
              className={`project-step${i < stepIdx ? " done" : ""}${i === stepIdx ? " current" : ""}`}
            >
              {s.label}
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
          <span>Created</span>
          <span>{new Date(project.created_at).toLocaleString()}</span>
        </div>
        <div className="project-detail-row">
          <span>Status</span>
          <span>{project.status}</span>
        </div>
      </div>

      {status && <p className={`projects-status ${status.kind}`}>{status.message}</p>}

      <div style={{ marginTop: 16 }}>
        <button type="button" className="projects-btn" onClick={() => navigate("/app/projects")}>
          Back to projects
        </button>
      </div>
    </div>
  );
}
