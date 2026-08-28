import type { ProjectStatus } from "../../api/projects";

/** The project lifecycle, in order — the same STATUS_CHAIN that already
 * drives nextProjectStatus()/canRejectProject() in api/projects.ts.
 * REJECTED is a terminal side-exit rather than a funnel stage, so it's
 * handled separately wherever this is used (mirrors leadFunnel.tsx). */
export const PROJECT_FUNNEL_STEPS: { status: ProjectStatus; label: string }[] = [
  { status: "NEW", label: "New" },
  { status: "SITE_SURVEY_IN_PROGRESS", label: "Site survey in progress" },
  { status: "INSTALLATION_IN_PROGRESS", label: "Installation in progress" },
  { status: "INSTALLATION_COMPLETED", label: "Installation completed" },
  { status: "DOCUMENTATION_IN_PROGRESS", label: "Documentation in progress" },
  { status: "COMPLETED", label: "Completed" },
];

export function projectFunnelLabel(status: ProjectStatus): string {
  if (status === "REJECTED") return "Rejected";
  return PROJECT_FUNNEL_STEPS.find((s) => s.status === status)?.label ?? status;
}

/** Plain status pill — used wherever a single project's current status is
 * shown inline (table rows, detail-page header). No funnel styling here;
 * the funnel visualization lives one level up, as navigation (see
 * ProjectFunnelNav). */
export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const modifier = status === "REJECTED" ? " rejected" : status === "COMPLETED" ? " completed" : "";
  return <span className={`project-status-badge${modifier}`}>{projectFunnelLabel(status)}</span>;
}

/** Top-level, clickable funnel navigation for the projects list: New >
 * Site survey in progress > ... > Completed. Clicking a stage filters the
 * list down to projects currently at that stage (`onSelect(status)`);
 * "All" clears the filter and shows every project regardless of status
 * (the page passes `all: true` to the list call whenever no stage is
 * selected — see GET .../projects semantics, where an empty status with no
 * `all=true` would otherwise silently exclude terminal projects).
 * "Rejected" sits off to the side as its own tab, since it's a side-exit
 * from the funnel, not a stage within it. */
export function ProjectFunnelNav({
  value,
  onSelect,
}: {
  value: ProjectStatus | "";
  onSelect: (status: ProjectStatus | "") => void;
}) {
  return (
    <div className="project-funnel-nav">
      {/* Mobile (≤640px): a single native dropdown instead of a row of
       * separate buttons — see .project-funnel-select / .project-funnel-buttons
       * in ProjectsPage.css for the breakpoint that swaps between the two. */}
      <select
        className="project-funnel-select"
        aria-label="Filter projects by status"
        value={value}
        onChange={(e) => onSelect(e.target.value as ProjectStatus | "")}
      >
        <option value="">All</option>
        {PROJECT_FUNNEL_STEPS.map((step) => (
          <option key={step.status} value={step.status}>
            {step.label}
          </option>
        ))}
        <option value="REJECTED">Rejected</option>
      </select>

      <div className="project-funnel-buttons">
        <button
          type="button"
          className={`project-funnel-tab project-funnel-tab--all${value === "" ? " active" : ""}`}
          onClick={() => onSelect("")}
        >
          All
        </button>
        <div className="project-funnel">
          {PROJECT_FUNNEL_STEPS.map((step) => (
            <button
              key={step.status}
              type="button"
              className={`project-funnel-chevron${value === step.status ? " active" : ""}`}
              onClick={() => onSelect(step.status)}
            >
              {step.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`project-funnel-tab project-funnel-tab--rejected${value === "REJECTED" ? " active" : ""}`}
          onClick={() => onSelect("REJECTED")}
        >
          Rejected
        </button>
      </div>
    </div>
  );
}
