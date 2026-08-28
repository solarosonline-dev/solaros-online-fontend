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
  // ISO 3166-1 alpha-2 / ISO 4217, resolved server-side from the entity's
  // country (see app.core.countries on the backend). Present on every
  // entity as of the country/currency phase -- default to "IN"/"INR" at
  // call sites for entities fetched before that type gained these fields
  // isn't needed since the backend backfills both via server_default.
  country: string;
  currency: string;
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
