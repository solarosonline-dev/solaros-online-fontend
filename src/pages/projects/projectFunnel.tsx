import type { ProjectStatus } from "../../api/projects";

/** The project lifecycle, in order — the same STATUS_CHAIN that already
 * drives nextProjectStatus()/canRejectProject() in api/projects.ts. Used
 * for exact per-project status labels (badges); REJECTED is a terminal
 * side-exit rather than a funnel stage, so it's handled separately
 * wherever this is used (mirrors leadFunnel.tsx). */
const PROJECT_STATUS_STEPS: { status: ProjectStatus; label: string }[] = [
  { status: "NEW", label: "New" },
  { status: "SITE_SURVEY_IN_PROGRESS", label: "Site survey in progress" },
  { status: "SITE_SURVEY_COMPLETED", label: "Site survey completed" },
  { status: "INSTALLATION_IN_PROGRESS", label: "Installation in progress" },
  { status: "INSTALLATION_COMPLETED", label: "Installation completed" },
  { status: "DOCUMENTATION_IN_PROGRESS", label: "Documentation in progress" },
  { status: "DOCUMENTATION_COMPLETED", label: "Documentation completed" },
  { status: "COMPLETED", label: "Completed" },
];

export function projectFunnelLabel(status: ProjectStatus): string {
  if (status === "REJECTED") return "Rejected";
  return PROJECT_STATUS_STEPS.find((s) => s.status === status)?.label ?? status;
}

/** Plain status pill — used wherever a single project's current status is
 * shown inline (table rows, detail-page header). Shows the exact status,
 * not the collapsed funnel stage below — a single project's own row is
 * exactly where that precision belongs. No funnel styling here; the funnel
 * visualization lives one level up, as navigation (see ProjectFunnelNav). */
export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const modifier = status === "REJECTED" ? " rejected" : status === "COMPLETED" ? " completed" : "";
  return <span className={`project-status-badge${modifier}`}>{projectFunnelLabel(status)}</span>;
}

export type ProjectPhase = "SITE_SURVEY" | "INSTALLATION" | "DOCUMENTATION";

/** The three work-order-driven phases, each collapsing its own IN_PROGRESS/
 * COMPLETED pair (see SKIP_STAGE_TRANSITIONS in api/projects.ts, which is
 * symmetric the same way) into one funnel stage. NEW folds into the site
 * survey stage (nothing has happened yet, so it's the start of that phase);
 * COMPLETED folds into documentation (the last active phase before the
 * terminal state) rather than getting its own stage, matching the request
 * to show only these three in the bar. */
export const PROJECT_PHASE_GROUPS: { phase: ProjectPhase; label: string; statuses: ProjectStatus[] }[] = [
  { phase: "SITE_SURVEY", label: "Site survey", statuses: ["NEW", "SITE_SURVEY_IN_PROGRESS", "SITE_SURVEY_COMPLETED"] },
  { phase: "INSTALLATION", label: "Installation", statuses: ["INSTALLATION_IN_PROGRESS", "INSTALLATION_COMPLETED"] },
  {
    phase: "DOCUMENTATION",
    label: "Documentation",
    statuses: ["DOCUMENTATION_IN_PROGRESS", "DOCUMENTATION_COMPLETED", "COMPLETED"],
  },
];

/** Which of the three funnel phases a given status belongs to -- null for
 * REJECTED, which sits outside the funnel entirely. */
export function phaseForStatus(status: ProjectStatus): ProjectPhase | null {
  return PROJECT_PHASE_GROUPS.find((g) => g.statuses.includes(status))?.phase ?? null;
}

/** Top-level, clickable funnel navigation for the projects list: Site
 * survey > Installation > Documentation. Clicking a stage filters the list
 * down to every status within that stage (`onSelect(phase)`, resolved to
 * multiple `status` query params by the caller — see ProjectsPage); "All"
 * clears the filter and shows every project regardless of status (the page
 * passes `all: true` to the list call whenever no stage is selected — see
 * GET .../projects semantics, where an empty status with no `all=true`
 * would otherwise silently exclude terminal projects). "Rejected" sits off
 * to the side as its own tab, since it's a side-exit from the funnel, not a
 * stage within it. */
export type ProjectFunnelSelection = ProjectPhase | "REJECTED" | "";

export function ProjectFunnelNav({
  value,
  onSelect,
}: {
  value: ProjectFunnelSelection;
  onSelect: (selection: ProjectFunnelSelection) => void;
}) {
  return (
    <div className="project-funnel-nav">
      {/* Mobile (≤640px): a single native dropdown instead of a row of
       * separate buttons — see .project-funnel-select / .project-funnel-buttons
       * in ProjectsPage.css for the breakpoint that swaps between the two. */}
      <select
        className="project-funnel-select"
        aria-label="Filter projects by stage"
        value={value}
        onChange={(e) => onSelect(e.target.value as ProjectFunnelSelection)}
      >
        <option value="">All</option>
        {PROJECT_PHASE_GROUPS.map((group) => (
          <option key={group.phase} value={group.phase}>
            {group.label}
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
          {PROJECT_PHASE_GROUPS.map((group) => (
            <button
              key={group.phase}
              type="button"
              className={`project-funnel-chevron${value === group.phase ? " active" : ""}`}
              onClick={() => onSelect(group.phase)}
            >
              {group.label}
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
