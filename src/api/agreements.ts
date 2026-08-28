import { apiRequest } from "./client";
import type { LeadDetail } from "./leads";
import type { QuoteDetail } from "./quotes";
import type { AmcInclusionItem } from "./amcPlans";

export type AgreementStatus = "NEW" | "ACCEPTED" | "REJECTED";

export type AgreementListItem = {
  agreement_id: number;
  status: AgreementStatus;
  created_at: string;
};

export type AgreementDetail = {
  agreement_id: number;
  customer_id: number;
  lead_id: number;
  created_at: string;
  status: AgreementStatus;
  signed_at: string | null;
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
};

export type AgreementInput = {
  terms?: string[];
  amc_id?: number;
  amc_duration_years?: number;
  amc_mode?: "included" | "chargeable";
  amc_plan_ids?: number[];
  amc_post5_enabled?: boolean;
  amc_post5_plan_ids?: number[];
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
  return apiRequest<{ agreement_id: number; lead_id: number; customer_id: number; status: AgreementStatus; created_at: string }>(
    `/entities/${entityId}/leads/${leadId}/agreements`,
    { method: "POST", body: data },
  );
}

export function updateAgreement(entityId: number, leadId: number, agreementId: number, data: AgreementInput) {
  return apiRequest<AgreementDetail>(`/entities/${entityId}/leads/${leadId}/agreements/${agreementId}`, {
    method: "PATCH",
    body: data,
  });
}

export function shareAgreement(entityId: number, leadId: number, agreementId: number) {
  return apiRequest<{ share_url: string }>(`/entities/${entityId}/leads/${leadId}/agreements/${agreementId}/share`, {
    method: "POST",
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
