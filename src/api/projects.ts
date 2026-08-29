import { apiRequest } from "./client";
import type { WorkOrderType } from "./workOrders";

export type ProjectStatus =
  | "NEW"
  | "SITE_SURVEY_IN_PROGRESS"
  | "SITE_SURVEY_COMPLETED"
  | "INSTALLATION_IN_PROGRESS"
  | "INSTALLATION_COMPLETED"
  | "DOCUMENTATION_IN_PROGRESS"
  | "DOCUMENTATION_COMPLETED"
  | "COMPLETED"
  | "REJECTED";

/** Linear chain — the only non-REJECTED move `PATCH .../status` accepts is the immediate next entry. */
const STATUS_CHAIN: ProjectStatus[] = [
  "NEW",
  "SITE_SURVEY_IN_PROGRESS",
  "SITE_SURVEY_COMPLETED",
  "INSTALLATION_IN_PROGRESS",
  "INSTALLATION_COMPLETED",
  "DOCUMENTATION_IN_PROGRESS",
  "DOCUMENTATION_COMPLETED",
  "COMPLETED",
];

export function nextProjectStatus(status: ProjectStatus): ProjectStatus | null {
  const idx = STATUS_CHAIN.indexOf(status);
  if (idx === -1 || idx === STATUS_CHAIN.length - 1) return null;
  return STATUS_CHAIN[idx + 1];
}

export function canRejectProject(status: ProjectStatus): boolean {
  return status !== "COMPLETED" && status !== "REJECTED";
}

// Mirrors SKIP_STAGE_TRANSITIONS on the backend (app/api/v1/endpoints/projects.py)
// -- PATCH .../status also accepts these three jumps in addition to the
// single-step chain above, letting an admin mark a phase done without ever
// creating that phase's WorkOrder. Each jump goes from the *previous*
// phase's COMPLETED checkpoint straight to *this* phase's own COMPLETED
// checkpoint, bypassing only the IN_PROGRESS status in between -- symmetric
// across all three phases now that each has its own COMPLETED status.
export const SKIP_STAGE_TRANSITIONS: {
  from: ProjectStatus;
  to: ProjectStatus;
  workOrderType: WorkOrderType;
  label: string;
}[] = [
  { from: "NEW", to: "SITE_SURVEY_COMPLETED", workOrderType: "SITE_SURVEY", label: "Skip site survey" },
  {
    from: "SITE_SURVEY_COMPLETED",
    to: "INSTALLATION_COMPLETED",
    workOrderType: "INSTALLATION",
    label: "Skip installation",
  },
  {
    from: "INSTALLATION_COMPLETED",
    to: "DOCUMENTATION_COMPLETED",
    workOrderType: "DOCUMENTATION",
    label: "Skip documentation",
  },
];

export function skipStageFor(status: ProjectStatus) {
  return SKIP_STAGE_TRANSITIONS.find((s) => s.from === status) ?? null;
}

// The WorkOrderType creatable against a project at its current phase -- null
// once there's no more work-order-driven phase left (DOCUMENTATION_COMPLETED,
// COMPLETED, REJECTED). Mirrors the phases the backend's
// PROJECT_ADVANCE_ON_WORK_ORDER_CREATION/_COMPLETION maps assume (creating a
// SITE_SURVEY/INSTALLATION/DOCUMENTATION work order is itself what starts
// that phase now, same as completing one is what ends it).
export function currentPhaseWorkOrderType(status: ProjectStatus): WorkOrderType | null {
  switch (status) {
    case "NEW":
    case "SITE_SURVEY_IN_PROGRESS":
      return "SITE_SURVEY";
    case "SITE_SURVEY_COMPLETED":
    case "INSTALLATION_IN_PROGRESS":
      return "INSTALLATION";
    case "INSTALLATION_COMPLETED":
    case "DOCUMENTATION_IN_PROGRESS":
      return "DOCUMENTATION";
    default:
      return null;
  }
}

export type ProjectListItem = {
  project_id: number;
  status: ProjectStatus;
  customer_id: number;
  customer_name: string;
  customer_mobile: string;
  customer_email: string | null;
  lead_id: number;
  created_at: string;
  completed_at: string | null;
};

export type ProjectList = {
  items: ProjectListItem[];
  page: number;
  page_size: number;
  total: number;
};

export type ProjectDetail = {
  project_id: number;
  entity_id: number;
  customer_id: number;
  customer_name: string;
  customer_mobile: string;
  customer_email: string | null;
  lead_id: number;
  created_at: string;
  status: ProjectStatus;
  completed_at: string | null;
};

/** Convenience lookup used from Lead detail once an agreement is accepted; 404s until then. */
export type ProjectForLead = {
  project_id: number;
  status: ProjectStatus;
  created_at: string;
};

export function listProjects(
  entityId: number,
  params: { status?: ProjectStatus | ProjectStatus[]; all?: boolean; page?: number; page_size?: number } = {},
) {
  const qs = new URLSearchParams();
  if (params.status) {
    for (const s of Array.isArray(params.status) ? params.status : [params.status]) qs.append("status", s);
  }
  if (params.all) qs.set("all", "true");
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiRequest<ProjectList>(`/entities/${entityId}/projects${query ? `?${query}` : ""}`);
}

export function getProject(entityId: number, projectId: number) {
  return apiRequest<ProjectDetail>(`/entities/${entityId}/projects/${projectId}`);
}

export function updateProjectStatus(entityId: number, projectId: number, status: ProjectStatus) {
  return apiRequest<{ project_id: number; status: ProjectStatus }>(
    `/entities/${entityId}/projects/${projectId}/status`,
    { method: "PATCH", body: { status } },
  );
}

export function getProjectForLead(entityId: number, leadId: number) {
  return apiRequest<ProjectForLead>(`/entities/${entityId}/leads/${leadId}/project`);
}
