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
  /** Not yet on the live backend (Entity has no contact fields as of this writing) —
   * typed ahead so the quote/agreement document renders them the moment the backend adds them. */
  business_phone?: string | null;
  business_email?: string | null;
};

export function getEntity(entityId: number) {
  return apiRequest<Entity>(`/entities/${entityId}`);
}

export function updateEntity(entityId: number, data: { name?: string; address?: string }) {
  return apiRequest<Entity>(`/entities/${entityId}`, { method: "PATCH", body: data });
}
