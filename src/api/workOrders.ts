import { apiRequest } from "./client";

export type WorkOrderType = "SITE_SURVEY" | "INSTALLATION" | "DOCUMENTATION" | "AMC_SERVICE";
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
  /** Only ever populated for assignee_type === "USER" -- both null for a TEAM. */
  email: string | null;
  phone: string | null;
};

export type LeadSummary = {
  lead_id: number;
  name: string;
  mobile: string;
  email: string | null;
  address: string | null;
  status: string;
};

export type WorkOrderListItem = {
  work_order_id: number;
  type: WorkOrderType;
  status: WorkOrderStatus;
  opened_at: string;
  closed_at: string | null;
  assignee: Assignee | null;
  lead: LeadSummary;
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

export type ProjectSummary = {
  project_id: number;
  status: string;
  customer_id: number;
};

// The field-role-facing shape returned by /work-orders/mine and
// /users/{userId}/work-orders -- `lead` is inherited from WorkOrderListItem;
// `project` is set only when the work order was created through a Project.
export type AssignedWorkOrderListItem = WorkOrderListItem & {
  project: ProjectSummary | null;
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
    // Set whenever creating this work order also advanced the project's
    // status (see PROJECT_ADVANCE_ON_WORK_ORDER_CREATION on the backend) --
    // reflects current state either way, not just when it changed.
    project_status: string | null;
  }>(`/entities/${entityId}/projects/${projectId}/work-orders`, { method: "POST", body: data });
}

// Created directly against a Lead, before a Project exists (e.g. an early
// site survey ahead of quoting/agreement) -- project_id stays null.
export function listLeadWorkOrders(entityId: number, leadId: number) {
  return apiRequest<{ items: WorkOrderListItem[] }>(`/entities/${entityId}/leads/${leadId}/work-orders`);
}

export function createLeadWorkOrder(entityId: number, leadId: number, data: CreateWorkOrderInput) {
  return apiRequest<{
    work_order_id: number;
    project_id: number | null;
    lead_id: number;
    type: WorkOrderType;
    status: WorkOrderStatus;
    opened_at: string;
  }>(`/entities/${entityId}/leads/${leadId}/work-orders`, { method: "POST", body: data });
}

// Open to any entity-scope role -- self-scoped to the caller's own user_id,
// so there's nothing to authorize beyond "your own assignments".
export function listMyWorkOrders(entityId: number, params: { status?: WorkOrderStatus } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  const query = qs.toString();
  return apiRequest<{ items: AssignedWorkOrderListItem[] }>(
    `/entities/${entityId}/work-orders/mine${query ? `?${query}` : ""}`,
  );
}

// Entity-admin only -- e.g. a manager checking a specific worker's queue.
export function listUserWorkOrders(entityId: number, userId: number, params: { status?: WorkOrderStatus } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  const query = qs.toString();
  return apiRequest<{ items: AssignedWorkOrderListItem[] }>(
    `/entities/${entityId}/users/${userId}/work-orders${query ? `?${query}` : ""}`,
  );
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

// Optional documents (photos, signed forms, etc) attached to a work order --
// independent of status, up to 5 per work order, 5 MB each, PDF/JPEG/PNG/
// WEBP only (all enforced server-side; see MAX_DOCUMENTS_PER_WORK_ORDER /
// MAX_DOCUMENT_SIZE_BYTES / ALLOWED_DOCUMENT_TYPES in the backend). Same
// access as the work order itself: an entity admin, or its current
// assignee.
export const MAX_WORK_ORDER_DOCUMENTS = 5;
export const MAX_WORK_ORDER_DOCUMENT_SIZE_BYTES = 5 * 1024 * 1024;

export type WorkOrderDocument = {
  document_id: number;
  file_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_by_user_id: number;
  uploaded_by_name: string;
  created_at: string;
};

export function listWorkOrderDocuments(entityId: number, workOrderId: number) {
  return apiRequest<{ items: WorkOrderDocument[] }>(`/entities/${entityId}/work-orders/${workOrderId}/documents`);
}

export function uploadWorkOrderDocument(entityId: number, workOrderId: number, file: File) {
  const form = new FormData();
  form.append("file", file, file.name);
  return apiRequest<WorkOrderDocument>(`/entities/${entityId}/work-orders/${workOrderId}/documents`, {
    method: "POST",
    body: form,
  });
}

export function getWorkOrderDocumentDownloadUrl(entityId: number, workOrderId: number, documentId: number) {
  return apiRequest<{ download_url: string; file_name: string }>(
    `/entities/${entityId}/work-orders/${workOrderId}/documents/${documentId}`,
  );
}

export function deleteWorkOrderDocument(entityId: number, workOrderId: number, documentId: number) {
  return apiRequest<void>(`/entities/${entityId}/work-orders/${workOrderId}/documents/${documentId}`, {
    method: "DELETE",
  });
}
