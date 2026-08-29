import { apiRequest } from "./client";

// Site design/site-condition photos attached to a lead -- available before a
// quote is ever generated and reused across quote regenerations, up to 4 per
// lead, 5 MB each, JPEG/PNG/WEBP only (all enforced server-side; see
// MAX_SITE_IMAGES_PER_LEAD/MAX_SITE_IMAGE_SIZE_BYTES/ALLOWED_SITE_IMAGE_TYPES
// in the backend).
export const MAX_LEAD_SITE_IMAGES = 4;
export const MAX_LEAD_SITE_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export type LeadSiteImage = {
  image_id: number;
  file_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_by_user_id: number;
  uploaded_by_name: string;
  created_at: string;
  /** Presigned view URL, resolved server-side at list time -- null only if
   * S3 isn't configured. */
  url: string | null;
};

export function listLeadSiteImages(entityId: number, leadId: number) {
  return apiRequest<{ items: LeadSiteImage[] }>(`/entities/${entityId}/leads/${leadId}/site-images`);
}

/** One call for the whole "Save images" action -- adds, deletes, and
 * reorders in a single request/transaction, instead of one call per
 * changed image plus a separate reorder call. `order` is the final
 * display order: each entry is either `{ kind: "existing", imageId }`
 * (kept, in this position) or `{ kind: "new", index }` (the file at that
 * index in `newFiles`, in upload order). Any of the lead's existing images
 * not referenced in `order` is deleted. */
export function batchSaveLeadSiteImages(
  entityId: number,
  leadId: number,
  order: ({ kind: "existing"; imageId: number } | { kind: "new"; index: number })[],
  newFiles: File[],
) {
  const form = new FormData();
  form.append(
    "order",
    JSON.stringify(order.map((entry) => (entry.kind === "existing" ? `existing:${entry.imageId}` : `new:${entry.index}`))),
  );
  for (const file of newFiles) form.append("files", file, file.name);
  return apiRequest<{ items: LeadSiteImage[] }>(`/entities/${entityId}/leads/${leadId}/site-images/batch`, {
    method: "POST",
    body: form,
  });
}
