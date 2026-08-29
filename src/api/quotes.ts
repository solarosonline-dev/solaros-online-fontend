import { apiRequest } from "./client";
import type { LeadDetail } from "./leads";
import type { AmcInclusionItem } from "./amcPlans";
import type { PaymentScheduleRow } from "./entityPreferences";

type SnapshotAmcPlan = { amc_id: number; name: string; rate_per_kw: string | null; inclusion: AmcInclusionItem[] };

/** Frozen at acceptance time (see backend's mark_quote_accepted) -- the AMC
 * plan(s) + payment schedule that were in effect the moment this quote was
 * accepted. Null until then; not-yet-accepted quotes keep resolving these
 * settings live via separate calls (listAmcPlans/getEntityPreferences). */
export type QuoteSettingsSnapshot = {
  amc: SnapshotAmcPlan | null;
  amc_post5_plans: SnapshotAmcPlan[];
  payment_schedule: PaymentScheduleRow[];
};

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
  quote_number: string;
  status: QuoteStatus;
  /** Decimal, serialized as a string by the backend. */
  total_amount: string;
  created_at: string;
};

export type QuoteDetail = {
  quote_id: number;
  quote_number: string;
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
  self_funding_amount: string | null;
  notes: string | null;
  terms: string[] | null;
  components: QuoteComponentRow[] | null;
  components_enabled: boolean | null;
  components_pricing_enabled: boolean | null;
  /** Present (non-null) once the quote is ACCEPTED -- see
   * QuoteSettingsSnapshot. */
  settings_snapshot: QuoteSettingsSnapshot | null;
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
  self_funding_amount?: number;
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

export function getQuote(entityId: number, leadId: number, quoteId: number) {
  return apiRequest<QuoteDetail>(`/entities/${entityId}/leads/${leadId}/quotes/${quoteId}`);
}

export function createQuote(entityId: number, leadId: number, data: QuoteInput) {
  return apiRequest<{ quote_id: number; quote_number: string; lead_id: number; status: QuoteStatus; created_at: string }>(
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
  /** Sourced from the quote's settings_snapshot once ACCEPTED, otherwise
   * live-resolved from Entity Preferences -- see the backend's
   * get_public_quote. Prefer this over a separate branding fetch so an
   * accepted quote can't be shown a since-edited payment schedule. */
  payment_schedule?: PaymentScheduleRow[];
  site_images?: { image_id: number; url: string; file_name: string }[];
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
