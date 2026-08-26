import { apiRequest } from "./client";

export type Branding = {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  logo_url: string | null;
  company_tagline: string;
  footer_tag: string;
};

export type Typography = {
  h1_font_size: string;
  h2_font_size: string;
  h3_font_size: string;
  body_font_size: string;
  small_font_size: string;
};

export type DocumentCustomization = {
  quote_notes: string[];
  agreement_notes: string[];
  custom_terms_and_conditions: string[];
};

export type Pricing = {
  default_price_per_watt: number;
  default_gst_rate: number;
};

export type ComponentDefault = {
  particular: string;
  tax_percent: number;
  warranty_years: number | null;
  specification: string | null;
};

export type Components = {
  items: ComponentDefault[];
};

export type PaymentScheduleRow = {
  label: string;
  percent: number;
  description: string;
};

export type PaymentSchedule = {
  rows: PaymentScheduleRow[];
};

/** Mirrors the backend's DEFAULT_PREFERENCES["payment_schedule"] — used as a
 * fallback before preferences/branding have loaded, so the quote document
 * never renders with an empty payment section. */
export const DEFAULT_PAYMENT_SCHEDULE: PaymentScheduleRow[] = [
  { label: "on signing", percent: 30, description: "Confirms PO and locks panel allocation" },
  { label: "before material dispatch", percent: 60, description: "~Day 5 once design + paperwork are signed off" },
  { label: "on commissioning", percent: 10, description: "Day 7–10 — net-meter live, generating units" },
];

export type EntityPreferences = {
  branding: Branding;
  typography: Typography;
  document_customization: DocumentCustomization;
  pricing: Pricing;
  components: Components;
  payment_schedule: PaymentSchedule;
  language: string;
  /** EPC-admin escape hatch: when true, the public quote-acceptance modal
   * skips the emailed-OTP step and accepts on consent alone — e.g. while
   * the transactional email provider is down. */
  skip_quote_otp: boolean;
  updated_at: string | null;
};

export type PreferenceCategory =
  | "branding"
  | "typography"
  | "document_customization"
  | "pricing"
  | "components"
  | "payment_schedule"
  | "language";

export function getEntityPreferences(entityId: number) {
  return apiRequest<EntityPreferences>(`/entities/${entityId}/preferences`);
}

export function updateEntityPreferences(entityId: number, patch: Partial<EntityPreferences>) {
  return apiRequest<EntityPreferences>(`/entities/${entityId}/preferences`, {
    method: "PATCH",
    body: patch,
  });
}

export function resetPreferenceCategory(entityId: number, category: PreferenceCategory) {
  return apiRequest<EntityPreferences>(`/entities/${entityId}/preferences/${category}`, {
    method: "DELETE",
  });
}

/** Response shape of the public, unauthenticated branding endpoint used by share-link pages. */
export type PublicBranding = {
  entity_name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  logo_url: string | null;
  company_tagline: string;
  footer_tag: string;
  h1_font_size: string;
  h2_font_size: string;
  h3_font_size: string;
  body_font_size: string;
  small_font_size: string;
  gstno: string;
  address: string | null;
  business_phone: string | null;
  business_email: string | null;
  skip_quote_otp: boolean;
  payment_schedule: PaymentScheduleRow[];
};

export function getPublicEntityBranding(entityId: number) {
  return apiRequest<PublicBranding>(`/public/entities/${entityId}/branding`, { auth: false });
}

export function uploadBrandingLogo(entityId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<{ logo_url: string }>(`/entities/${entityId}/preferences/branding/logo`, {
    method: "POST",
    body: form,
  });
}
