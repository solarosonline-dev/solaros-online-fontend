import { apiRequest } from "./client";

export type KycStatus = "NOT_SUBMITTED" | "SUBMITTED" | "VERIFIED" | "REJECTED";

export type Kyc = {
  entity_id: number;
  status: KycStatus;
  legal_name: string | null;
  pan: string | null;
  bank_account_name: string | null;
  // The full number is never returned to the owning entity.
  bank_account_number_masked: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  reject_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

export type SubmitKycInput = {
  legal_name: string;
  pan: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  upi_id: string | null;
};

export function getMyKyc(entityId: number) {
  return apiRequest<Kyc>(`/entities/${entityId}/mp/kyc`);
}

export function submitMyKyc(entityId: number, data: SubmitKycInput) {
  return apiRequest<Kyc>(`/entities/${entityId}/mp/kyc`, { method: "PUT", body: data });
}

export type AdminKyc = Kyc & {
  entity_name: string;
  entity_kind: string;
  gstno: string;
  bank_account_number: string | null;
};

export type AdminKycList = { items: AdminKyc[]; page: number; page_size: number; total: number };

export function listKyc(params: { status?: KycStatus; page?: number; page_size?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const q = qs.toString();
  return apiRequest<AdminKycList>(`/admin/mp/kyc${q ? `?${q}` : ""}`);
}

export function verifyKyc(entityId: number) {
  return apiRequest<AdminKyc>(`/admin/mp/kyc/${entityId}/verify`, { method: "POST" });
}

export function rejectKyc(entityId: number, reason: string) {
  return apiRequest<AdminKyc>(`/admin/mp/kyc/${entityId}/reject`, { method: "POST", body: { reason } });
}
