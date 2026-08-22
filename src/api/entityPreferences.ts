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
};

export type EntityPreferences = {
  branding: Branding;
  typography: Typography;
  document_customization: DocumentCustomization;
  pricing: Pricing;
  language: string;
  updated_at: string | null;
};

export type PreferenceCategory = "branding" | "typography" | "document_customization" | "pricing" | "language";

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
