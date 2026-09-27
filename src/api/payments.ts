import { apiRequest } from "./client";

export type PaymentDirection = "INBOUND" | "OUTBOUND";
export type PaymentMethod = "UPI" | "NEFT" | "RTGS" | "IMPS" | "CHEQUE" | "CARD" | "CASH" | "OTHER";
export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface Payment {
  payment_id: number;
  entity_id: number;
  project_id: number | null;
  vendor_id: number | null;
  procurement_id: number | null;
  direction: PaymentDirection;
  amount: number;
  payment_method: PaymentMethod;
  reference_number: string | null;
  status: PaymentStatus;
  payment_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentCreate {
  project_id?: number | null;
  vendor_id?: number | null;
  procurement_id?: number | null;
  direction: PaymentDirection;
  amount: number;
  payment_method: PaymentMethod;
  reference_number?: string | null;
  status?: PaymentStatus;
  payment_date: string;
  notes?: string | null;
}

export interface PaymentUpdate {
  status?: PaymentStatus;
  notes?: string | null;
  reference_number?: string | null;
}

export async function createPayment(entityId: number, data: PaymentCreate): Promise<Payment> {
  return apiRequest<Payment>(`/entities/${entityId}/payments`, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function listPayments(
  entityId: number,
  filters?: {
    project_id?: number;
    vendor_id?: number;
    procurement_id?: number;
  }
): Promise<{ items: Payment[] }> {
  const searchParams = new URLSearchParams();
  if (filters?.project_id) searchParams.set("project_id", filters.project_id.toString());
  if (filters?.vendor_id) searchParams.set("vendor_id", filters.vendor_id.toString());
  if (filters?.procurement_id) searchParams.set("procurement_id", filters.procurement_id.toString());
  
  const query = searchParams.toString();
  return apiRequest<{ items: Payment[] }>(
    `/entities/${entityId}/payments${query ? `?${query}` : ""}`
  );
}

export async function updatePayment(
  entityId: number,
  paymentId: number,
  data: PaymentUpdate
): Promise<Payment> {
  return apiRequest<Payment>(`/entities/${entityId}/payments/${paymentId}`, {
    method: "PATCH",
    body: JSON.stringify(data)
  });
}
