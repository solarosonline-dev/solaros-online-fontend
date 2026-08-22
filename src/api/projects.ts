import { apiRequest } from "./client";

export type ProjectStatus =
  | "NEW"
  | "SITE_SURVEY_IN_PROGRESS"
  | "INSTALLATION_IN_PROGRESS"
  | "INSTALLATION_COMPLETED"
  | "DOCUMENTATION_IN_PROGRESS"
  | "COMPLETED"
  | "REJECTED";

/** Linear chain — the only non-REJECTED move `PATCH .../status` accepts is the immediate next entry. */
const STATUS_CHAIN: ProjectStatus[] = [
  "NEW",
  "SITE_SURVEY_IN_PROGRESS",
  "INSTALLATION_IN_PROGRESS",
  "INSTALLATION_COMPLETED",
  "DOCUMENTATION_IN_PROGRESS",
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

export type ProjectListItem = {
  project_id: number;
  status: ProjectStatus;
  customer_id: number;
  customer_name: string;
  lead_id: number;
  created_at: string;
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
  lead_id: number;
  created_at: string;
  status: ProjectStatus;
};

/** Convenience lookup used from Lead detail once an agreement is accepted; 404s until then. */
export type ProjectForLead = {
  project_id: number;
  status: ProjectStatus;
  created_at: string;
};

export function listProjects(entityId: number, params: { status?: ProjectStatus; all?: boolean } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.all) qs.set("all", "true");
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
