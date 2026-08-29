import { apiRequest } from "./client";

export type EntityUser = {
  user_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  roles: string[];
  state: string;
};

export type EntityUserList = {
  items: EntityUser[];
  page: number;
  page_size: number;
  total: number;
};

export function listEntityUsers(entityId: number, params: { role?: string; state?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.role) qs.set("role", params.role);
  if (params.state) qs.set("state", params.state);
  const query = qs.toString();
  return apiRequest<EntityUserList>(`/entities/${entityId}/users${query ? `?${query}` : ""}`);
}

export function inviteEntityUser(
  entityId: number,
  data: { full_name: string; email: string; phone: string; role: string },
) {
  return apiRequest<{ user_id: number; state: string }>(`/entities/${entityId}/users`, {
    method: "POST",
    body: data,
  });
}

export function removeEntityUser(entityId: number, userId: number) {
  return apiRequest<void>(`/entities/${entityId}/users/${userId}`, { method: "DELETE" });
}
