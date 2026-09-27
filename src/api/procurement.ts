import { apiRequest } from "./client";
import type { MaterialType, MaterialUnit } from "./warehouses";

export type ProcurementStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "FULFILLED" | "CANCELLED";

export interface ProcurementOrderItemCreate {
    material_type: MaterialType;
    make?: string | null;
    model?: string | null;
    quantity: number;
    unit: MaterialUnit;
}

export interface ProcurementOrderCreate {
    project_id: number;
    warehouse_id?: number | null;
    shipping_address?: string | null;
    shipping_latitude?: number | null;
    shipping_longitude?: number | null;
    notes?: string | null;
    items: ProcurementOrderItemCreate[];
}

export interface ProcurementOrderItemResponse {
    item_id: number;
    material_type: MaterialType;
    make: string | null;
    model: string | null;
    quantity: number;
    unit: MaterialUnit;
}

export interface ProcurementOrderResponse {
    procurement_id: number;
    entity_id: number;
  project_id: number;
  warehouse_id: number | null;
  vendor_id: number | null;
  status: ProcurementStatus;
  shipping_address: string | null;
  shipping_latitude: number | null;
  shipping_longitude: number | null;
  notes: string | null;
  total_cost: number | null;
  created_at: string;
    updated_at: string;
    items: ProcurementOrderItemResponse[];
}

export interface ProcurementOrderListResponse {
    items: ProcurementOrderResponse[];
}

export interface RouteMaterialRequestItem {
    material_type: MaterialType;
    make?: string | null;
    model?: string | null;
    quantity: number;
    unit: MaterialUnit;
}

export interface RouteMaterialRequest {
    project_id: number;
    items: RouteMaterialRequestItem[];
}

export interface RouteSuggestion {
    warehouse_id: number;
    warehouse_name: string;
    distance_km: number;
    items: RouteMaterialRequestItem[];
}

export interface RouteMaterialResponse {
    suggestions: RouteSuggestion[];
    unfulfillable_items: RouteMaterialRequestItem[];
}

export function routeMaterials(entityId: number, data: RouteMaterialRequest) {
    return apiRequest<RouteMaterialResponse>(`/entities/${entityId}/procurement/route`, {
        method: "POST",
        body: data,
    });
}

export function createProcurementOrder(entityId: number, data: ProcurementOrderCreate) {
    return apiRequest<ProcurementOrderResponse>(`/entities/${entityId}/procurement`, {
        method: "POST",
        body: data,
    });
}

export function listProcurementOrders(entityId: number, projectId: number) {
    return apiRequest<ProcurementOrderListResponse>(`/entities/${entityId}/projects/${projectId}/procurement`);
}

export interface ProcurementOrderUpdate {
  status?: ProcurementStatus;
  total_cost?: number | null;
  notes?: string | null;
}

export async function updateProcurementOrder(
  entityId: number,
  procurementId: number,
  data: ProcurementOrderUpdate
): Promise<ProcurementOrderResponse> {
  return apiRequest<ProcurementOrderResponse>(`/entities/${entityId}/procurement/${procurementId}`, {
    method: "PATCH",
    body: data,
  });
}
