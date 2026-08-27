import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { listProjects, type ProjectListItem, type ProjectStatus } from "../../api/projects";
import { ApiError } from "../../api/client";
import "./ProjectsPage.css";

const STATUS_OPTIONS: { label: string; value: ProjectStatus | "" }[] = [
  { label: "Active (default)", value: "" },
  { label: "New", value: "NEW" },
  { label: "Site survey in progress", value: "SITE_SURVEY_IN_PROGRESS" },
  { label: "Installation in progress", value: "INSTALLATION_IN_PROGRESS" },
  { label: "Installation completed", value: "INSTALLATION_COMPLETED" },
  { label: "Documentation in progress", value: "DOCUMENTATION_IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Rejected", value: "REJECTED" },
];

function badgeClass(status: ProjectStatus): string {
  if (status === "REJECTED") return "project-status-badge rejected";
  if (status === "COMPLETED") return "project-status-badge completed";
  return "project-status-badge";
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const navigate = useNavigate();

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "">("");

  function load() {
    setLoading(true);
    setLoadError(null);
    listProjects(entityId, { status: statusFilter || undefined })
      .then((res) => setProjects(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load projects"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, statusFilter]);

  return (
    <div className="projects-page">
      <h1>Projects</h1>

      <div className="projects-filters">
        <label>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | "")}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="projects-table-wrap">
        {loading ? (
          <div className="projects-loading">Loading…</div>
        ) : loadError ? (
          <div className="projects-loading">{loadError}</div>
        ) : projects.length === 0 ? (
          <div className="projects-empty">No projects yet.</div>
        ) : (
          <table className="projects-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.project_id} onClick={() => navigate(`/app/projects/${p.project_id}`)}>
                  <td data-label="Customer">{p.customer_name}</td>
                  <td data-label="Status">
                    <span className={badgeClass(p.status)}>{p.status}</span>
                  </td>
                  <td data-label="Created">{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
