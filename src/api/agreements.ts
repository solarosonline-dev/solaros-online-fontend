import { apiRequest } from "./client";
import type { LeadDetail } from "./leads";
import type { QuoteDetail } from "./quotes";

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
};

export type AgreementInput = {
  terms?: string[];
  amc_id?: number;
  amc_duration_years?: number;
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

export type PublicAgreementResponse = {
  agreement: AgreementDetail;
  quote: QuoteDetail | null;
  lead: LeadDetail;
  entity_id: number;
  entity_name: string;
};

export function getPublicAgreement(token: string) {
  return apiRequest<PublicAgreementResponse>(`/public/agreements/${token}`, { auth: false });
}

export function acceptPublicAgreement(token: string) {
  return apiRequest<{ message: string }>(`/public/agreements/${token}/accept`, { method: "POST", auth: false });
}
