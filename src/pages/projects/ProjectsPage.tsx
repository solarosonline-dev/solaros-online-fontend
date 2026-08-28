import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { canManageAmc } from "../../lib/roles";
import { listProjects, type ProjectListItem, type ProjectStatus } from "../../api/projects";
import { listAmcScheduleDue, type AmcScheduleDueItem, type AmcScheduleItem } from "../../api/amcSchedule";
import { ApiError } from "../../api/client";
import { ProjectFunnelNav, ProjectStatusBadge } from "./projectFunnel";
import AmcActionTable, { type AmcActionRow } from "./AmcActionTable";
import { dueBucket, nextPendingScheduleIds, startOfDay } from "../../lib/amcDue";
import "./ProjectsPage.css";

type ProjectsTab = "all" | "amc-due";

export default function ProjectsPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const navigate = useNavigate();
  const canSeeAmcDue = canManageAmc(user!.roles);

  const [tab, setTab] = useState<ProjectsTab>("all");

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "">("");

  const [amcDueItems, setAmcDueItems] = useState<AmcScheduleDueItem[]>([]);
  const [amcDueLoading, setAmcDueLoading] = useState(true);
  const [amcDueError, setAmcDueError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    listProjects(entityId, { status: statusFilter || undefined, all: statusFilter ? undefined : true })
      .then((res) => setProjects(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load projects"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, statusFilter]);

  function loadAmcDue() {
    setAmcDueLoading(true);
    setAmcDueError(null);
    listAmcScheduleDue(entityId)
      .then((res) => setAmcDueItems(res.items))
      .catch((err) => setAmcDueError(err instanceof ApiError ? err.message : "Failed to load AMC due list"))
      .finally(() => setAmcDueLoading(false));
  }

  // Independent of the project status filter above -- AMC due visits matter
  // regardless of which funnel stage their project happens to be showing.
  // Gated on role: the backend 403s this endpoint for anyone who isn't an
  // entity admin or ENTITY_SERVICE_MANAGER, so skip the call entirely rather
  // than firing a request that's guaranteed to fail for other roles.
  useEffect(() => {
    if (canSeeAmcDue) loadAmcDue();
    else setAmcDueLoading(false);
  }, [entityId, canSeeAmcDue]);

  const [today] = useState(() => startOfDay(new Date()));

  // Overdue / due-this-week / due-next-week AMC occurrences across every
  // project for the entity -- the three buckets this page surfaces (unlike
  // the per-project AMC tab, occurrences due further out aren't shown here
  // even if they're a project's "next due" one). Each project's next-pending
  // occurrence is computed independently so the create-work-order action
  // stays accurate even when a project has multiple due items at once.
  const amcDueRows = useMemo<AmcActionRow[]>(() => {
    const byProject = new Map<number, AmcScheduleItem[]>();
    for (const item of amcDueItems) {
      const list = byProject.get(item.project_id);
      if (list) list.push(item);
      else byProject.set(item.project_id, [item]);
    }
    const actionableByProject = new Map<number, Set<number>>();
    for (const [projectId, items] of byProject) {
      actionableByProject.set(projectId, nextPendingScheduleIds(items));
    }

    return amcDueItems
      .map((item) => ({ item, bucket: dueBucket(item.schedule_date, today) }))
      .filter((x): x is { item: AmcScheduleDueItem; bucket: NonNullable<ReturnType<typeof dueBucket>> } => x.bucket !== null)
      .sort((a, b) => a.item.schedule_date.localeCompare(b.item.schedule_date))
      .map(({ item, bucket }) => ({
        item,
        bucket,
        actionable: actionableByProject.get(item.project_id)?.has(item.schedule_id) ?? false,
        projectId: item.project_id,
        customerName: item.customer_name,
      }));
  }, [amcDueItems, today]);

  function handleAmcItemChanged(scheduleId: number, patch: Partial<AmcScheduleItem>) {
    setAmcDueItems((prev) => prev.map((i) => (i.schedule_id === scheduleId ? { ...i, ...patch } : i)));
  }

  return (
    <div className="projects-page">
      <h1>Projects</h1>

      {canSeeAmcDue && (
        <div className="project-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "all"}
            className={tab === "all" ? "project-tab active" : "project-tab"}
            onClick={() => setTab("all")}
          >
            All projects
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "amc-due"}
            className={tab === "amc-due" ? "project-tab active" : "project-tab"}
            onClick={() => setTab("amc-due")}
          >
            AMC visits due
          </button>
        </div>
      )}

      {tab === "amc-due" && canSeeAmcDue ? (
        amcDueLoading ? (
          <div className="projects-loading">Loading…</div>
        ) : amcDueError ? (
          <p className="projects-status error">{amcDueError}</p>
        ) : (
          <AmcActionTable
            entityId={entityId}
            rows={amcDueRows}
            emptyMessage="Nothing overdue or due in the next two weeks across any project."
            onItemChanged={handleAmcItemChanged}
          />
        )
      ) : (
        <>
          <ProjectFunnelNav value={statusFilter} onSelect={setStatusFilter} />

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
                        <ProjectStatusBadge status={p.status} />
                      </td>
                      <td data-label="Created">{new Date(p.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
