import { apiRequest } from "./client";

export interface Vendor {
    vendor_id: number;
    entity_id: number;
    name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface VendorListResponse {
    items: Vendor[];
}

export interface VendorCreateRequest {
    name: string;
    contact_name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    is_active?: boolean;
}

export interface VendorUpdateRequest {
    name?: string | null;
    contact_name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    is_active?: boolean | null;
}

export async function listEntityVendors(entityId: number): Promise<VendorListResponse> {
    return apiRequest<VendorListResponse>(`/entities/${entityId}/vendors`);
}

export async function createEntityVendor(entityId: number, data: VendorCreateRequest): Promise<Vendor> {
    return apiRequest<Vendor>(`/entities/${entityId}/vendors`, {
        method: "POST",
        body: data,
    });
}

export async function updateEntityVendor(entityId: number, vendorId: number, data: VendorUpdateRequest): Promise<Vendor> {
    return apiRequest<Vendor>(`/entities/${entityId}/vendors/${vendorId}`, {
        method: "PATCH",
        body: data,
    });
}
