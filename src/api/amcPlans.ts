import { apiRequest } from "./client";

export type AmcPlan = {
  amc_id: number;
  entity_id: number;
  name: string;
  inclusion: string[];
  is_active: boolean;
};

export function listAmcPlans(entityId: number, params: { is_active?: boolean } = {}) {
  const qs = new URLSearchParams();
  if (params.is_active != null) qs.set("is_active", String(params.is_active));
  const query = qs.toString();
  return apiRequest<{ items: AmcPlan[] }>(`/entities/${entityId}/amc-plans${query ? `?${query}` : ""}`);
}

export function createAmcPlan(entityId: number, data: { name: string; inclusion: string[] }) {
  return apiRequest<AmcPlan>(`/entities/${entityId}/amc-plans`, { method: "POST", body: data });
}

export function updateAmcPlan(entityId: number, amcId: number, data: { name?: string; inclusion?: string[] }) {
  return apiRequest<AmcPlan>(`/entities/${entityId}/amc-plans/${amcId}`, { method: "PATCH", body: data });
}

export function deactivateAmcPlan(entityId: number, amcId: number) {
  return apiRequest<void>(`/entities/${entityId}/amc-plans/${amcId}`, { method: "DELETE" });
}
