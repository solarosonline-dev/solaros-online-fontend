import { apiRequest } from "./client";
import type { AmcFrequency } from "./amcPlans";
import type { Assignee, WorkOrderStatus } from "./workOrders";

export type AmcScheduleStatus = "PENDING" | "COMPLETED";

export type AmcScheduleItem = {
  schedule_id: number;
  inclusion_text: string;
  frequency: AmcFrequency;
  /** ISO date (no time component). */
  schedule_date: string;
  status: AmcScheduleStatus;
  completed_at: string | null;
  // Set once this occurrence has been converted into a dispatchable work
  // order (see generateAmcScheduleWorkOrder) -- null until then.
  work_order_id: number | null;
  work_order_status: WorkOrderStatus | null;
  // Current assignee of that work order -- always null when work_order_id
  // is null. Lets callers show "Assigned to X" and offer reassignment
  // without a separate work-order fetch per row.
  assignee: Assignee | null;
};

export type AmcScheduleListResponse = {
  items: AmcScheduleItem[];
};

// Cross-project variant used by the Projects list page -- same fields as
// AmcScheduleItem plus which project/customer each pending occurrence
// belongs to.
export type AmcScheduleDueItem = AmcScheduleItem & {
  project_id: number;
  customer_name: string;
};

export type AmcScheduleDueListResponse = {
  items: AmcScheduleDueItem[];
};

export function listAmcSchedule(entityId: number, projectId: number) {
  return apiRequest<AmcScheduleListResponse>(`/entities/${entityId}/projects/${projectId}/amc-schedule`);
}

export function listAmcScheduleDue(entityId: number) {
  return apiRequest<AmcScheduleDueListResponse>(`/entities/${entityId}/amc-schedule/due`);
}

export function generateAmcSchedule(
  entityId: number,
  projectId: number,
  data: { start_date?: string; regenerate?: boolean } = {},
) {
  return apiRequest<AmcScheduleListResponse>(`/entities/${entityId}/projects/${projectId}/amc-schedule`, {
    method: "POST",
    body: data,
  });
}

export function updateAmcScheduleItemStatus(entityId: number, scheduleId: number, status: "COMPLETED") {
  return apiRequest<AmcScheduleItem>(`/entities/${entityId}/amc-schedule/${scheduleId}/status`, {
    method: "PATCH",
    body: { status },
  });
}

export function generateAmcScheduleWorkOrder(entityId: number, scheduleId: number) {
  return apiRequest<{ schedule_id: number; work_order_id: number; work_order_status: WorkOrderStatus }>(
    `/entities/${entityId}/amc-schedule/${scheduleId}/work-order`,
    { method: "POST" },
  );
}

export function shareAmcSchedule(entityId: number, projectId: number) {
  return apiRequest<{ share_url: string }>(`/entities/${entityId}/projects/${projectId}/amc-schedule/share`, {
    method: "POST",
  });
}

export type PublicAmcSchedule = {
  entity_id: number;
  entity_name: string;
  customer_name: string;
  project_id: number;
  amc_plan_name: string;
  amc_duration_years: number | null;
  items: AmcScheduleItem[];
};

export function getPublicAmcSchedule(token: string) {
  return apiRequest<PublicAmcSchedule>(`/public/amc-schedule/${token}`, { auth: false });
}
