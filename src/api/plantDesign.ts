import { apiRequest } from "./client";
import type { PlantDesignData } from "../pages/plant-design/types";

export type PlantDesignStatus = "DRAFT" | "FINAL";

export type PlantDesignListItem = {
  plant_design_id: number;
  name: string;
  status: PlantDesignStatus;
  capacity_kw: number | null;
  address: string | null;
  created_by_user_id: number;
  updated_at: string;
};

export type PlantDesignList = {
  items: PlantDesignListItem[];
  page: number;
  page_size: number;
  total: number;
};

export type PlantDesignDetail = {
  plant_design_id: number;
  entity_id: number;
  name: string;
  status: PlantDesignStatus;
  capacity_kw: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  design_data: PlantDesignData;
  created_by_user_id: number;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export function listPlantDesigns(entityId: number, params: { page?: number; page_size?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiRequest<PlantDesignList>(`/entities/${entityId}/plant-designs${query ? `?${query}` : ""}`);
}

export function getPlantDesign(entityId: number, plantDesignId: number) {
  return apiRequest<PlantDesignDetail>(`/entities/${entityId}/plant-designs/${plantDesignId}`);
}

export function createPlantDesign(
  entityId: number,
  body: {
    name: string;
    status?: PlantDesignStatus;
    capacity_kw?: number | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    design_data: PlantDesignData;
  },
) {
  return apiRequest<PlantDesignDetail>(`/entities/${entityId}/plant-designs`, { method: "POST", body });
}

export function updatePlantDesign(
  entityId: number,
  plantDesignId: number,
  body: Partial<{
    name: string;
    status: PlantDesignStatus;
    capacity_kw: number | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    design_data: PlantDesignData;
  }>,
) {
  return apiRequest<PlantDesignDetail>(`/entities/${entityId}/plant-designs/${plantDesignId}`, {
    method: "PATCH",
    body,
  });
}

export function deletePlantDesign(entityId: number, plantDesignId: number) {
  return apiRequest<void>(`/entities/${entityId}/plant-designs/${plantDesignId}`, { method: "DELETE" });
}

export type SiteImageUpload = { s3_key: string; url: string };

/** Uploads a satellite capture the frontend already fetched itself (see
 * PlantDesignEditor's captureSiteImage) straight to S3, instead of the
 * backend re-fetching the same image from the Maps Static API with its own
 * key on save - one Maps API call per capture instead of two. Entity-scoped
 * rather than tied to a plant_design_id: the location step can confirm (and
 * so capture) before the design has ever been saved and so before it has an
 * id at all. */
export function uploadPlantDesignSiteImage(entityId: number, blob: Blob, contentType: string) {
  const form = new FormData();
  form.append("file", blob, contentType === "image/jpeg" ? "capture.jpg" : "capture.png");
  return apiRequest<SiteImageUpload>(`/entities/${entityId}/plant-designs/site-image-uploads`, {
    method: "POST",
    body: form,
  });
}
