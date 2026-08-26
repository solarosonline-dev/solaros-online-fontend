import { apiRequest } from "./client";

export type WorkOrderType = "SITE_SURVEY" | "INSTALLATION" | "AMC_SERVICE";
export type WorkOrderStatus = "NEW" | "IN_PROGRESS" | "COMPLETED";

export function nextWorkOrderStatus(status: WorkOrderStatus): WorkOrderStatus | null {
  if (status === "NEW") return "IN_PROGRESS";
  if (status === "IN_PROGRESS") return "COMPLETED";
  return null;
}

export type Assignee = {
  assignee_type: "USER" | "TEAM";
  assignee_id: number;
  name: string;
};

export type WorkOrderListItem = {
  work_order_id: number;
  type: WorkOrderType;
  status: WorkOrderStatus;
  opened_at: string;
  closed_at: string | null;
  assignee: Assignee | null;
};

export type WorkOrderDetail = WorkOrderListItem & {
  lead_id: number;
  project_id: number | null;
  external_ticket_id: string | null;
  notes: string | null;
};

export type CreateWorkOrderInput = {
  type: WorkOrderType;
  notes?: string;
};

export function listProjectWorkOrders(
  entityId: number,
  projectId: number,
  params: { type?: WorkOrderType; status?: WorkOrderStatus } = {},
) {
  const qs = new URLSearchParams();
  if (params.type) qs.set("type", params.type);
  if (params.status) qs.set("status", params.status);
  const query = qs.toString();
  return apiRequest<{ items: WorkOrderListItem[] }>(
    `/entities/${entityId}/projects/${projectId}/work-orders${query ? `?${query}` : ""}`,
  );
}

export function createProjectWorkOrder(entityId: number, projectId: number, data: CreateWorkOrderInput) {
  return apiRequest<{
    work_order_id: number;
    project_id: number | null;
    lead_id: number;
    type: WorkOrderType;
    status: WorkOrderStatus;
    opened_at: string;
  }>(`/entities/${entityId}/projects/${projectId}/work-orders`, { method: "POST", body: data });
}

export function getWorkOrder(entityId: number, workOrderId: number) {
  return apiRequest<WorkOrderDetail>(`/entities/${entityId}/work-orders/${workOrderId}`);
}

export function updateWorkOrderStatus(entityId: number, workOrderId: number, status: WorkOrderStatus) {
  return apiRequest<{
    work_order_id: number;
    status: WorkOrderStatus;
    closed_at: string | null;
    project_status: string | null;
  }>(`/entities/${entityId}/work-orders/${workOrderId}/status`, { method: "PATCH", body: { status } });
}

export function assignWorkOrder(
  entityId: number,
  workOrderId: number,
  assigneeType: "USER" | "TEAM",
  assigneeId: number,
) {
  return apiRequest<{ assignment_id: number; work_order_id: number; assignee_type: "USER" | "TEAM"; assignee_id: number; created_at: string }>(
    `/entities/${entityId}/work-orders/${workOrderId}/assignment`,
    { method: "POST", body: { assignee_type: assigneeType, assignee_id: assigneeId } },
  );
}

export function deleteWorkOrder(entityId: number, workOrderId: number) {
  return apiRequest<void>(`/entities/${entityId}/work-orders/${workOrderId}`, { method: "DELETE" });
}
