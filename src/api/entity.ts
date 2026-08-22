import { apiRequest } from "./client";

export type Entity = {
  entity_id: number;
  type: string;
  name: string;
  gstno: string;
  state: string;
  address: string;
  slug: string;
  created_at: string;
  business_phone: string | null;
  business_email: string | null;
};

export function getEntity(entityId: number) {
  return apiRequest<Entity>(`/entities/${entityId}`);
}

export function updateEntity(
  entityId: number,
  data: { name?: string; address?: string; business_phone?: string; business_email?: string },
) {
  return apiRequest<Entity>(`/entities/${entityId}`, { method: "PATCH", body: data });
}
