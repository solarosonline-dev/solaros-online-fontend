import { apiRequest } from "./client";
import type { LeadDetail, LeadStatus } from "./leads";
import type { AmcInclusionItem } from "./amcPlans";

export type QuoteStatus = "GENERATED" | "ACCEPTED" | "REJECTED";

export type QuoteComponentRow = {
  particular: string;
  qty: number | null;
  price: number | null;
  tax_percent: number | null;
  warranty_years: number | null;
  specification: string | null;
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
  tax_rate: number | null;
  daily_yield: number | null;
  tariff: number | null;
  apply_subsidy: boolean | null;
  subsidy_amount: string | null;
  amc_id: number | null;
  amc_duration_years: number | null;
  amc_mode: "included" | "chargeable" | null;
  amc_post5_enabled: boolean | null;
  amc_post5_plan_ids: number[] | null;
  loan_enabled: boolean | null;
  loan_amount: string | null;
  loan_rate_percent: string | null;
  loan_tenure_years: number | null;
  notes: string | null;
  terms: string[] | null;
  components: QuoteComponentRow[] | null;
  components_enabled: boolean | null;
  components_pricing_enabled: boolean | null;
};

export type QuoteInput = {
  total_amount: number;
  capacity?: number;
  panel_make?: string;
  inverter_make?: string;
  panel_type?: string;
  validity_days?: number;
  price_per_watt?: number;
  tax_rate?: number;
  daily_yield?: number;
  tariff?: number;
  apply_subsidy?: boolean;
  subsidy_amount?: number;
  amc_id?: number;
  amc_duration_years?: number;
  amc_mode?: "included" | "chargeable";
  amc_post5_enabled?: boolean;
  amc_post5_plan_ids?: number[];
  loan_enabled?: boolean;
  loan_amount?: number;
  loan_rate_percent?: number;
  loan_tenure_years?: number;
  notes?: string;
  terms?: string[];
  components?: QuoteComponentRow[];
  components_enabled?: boolean;
  components_pricing_enabled?: boolean;
  /** Only meaningful on create — see createQuote. Never sent on update. */
  generation_duration_ms?: number;
};

export function listQuotes(entityId: number, leadId: number) {
  return apiRequest<{ items: QuoteListItem[] }>(`/entities/${entityId}/leads/${leadId}/quotes`);
}

export type EntityQuoteListItem = QuoteListItem & {
  lead_id: number;
  lead_name: string;
  lead_mobile: string;
  /** Lets the frontend show a "Generate agreement"/"View agreement" action
   * on each row without a second query -- QUOTE_ACCEPTED means eligible to
   * generate, AGREEMENT_GENERATED/AGREEMENT_ACCEPTED means one already
   * exists, anything else means no action. */
  lead_status: LeadStatus;
  /** Derived server-side, not a real Quote column -- null unless status is
   * ACCEPTED (see the backend's ApiSpecs.md note on Quote.updated_at). */
  accepted_at: string | null;
};

export type EntityQuoteList = {
  items: EntityQuoteListItem[];
  page: number;
  page_size: number;
  total: number;
};

// Every quote across every lead in the entity, one page at a time -- backs
// the "All quotes" table on QuotesPage, instead of listing every lead and
// fetching that lead's quotes one request at a time.
export function listEntityQuotes(entityId: number, params: { page?: number; page_size?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiRequest<EntityQuoteList>(`/entities/${entityId}/quotes${query ? `?${query}` : ""}`);
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
  amc?: { amc_id: number; name: string; rate_per_kw: string | null; inclusion: AmcInclusionItem[] } | null;
  amc_post5_plans?: { amc_id: number; name: string; rate_per_kw: string | null; inclusion: AmcInclusionItem[] }[];
};

export function getPublicQuote(token: string) {
  return apiRequest<PublicQuoteResponse>(`/public/quotes/${token}`, { auth: false });
}

/** Step 1 of accepting a quote — emails a 6-digit code to the lead's own
 * address so a forwarded/leaked link alone can't accept on their behalf.
 * `masked_email` is for display ("code sent to j***@e***.com"). */
export function requestQuoteOtp(token: string) {
  return apiRequest<{ message: string; masked_email: string }>(`/public/quotes/${token}/otp/request`, {
    method: "POST",
    auth: false,
  });
}

/** Step 2 — verifying the emailed code is what actually flips the quote to
 * ACCEPTED. */
export function verifyQuoteOtp(token: string, otp: string) {
  return apiRequest<{ message: string }>(`/public/quotes/${token}/otp/verify`, {
    method: "POST",
    auth: false,
    body: { otp },
  });
}

/** Consent-only acceptance — only reachable when the entity's branding
 * response says `skip_quote_otp` is on (EPC admin's escape hatch for when
 * the email provider is down). The backend re-checks the same flag, so this
 * can't be used to bypass OTP when it's required. */
export function acceptQuoteWithoutOtp(token: string) {
  return apiRequest<{ message: string }>(`/public/quotes/${token}/accept`, {
    method: "POST",
    auth: false,
  });
}
