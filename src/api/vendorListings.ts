import { apiRequest, getAuthToken } from "./client";

export type ListingStatus = "DRAFT" | "ACTIVE" | "INACTIVE";

export type Tier = { min_qty: number; unit_price: string };
export type Stock = { on_hand: string; reserved: string; available: string };

export type Listing = {
  listing_id: number;
  product_id: number;
  product_name: string;
  brand: string;
  model: string;
  vendor_sku: string;
  base_price: string;
  moq: number;
  pack_size: number;
  lead_time_days: number;
  dispatch_pincode: string;
  status: ListingStatus;
  tiers: Tier[];
  stock: Stock;
  created_at: string;
};

export type ListingList = { items: Listing[]; page: number; page_size: number; total: number };

export type Movement = {
  movement_id: number;
  type: string;
  on_hand_delta: string;
  reserved_delta: string;
  on_hand_after: string;
  reserved_after: string;
  ref_type: string | null;
  ref_id: number | null;
  note: string | null;
  actor_user_id: number | null;
  created_at: string;
};
export type MovementList = { items: Movement[]; page: number; page_size: number; total: number };

export type ListingInput = {
  product_id: number;
  vendor_sku: string;
  base_price: number;
  moq: number;
  pack_size: number;
  lead_time_days: number;
  dispatch_pincode: string;
};

const base = (e: number) => `/entities/${e}/mp/listings`;

export function listListings(e: number, p: { status?: string; q?: string; page?: number; page_size?: number }) {
  const s = new URLSearchParams();
  if (p.status) s.set("status", p.status);
  if (p.q) s.set("q", p.q);
  if (p.page) s.set("page", String(p.page));
  if (p.page_size) s.set("page_size", String(p.page_size));
  const q = s.toString();
  return apiRequest<ListingList>(`${base(e)}${q ? `?${q}` : ""}`);
}
export const createListing = (e: number, body: ListingInput) => apiRequest<Listing>(base(e), { method: "POST", body });
export const updateListing = (e: number, id: number, body: Partial<Omit<ListingInput, "product_id" | "vendor_sku">>) =>
  apiRequest<Listing>(`${base(e)}/${id}`, { method: "PATCH", body });
export const setTiers = (e: number, id: number, tiers: { min_qty: number; unit_price: number }[]) =>
  apiRequest<Listing>(`${base(e)}/${id}/tiers`, { method: "PUT", body: { tiers } });
export const setListingActive = (e: number, id: number, active: boolean) =>
  apiRequest<Listing>(`${base(e)}/${id}/${active ? "activate" : "deactivate"}`, { method: "POST" });
export const changeStock = (e: number, id: number, body: { type: "RECEIPT" | "ADJUST"; qty: number; note?: string }) =>
  apiRequest<Listing>(`${base(e)}/${id}/stock`, { method: "POST", body });
export const listMovements = (e: number, id: number, page = 1, page_size = 10) =>
  apiRequest<MovementList>(`${base(e)}/${id}/stock/movements?page=${page}&page_size=${page_size}`);

export type BulkRowResult = {
  row: number;
  status: "CREATED" | "UPDATED" | "UNCHANGED" | "ERROR";
  listing_id: number | null;
  errors: { field: string; message: string }[];
};
export type BulkUploadResult = {
  dry_run: boolean;
  applied: boolean;
  mode: string;
  total_rows: number;
  created: number;
  updated: number;
  unchanged: number;
  error_count: number;
  rows: BulkRowResult[];
};

export function bulkUpload(e: number, file: File, opts: { dry_run: boolean; skip_invalid: boolean }) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("dry_run", String(opts.dry_run));
  fd.append("skip_invalid", String(opts.skip_invalid));
  return apiRequest<BulkUploadResult>(`${base(e)}/bulk`, { method: "POST", body: fd });
}

/** The template is CSV, not JSON, so it can't go through apiRequest. */
export async function downloadListingTemplate(e: number): Promise<Blob> {
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}${base(e)}/template`, {
    headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
  });
  if (!res.ok) throw new Error("Could not download the template");
  return res.blob();
}
