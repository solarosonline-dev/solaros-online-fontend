import { apiRequest } from "./client";
import { isEntityAdmin } from "../lib/roles";

export type LeadStatus = "NEW" | "QUOTE_GENERATED" | "QUOTE_ACCEPTED" | "AGREEMENT_GENERATED" | "AGREEMENT_ACCEPTED" | "REJECTED";

export type Lead = {
  lead_id: number;
  name: string;
  mobile: string;
  status: LeadStatus;
  created_at: string;
  project_id: number | null;
  /** Set only by the /agents/leads admin list. */
  created_by_user_id?: number | null;
  created_by_name?: string | null;
  /** Agent-workspace pipeline stage / deal value -- set by admins, read by agents. */
  agent_stage?: string;
  deal_value?: string | null;
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
  /** Latitude of the project site, populated via Map location picker */
  latitude: number | null;
  /** Longitude of the project site, populated via Map location picker */
  longitude: number | null;
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
  /** Entity admins only: the ENTITY_AGENT this lead belongs to (backend validates it). */
  agent_user_id?: number;
  /** Optional map location coordinates */
  latitude?: number;
  /** Optional map location coordinates */
  longitude?: number;
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

/** Which backend lead routes a user reads through:
 *  - "default": back-office /leads (entity admins on a CRM entity)
 *  - "agent": self-scoped /agent/leads -- ENTITY_AGENT, own leads only
 *  - "agents-admin": /agents/leads -- entity admins of an AGENTS entity
 *    without CRM, who can't use /leads (every lead, with its creator) */
export type LeadsAccess = "default" | "agent" | "agents-admin";

export function leadsAccess(user: { roles: string[]; features?: string[] } | null | undefined): LeadsAccess {
  if (!user) return "default";
  if (user.roles.includes("ENTITY_AGENT") && !isEntityAdmin(user.roles)) return "agent";
  // Entity admins of an AGENTS entity read through /agents/leads (every lead + its
  // creator; works without CRM too). CRM-only entities keep the plain /leads.
  if (user.features?.includes("AGENTS") && isEntityAdmin(user.roles)) return "agents-admin";
  return "default";
}

function leadsBase(entityId: number, access?: LeadsAccess | boolean) {
  const mode = access === true ? "agent" : access || "default";
  const seg = mode === "agent" ? "agent/leads" : mode === "agents-admin" ? "agents/leads" : "leads";
  return `/entities/${entityId}/${seg}`;
}

export function listLeads(
  entityId: number,
  params: {
    status?: LeadStatus;
    search?: string;
    page?: number;
    page_size?: number;
    /** Only honoured by the "agents-admin" route: just this user's leads. */
    created_by_user_id?: number;
  } = {},
  agent?: LeadsAccess | boolean,
) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.created_by_user_id) qs.set("created_by_user_id", String(params.created_by_user_id));
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiRequest<LeadList>(`${leadsBase(entityId, agent)}${query ? `?${query}` : ""}`);
}

export function getLead(entityId: number, leadId: number, agent?: LeadsAccess | boolean) {
  return apiRequest<LeadDetail>(`${leadsBase(entityId, agent)}/${leadId}`);
}

export function createLead(entityId: number, data: CreateLeadInput, agent?: LeadsAccess | boolean) {
  return apiRequest<{ lead_id: number; status: LeadStatus; name: string; mobile: string; created_at: string }>(
    leadsBase(entityId, agent),
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

export function extractLeadFromBill(entityId: number, file: File, agent?: LeadsAccess | boolean) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<ExtractedLeadData>(`${leadsBase(entityId, agent)}/extract-bill`, {
    method: "POST",
    body: form,
  });
}

/** Entity admins of an AGENTS entity: set a lead's agent-workspace stage (and
 * optionally its deal value -- omit to keep, null to clear). */
export function updateLeadStage(
  entityId: number,
  leadId: number,
  data: { stage: string; deal_value?: number | null },
) {
  return apiRequest<LeadDetail>(`/entities/${entityId}/agents/leads/${leadId}/stage`, {
    method: "PATCH",
    body: data,
  });
}
