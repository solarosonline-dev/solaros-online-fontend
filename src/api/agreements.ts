import { apiRequest } from "./client";
import type { LeadDetail } from "./leads";
import type { QuoteDetail } from "./quotes";
import type { AmcInclusionItem } from "./amcPlans";
import type { PaymentScheduleRow } from "./entityPreferences";

type SnapshotAmcPlan = { amc_id: number; name: string; rate_per_kw: string | null; inclusion: AmcInclusionItem[] };

/** Frozen at signing time (see backend's mark_agreement_accepted) -- the AMC
 * plan(s) + payment schedule that were in effect the moment this agreement
 * was signed. Null until then; not-yet-signed agreements keep resolving
 * these settings live via separate calls (listAmcPlans/getEntityPreferences). */
export type AgreementSettingsSnapshot = {
  amc: SnapshotAmcPlan | null;
  amc_plans: SnapshotAmcPlan[];
  amc_post5_plans: SnapshotAmcPlan[];
  payment_schedule: PaymentScheduleRow[];
};

export type AgreementStatus = "NEW" | "ACCEPTED" | "REJECTED";

/** One row of the "Equipment — make, model & warranty" table. `label` is
 * one of the fixed component names from EQUIPMENT_ROWS
 * (agreementDocumentCopy.ts) -- admin-entered make/model/warranty per row,
 * not derived from the linked quote. */
export type AgreementEquipmentRow = {
  label: string;
  make: string | null;
  model: string | null;
  warranty_years: number | null;
};

export type AgreementListItem = {
  agreement_id: number;
  agreement_number: string;
  status: AgreementStatus;
  created_at: string;
};

export type AgreementDetail = {
  agreement_id: number;
  agreement_number: string;
  customer_id: number;
  lead_id: number;
  created_at: string;
  status: AgreementStatus;
  signed_at: string | null;
  /** Days from `created_at` this agreement stays valid -- also the TTL used
   * for the share link (see the backend's share_agreement). Null renders
   * as 15 in the document (AgreementDocument's default). */
  validity_days: number | null;
  notes: string | null;
  terms: string[] | null;
  amc_id: number | null;
  amc_duration_years: number | null;
  amc_mode: "included" | "chargeable" | null;
  /** Years 1-5 multi-select, only used when amc_mode is "chargeable" —
   * up to 3 amc_id values. `amc_id` above stays the single-plan pick for
   * "included" mode. */
  amc_plan_ids: number[] | null;
  amc_post5_enabled: boolean | null;
  /** Up to 3 amc_id values. */
  amc_post5_plan_ids: number[] | null;
  signer_name: string | null;
  /** A `data:image/png;base64,...` data URL captured from the signature pad. */
  signature_image: string | null;
  signed_ip: string | null;
  /** Raw S3 key, not a URL — presence means a signed PDF snapshot exists;
   * fetch a short-lived viewing URL via getAgreementPdfUrl. */
  pdf_key: string | null;
  /** Present (non-null) once the agreement is ACCEPTED -- see
   * AgreementSettingsSnapshot. */
  settings_snapshot: AgreementSettingsSnapshot | null;
  equipment_details: AgreementEquipmentRow[] | null;
  /** The public share link -- always created alongside the agreement (see
   * the backend's create_agreement), so null here specifically means the
   * link has expired, not "never shared". */
  share_url: string | null;
  /** Which document wording/layout this agreement renders with -- defaults
   * from the linked quote's `apply_subsidy` on create. "pm_surya_ghar" uses
   * the govt-prescribed PM Surya Ghar Annexure 2 wording
   * (PmSuryaGharAgreementDocument), "standard" the existing marketing-style
   * template (AgreementDocument). */
  document_format: "standard" | "pm_surya_ghar";
  /** The vendor/EPC's own e-signature -- recorded via signAgreementAsVendor,
   * independent of the consumer's acceptance status. Only meaningful for
   * "pm_surya_ghar" agreements, which need both parties' signatures. */
  vendor_signer_name: string | null;
  /** A `data:image/png;base64,...` data URL, same shape as `signature_image`. */
  vendor_signature_image: string | null;
  vendor_signed_at: string | null;
};

