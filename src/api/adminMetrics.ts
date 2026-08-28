import { apiRequest } from "./client";

export type SegmentCapacity = {
  count: number;
  avg_capacity_kw: number | null;
};

export type LeadMetrics = {
  leads_count: number;
  lead_entry_p50_ms: number | null;
  lead_entry_p95_ms: number | null;
};

export type QuoteMetrics = {
  quotes_count: number;
  quotes_accepted_count: number;
  quotes_rejected_count: number;
  quotes_in_progress_count: number;
  quotes_total_amount: number;
  quote_generation_p50_ms: number | null;
  quote_generation_p95_ms: number | null;
  quote_acceptance_rate: number | null;
  total_capacity_kw: number;
  accepted_capacity_kw: number;
  accepted_amount_per_kw: number | null;
  residential: SegmentCapacity;
  commercial: SegmentCapacity;
  industrial: SegmentCapacity;
  other: SegmentCapacity;
};

export type AgreementMetrics = {
  agreements_count: number;
  agreements_signed_count: number;
  agreement_generation_p50_ms: number | null;
  agreement_generation_p95_ms: number | null;
};

export type ProjectMetrics = {
  projects_started_count: number;
  projects_active_count: number;
  projects_completed_count: number;
  avg_project_completion_days: number | null;
  total_capacity_kw: number;
  completed_capacity_kw: number;
};

export type WorkOrderMetrics = {
  workorders_generated_count: number;
  workorders_completed_count: number;
};

export type AdminMetrics = {
  leads: LeadMetrics;
  quotes: QuoteMetrics;
  agreements: AgreementMetrics;
  projects: ProjectMetrics;
  workorders: WorkOrderMetrics;
};

export type AdminEntityMetrics = AdminMetrics & {
  entity_id: number;
  entity_name: string;
};

export type AdminEntityMetricsListResponse = {
  items: AdminEntityMetrics[];
};

export function getAdminMetrics() {
  return apiRequest<AdminMetrics>("/admin/metrics");
}

export function listAdminEntityMetrics() {
  return apiRequest<AdminEntityMetricsListResponse>("/admin/metrics/entities");
}

// Self-service — any ENTITY-scope user (e.g. ENTITY_ADMIN) fetching their own
// EPC's metrics. Scoped server-side to the caller's entity_id; there's no
// entity_id param to pass or spoof.
export function getMyEntityMetrics() {
  return apiRequest<AdminEntityMetrics>("/admin/metrics/mine");
}
