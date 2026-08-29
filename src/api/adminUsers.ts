import { apiRequest } from "./client";

export type AdminUser = {
  user_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  roles: string[];
  state: string;
};

export type AdminUserList = {
  items: AdminUser[];
  page: number;
  page_size: number;
  total: number;
};

export function listAdminUsers(params: { role?: string; state?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.role) qs.set("role", params.role);
  if (params.state) qs.set("state", params.state);
  const query = qs.toString();
  return apiRequest<AdminUserList>(`/admin/users${query ? `?${query}` : ""}`);
}

export function inviteAdminUser(data: { full_name: string; email: string; phone: string; role: string }) {
  return apiRequest<{ user_id: number; state: string }>("/admin/users", { method: "POST", body: data });
}

export function removeAdminUser(userId: number) {
  return apiRequest<void>(`/admin/users/${userId}`, { method: "DELETE" });
}