export type AgreementInput = {
  validity_days?: number;
  notes?: string;
  terms?: string[];
  amc_id?: number;
  amc_duration_years?: number;
  amc_mode?: "included" | "chargeable";
  amc_plan_ids?: number[];
  amc_post5_enabled?: boolean;
  amc_post5_plan_ids?: number[];
  equipment_details?: AgreementEquipmentRow[];
  /** Which document wording/layout to render this agreement with -- see
   * AgreementDetail.document_format. */
  document_format?: "standard" | "pm_surya_ghar";
  /** Only meaningful on create — see createAgreement. Never sent on update. */
  generation_duration_ms?: number;
};

export function listAgreements(entityId: number, leadId: number) {
  return apiRequest<{ items: AgreementListItem[] }>(`/entities/${entityId}/leads/${leadId}/agreements`);
}

export function getAgreement(entityId: number, leadId: number, agreementId: number) {
  return apiRequest<AgreementDetail>(`/entities/${entityId}/leads/${leadId}/agreements/${agreementId}`);
}

export function createAgreement(entityId: number, leadId: number, data: AgreementInput) {
  return apiRequest<{
    agreement_id: number;
    agreement_number: string;
    lead_id: number;
    customer_id: number;
    status: AgreementStatus;
    created_at: string;
  }>(`/entities/${entityId}/leads/${leadId}/agreements`, { method: "POST", body: data });
}

export function updateAgreement(entityId: number, leadId: number, agreementId: number, data: AgreementInput) {
  return apiRequest<AgreementDetail>(`/entities/${entityId}/leads/${leadId}/agreements/${agreementId}`, {
    method: "PATCH",
    body: data,
  });
}

/** Records the vendor/EPC's own e-signature on an agreement -- independent
 * of the consumer's acceptance status. Used by the admin builder's
 * "Vendor / EPC signature" section on "pm_surya_ghar" agreements, which need
 * both parties' signatures. */
export function signAgreementAsVendor(
  entityId: number,
  leadId: number,
  agreementId: number,
  data: { signerName: string; signatureImage: string },
) {
  return apiRequest<AgreementDetail>(`/entities/${entityId}/leads/${leadId}/agreements/${agreementId}/vendor-sign`, {
    method: "POST",
    body: { signer_name: data.signerName, signature_image: data.signatureImage },
  });
}


/** A short-lived presigned URL for viewing/downloading the signed PDF
 * snapshot — 404s (via ApiError) until one has been uploaded. */
export function getAgreementPdfUrl(entityId: number, leadId: number, agreementId: number) {
  return apiRequest<{ pdf_url: string }>(`/entities/${entityId}/leads/${leadId}/agreements/${agreementId}/pdf`);
}

export type PublicAgreementResponse = {
  agreement: AgreementDetail;
  quote: QuoteDetail | null;
  lead: LeadDetail;
  entity_id: number;
  entity_name: string;
  amc?: { amc_id: number; name: string; rate_per_kw: string | null; inclusion: AmcInclusionItem[] } | null;
  amc_plans?: { amc_id: number; name: string; rate_per_kw: string | null; inclusion: AmcInclusionItem[] }[];
  amc_post5_plans?: { amc_id: number; name: string; rate_per_kw: string | null; inclusion: AmcInclusionItem[] }[];
  /** Sourced from the agreement's settings_snapshot once ACCEPTED, otherwise
   * live-resolved from Entity Preferences -- see the backend's
   * get_public_agreement. Prefer this over a separate branding fetch so a
   * signed agreement can't be shown a since-edited payment schedule. */
  payment_schedule?: PaymentScheduleRow[];
};

export function getPublicAgreement(token: string) {
  return apiRequest<PublicAgreementResponse>(`/public/agreements/${token}`, { auth: false });
}

/** Signs & accepts an agreement in one step — a drawn signature (PNG data
 * URL) plus the name it was signed under, no OTP. The backend captures the
 * requesting IP itself. */
export function signPublicAgreement(token: string, data: { signerName: string; signatureImage: string }) {
  return apiRequest<{ message: string }>(`/public/agreements/${token}/accept`, {
    method: "POST",
    auth: false,
    body: { signer_name: data.signerName, signature_image: data.signatureImage },
  });
}

/** Uploads the PDF snapshot captured client-side right after a successful
 * sign (see capturePdf.ts) — a separate call from signPublicAgreement so a
 * failure here never jeopardizes the (already-recorded) acceptance itself. */
export function uploadAgreementPdf(token: string, pdf: Blob) {
  const form = new FormData();
  form.append("file", pdf, "agreement.pdf");
  return apiRequest<{ message: string; pdf_key: string }>(`/public/agreements/${token}/pdf`, {
    method: "POST",
    auth: false,
    body: form,
  });
}
