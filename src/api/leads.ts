import { apiRequest } from "./client";

export type LeadStatus = "NEW" | "QUOTE_GENERATED" | "QUOTE_ACCEPTED" | "AGREEMENT_GENERATED" | "AGREEMENT_ACCEPTED" | "REJECTED";

export type Lead = {
  lead_id: number;
  name: string;
  mobile: string;
  status: LeadStatus;
  created_at: string;
};

export type LeadList = {
  items: Lead[];
  page: number;
  page_size: number;
  total: number;
};

export type CreateLeadInput = {
  name: string;
  mobile: string;
  address?: string;
  type?: string;
  email?: string;
  sanctioned_load?: number;
  metertype?: string;
  discom?: string;
  roof_area_sqft?: number;
};

export function listLeads(entityId: number, params: { status?: LeadStatus; search?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  const query = qs.toString();
  return apiRequest<LeadList>(`/entities/${entityId}/leads${query ? `?${query}` : ""}`);
}

export function createLead(entityId: number, data: CreateLeadInput) {
  return apiRequest<{ lead_id: number; status: LeadStatus; name: string; mobile: string; created_at: string }>(
    `/entities/${entityId}/leads`,
    { method: "POST", body: data },
  );
}
