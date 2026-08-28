import { apiRequest } from "./client";

export type LeadStatus = "NEW" | "QUOTE_GENERATED" | "QUOTE_ACCEPTED" | "AGREEMENT_GENERATED" | "AGREEMENT_ACCEPTED" | "REJECTED";

export type Lead = {
  lead_id: number;
  name: string;
  mobile: string;
  status: LeadStatus;
  created_at: string;
};

export type LeadDetail = Lead & {
  address: string | null;
  type: string | null;
  email: string | null;
  sanctioned_load: number | null;
  metertype: string | null;
  state: string | null;
  discom: string | null;
  roof_area_sqft: number | null;
  ca_number: string | null;
  avg_monthly_bill: string | null;
  avg_monthly_units: number | null;
  requirement: string | null;
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
  state?: string;
  discom?: string;
  roof_area_sqft?: number;
  ca_number?: string;
  avg_monthly_bill?: number;
  avg_monthly_units?: number;
  requirement?: string;
  entry_duration_ms?: number;
};

export type UpdateLeadInput = Partial<CreateLeadInput>;

/** Best-effort fields parsed from an uploaded electricity-bill PDF by the
 * backend's `extract-bill` endpoint — every field is nullable since
 * extraction may fail to find any given value. */
export type ExtractedLeadData = {
  name: string | null;
  mobile: string | null;
  address: string | null;
  type: string | null;
  email: string | null;
  sanctioned_load: number | null;
  metertype: string | null;
  state: string | null;
  discom: string | null;
  roof_area_sqft: number | null;
  ca_number: string | null;
  avg_monthly_bill: string | null;
  avg_monthly_units: number | null;
  requirement: string | null;
};

/** Manual status transitions only — QUOTE_GENERATED/AGREEMENT_GENERATED happen as a side effect of quote/agreement creation, never directly. */
export type ManualLeadStatus = "REJECTED" | "QUOTE_ACCEPTED" | "AGREEMENT_ACCEPTED";

export function listLeads(entityId: number, params: { status?: LeadStatus; search?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  const query = qs.toString();
  return apiRequest<LeadList>(`/entities/${entityId}/leads${query ? `?${query}` : ""}`);
}

export function getLead(entityId: number, leadId: number) {
  return apiRequest<LeadDetail>(`/entities/${entityId}/leads/${leadId}`);
}

export function createLead(entityId: number, data: CreateLeadInput) {
  return apiRequest<{ lead_id: number; status: LeadStatus; name: string; mobile: string; created_at: string }>(
    `/entities/${entityId}/leads`,
    { method: "POST", body: data },
  );
}

export function updateLead(entityId: number, leadId: number, data: UpdateLeadInput) {
  return apiRequest<LeadDetail>(`/entities/${entityId}/leads/${leadId}`, { method: "PATCH", body: data });
}

export function updateLeadStatus(entityId: number, leadId: number, status: ManualLeadStatus) {
  return apiRequest<{ lead_id: number; status: LeadStatus }>(`/entities/${entityId}/leads/${leadId}/status`, {
    method: "PATCH",
    body: { status },
  });
}

export function extractLeadFromBill(entityId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<ExtractedLeadData>(`/entities/${entityId}/leads/extract-bill`, {
    method: "POST",
    body: form,
  });
}
