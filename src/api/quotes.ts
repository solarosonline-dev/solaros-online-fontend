import { apiRequest } from "./client";
import type { LeadDetail } from "./leads";

export type QuoteStatus = "GENERATED" | "ACCEPTED" | "REJECTED";

export type QuoteComponentRow = {
  particular: string;
  qty: number | null;
  price: number | null;
  tax_percent: number | null;
};

export type QuoteListItem = {
  quote_id: number;
  status: QuoteStatus;
  /** Decimal, serialized as a string by the backend. */
  total_amount: string;
  created_at: string;
};

export type QuoteDetail = {
  quote_id: number;
  lead_id: number;
  created_at: string;
  status: QuoteStatus;
  total_amount: string;
  capacity: number | null;
  panel_make: string | null;
  inverter_make: string | null;
  panel_type: string | null;
  validity_days: number | null;
  price_per_watt: number | null;
  gst_rate: number | null;
  daily_yield: number | null;
  tariff: number | null;
  apply_subsidy: boolean | null;
  subsidy_amount: string | null;
  amc_id: number | null;
  amc_duration_years: number | null;
  notes: string | null;
  terms: string[] | null;
  components: QuoteComponentRow[] | null;
  components_enabled: boolean | null;
};

export type QuoteInput = {
  total_amount: number;
  capacity?: number;
  panel_make?: string;
  inverter_make?: string;
  panel_type?: string;
  validity_days?: number;
  price_per_watt?: number;
  gst_rate?: number;
  daily_yield?: number;
  tariff?: number;
  apply_subsidy?: boolean;
  subsidy_amount?: number;
  amc_id?: number;
  amc_duration_years?: number;
  notes?: string;
  terms?: string[];
  components?: QuoteComponentRow[];
  components_enabled?: boolean;
};

export function listQuotes(entityId: number, leadId: number) {
  return apiRequest<{ items: QuoteListItem[] }>(`/entities/${entityId}/leads/${leadId}/quotes`);
}

export function getQuote(entityId: number, leadId: number, quoteId: number) {
  return apiRequest<QuoteDetail>(`/entities/${entityId}/leads/${leadId}/quotes/${quoteId}`);
}

export function createQuote(entityId: number, leadId: number, data: QuoteInput) {
  return apiRequest<{ quote_id: number; lead_id: number; status: QuoteStatus; created_at: string }>(
    `/entities/${entityId}/leads/${leadId}/quotes`,
    { method: "POST", body: data },
  );
}

export function updateQuote(entityId: number, leadId: number, quoteId: number, data: Partial<QuoteInput>) {
  return apiRequest<QuoteDetail>(`/entities/${entityId}/leads/${leadId}/quotes/${quoteId}`, {
    method: "PATCH",
    body: data,
  });
}

export function shareQuote(entityId: number, leadId: number, quoteId: number) {
  return apiRequest<{ share_url: string }>(`/entities/${entityId}/leads/${leadId}/quotes/${quoteId}/share`, {
    method: "POST",
  });
}

export type PublicQuoteResponse = {
  quote: QuoteDetail;
  lead: LeadDetail;
  entity_id: number;
  entity_name: string;
  amc?: { amc_id: number; name: string; rate_per_kw: string | null; inclusion: string[] } | null;
};

export function getPublicQuote(token: string) {
  return apiRequest<PublicQuoteResponse>(`/public/quotes/${token}`, { auth: false });
}

export function acceptPublicQuote(token: string) {
  return apiRequest<{ message: string }>(`/public/quotes/${token}/accept`, { method: "POST", auth: false });
}
