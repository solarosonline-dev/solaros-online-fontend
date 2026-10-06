import { apiRequest } from "./client";

export type AttributeField = {
  key: string;
  label: string;
  type: "string" | "number" | "integer" | "boolean" | "enum";
  required?: boolean;
  unit?: string;
  options?: string[];
  min?: number;
  max?: number;
  filterable?: boolean;
};

export type HandlingClass = "STANDARD" | "FRAGILE" | "HEAVY" | "FRAGILE_HEAVY";
export type ProductUnit = "PIECE" | "SET" | "METER" | "KG";
export type ProductStatus = "DRAFT" | "PROPOSED" | "ACTIVE" | "REJECTED" | "RETIRED";

export type Category = {
  category_id: number;
  parent_id: number | null;
  code: string;
  name: string;
  attribute_schema: AttributeField[];
  effective_schema: AttributeField[];
  handling_class: HandlingClass;
  sort_order: number;
  is_active: boolean;
};

// Decimal columns arrive as strings.
export type Product = {
  product_id: number;
  category_id: number;
  brand: string;
  model: string;
  name: string;
  attributes: Record<string, unknown>;
  unit: ProductUnit;
  hsn_code: string | null;
  gst_rate: string | null;
  weight_kg: string | null;
  volume_cc: string | null;
  equivalence_group: string | null;
  handling_class: HandlingClass;
  status: ProductStatus;
  reject_reason: string | null;
  proposed_by_entity_id: number | null;
  created_at: string;
};

export type ProductList = { items: Product[]; page: number; page_size: number; total: number };

export type ProductInput = {
  category_id: number;
  brand: string;
  model: string;
  name?: string | null;
  attributes: Record<string, unknown>;
  unit: ProductUnit;
  hsn_code?: string | null;
  gst_rate?: number | null;
  weight_kg?: number | null;
  volume_cc?: number | null;
  equivalence_group?: string | null;
  status?: "ACTIVE" | "DRAFT";
};

function qs(params: Record<string, string | number | string[] | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

// --- System admin ---
export const adminListCategories = () => apiRequest<{ items: Category[] }>("/admin/mp/categories");
export const adminCreateCategory = (body: {
  code: string;
  name: string;
  parent_id: number | null;
  attribute_schema: AttributeField[];
  handling_class: HandlingClass;
}) => apiRequest<Category>("/admin/mp/categories", { method: "POST", body });
export const adminUpdateCategory = (
  id: number,
  body: { name?: string; attribute_schema?: AttributeField[]; handling_class?: HandlingClass },
) => apiRequest<Category>(`/admin/mp/categories/${id}`, { method: "PATCH", body });
export const adminSetCategoryActive = (id: number, active: boolean) =>
  apiRequest<Category>(`/admin/mp/categories/${id}/${active ? "activate" : "deactivate"}`, { method: "POST" });

export const adminListProducts = (p: { status?: string[]; q?: string; category_id?: number; page?: number; page_size?: number }) =>
  apiRequest<ProductList>(`/admin/mp/products${qs(p)}`);
export const adminCreateProduct = (body: ProductInput) =>
  apiRequest<Product>("/admin/mp/products", { method: "POST", body });
export const adminProductAction = (id: number, action: "approve" | "retire" | "reactivate") =>
  apiRequest<Product>(`/admin/mp/products/${id}/${action}`, { method: "POST" });
export const adminRejectProduct = (id: number, reason: string) =>
  apiRequest<Product>(`/admin/mp/products/${id}/reject`, { method: "POST", body: { reason } });

// --- Vendor ---
export const vendorListCategories = (entityId: number) =>
  apiRequest<{ items: Category[] }>(`/entities/${entityId}/mp/categories`);
export const vendorListProducts = (
  entityId: number,
  p: { q?: string; category_id?: number; mine?: boolean; page?: number; page_size?: number },
) => apiRequest<ProductList>(`/entities/${entityId}/mp/products${qs({ ...p, mine: p.mine ? "true" : undefined })}`);
export const vendorProposeProduct = (entityId: number, body: ProductInput) =>
  apiRequest<Product>(`/entities/${entityId}/mp/products/propose`, { method: "POST", body });
