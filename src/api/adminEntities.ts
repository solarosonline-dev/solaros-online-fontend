import { apiRequest } from "./client";

export type EntityState = "PENDING_APPROVAL" | "ACTIVE" | "INACTIVE";

export type AdminEntity = {
  entity_id: number;
  name: string;
  type: string;
  gstno: string;
  state: EntityState;
  founder_state: string;
  founder_email: string;
  founder_phone: string;
  created_at: string;
  approved_at: string | null;
};

export type AdminEntityList = {
  items: AdminEntity[];
  page: number;
  page_size: number;
  total: number;
};

export function listEntities(params: { state?: EntityState; page?: number; page_size?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.state) qs.set("state", params.state);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiRequest<AdminEntityList>(`/admin/entities${query ? `?${query}` : ""}`);
}

export function updateEntityState(entityId: number, state: EntityState) {
  return apiRequest<{ entity_id: number; state: EntityState; approved_by: number | null; approved_at: string | null }>(
    `/admin/entities/${entityId}/state`,
    { method: "PATCH", body: { state } },
  );
}
