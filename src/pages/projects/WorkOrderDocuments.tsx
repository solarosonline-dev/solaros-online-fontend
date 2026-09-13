import { useEffect, useRef, useState } from "react";
import {
  listWorkOrderDocuments,
  uploadWorkOrderDocument,
  getWorkOrderDocumentDownloadUrl,
  deleteWorkOrderDocument,
  MAX_WORK_ORDER_DOCUMENTS,
  MAX_WORK_ORDER_DOCUMENT_SIZE_BYTES,
  type WorkOrderDocument,
} from "../../api/workOrders";
import { ApiError } from "../../api/client";
import ConfirmDialog from "../../components/ConfirmDialog";
import { stampAndPreparePhoto, type GeotagSkippedReason } from "../../lib/geotagPhoto";

/** Human-readable explanation for each way a photo can end up without a
 * location stamp -- shown so a silently-skipped geotag (by design, since it
 * must never block the upload) doesn't look like an unexplained bug. */
const GEOTAG_SKIPPED_MESSAGES: Record<GeotagSkippedReason, string> = {
  unsupported: "location isn't supported in this browser.",
  permission_denied: "location access was denied for this site.",
  position_unavailable: "your device couldn't get a location fix (check that Location/GPS is turned on).",
  timeout: "getting your location took too long.",
  canvas_unavailable: "your location was captured, but the photo couldn't be stamped.",
};

const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Optional documents (photos, signed forms, etc) attached to a work order --
 * independent of status, so this shows regardless of NEW/IN_PROGRESS/
 * COMPLETED. Same access as the work order page itself (an entity admin or
 * its current assignee), enforced server-side -- this component doesn't
 * need its own permission check since it only ever renders inside a page
 * the viewer was already allowed to load. */
export default function WorkOrderDocuments({
  entityId,
  workOrderId,
  onDocumentsChange,
}: {
  entityId: number;
  workOrderId: number;
  /** Reports whether at least one image document exists, any time the
   * documents list changes (initial load, upload, delete) -- purely
   * informational for the parent page's completion-hint; this component's
   * own load/upload/delete flow is unaffected either way. */
  onDocumentsChange?: (hasPhoto: boolean) => void;
}) {
  const [documents, setDocuments] = useState<WorkOrderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [geotagNotice, setGeotagNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WorkOrderDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    listWorkOrderDocuments(entityId, workOrderId)
      .then((res) => setDocuments(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load documents"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, workOrderId]);

  useEffect(() => {
    onDocumentsChange?.(documents.some((d) => d.content_type.startsWith("image/")));
    // onDocumentsChange is a fresh setState-wrapping closure from the parent
    // on every render -- depending on it too would re-fire this needlessly;
    // documents is the only thing that actually determines the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents]);

  const atLimit = documents.length >= MAX_WORK_ORDER_DOCUMENTS;

  /** Shared by both the generic file picker and the camera-capture input --
   * enforces the same slot/size limits, then uploads sequentially. Any
   * image file is run through stampAndPreparePhoto first: it attempts to
   * grab the current location (best-effort -- never blocks the upload if
   * denied/unavailable) and, when successful, burns a lat/long/timestamp
   * watermark into the image and returns the geotag to send alongside the
   * upload. Non-image files (PDF/XLS) skip geotagging entirely. */
  async function uploadFiles(selected: File[]) {
    if (selected.length === 0) return;

    setUploadError(null);
    setGeotagNotice(null);
    const skippedReasons = new Set<GeotagSkippedReason>();

    // Only take as many as there's room for -- the rest are reported as
    // skipped rather than attempted and rejected one by one by the backend's
    // own count check.
    const remainingSlots = MAX_WORK_ORDER_DOCUMENTS - documents.length;
    const toUpload = selected.slice(0, remainingSlots);
    const skippedForLimit = selected.length - toUpload.length;

    const tooLarge = toUpload.filter((f) => f.size > MAX_WORK_ORDER_DOCUMENT_SIZE_BYTES);
    const withinLimit = toUpload.filter((f) => f.size <= MAX_WORK_ORDER_DOCUMENT_SIZE_BYTES);

    const errors: string[] = [];
    if (tooLarge.length > 0) {
      errors.push(
        `${tooLarge.map((f) => f.name).join(", ")} — must be ${MAX_WORK_ORDER_DOCUMENT_SIZE_BYTES / (1024 * 1024)} MB or smaller.`,
      );
    }
    if (skippedForLimit > 0) {
      errors.push(`${skippedForLimit} file(s) skipped — only ${remainingSlots} slot(s) left.`);
    }

    if (withinLimit.length > 0) {
      setUploading(true);
      // Sequential, not parallel -- the backend re-checks the "max N per
      // work order" count on every request, so uploading concurrently could
      // race past the limit rather than stopping cleanly at it.
      for (let i = 0; i < withinLimit.length; i++) {
        setUploadProgress({ done: i, total: withinLimit.length });
        const original = withinLimit[i];
        try {
          let toSend = original;
          let geotag: { latitude: number; longitude: number; capturedAt: string } | undefined;
          if (original.type.startsWith("image/")) {
            const stamped = await stampAndPreparePhoto(original);
            toSend = stamped.file;
            if (stamped.latitude != null && stamped.longitude != null) {
              geotag = { latitude: stamped.latitude, longitude: stamped.longitude, capturedAt: stamped.capturedAt };
            }
            if (stamped.skippedReason) {
              skippedReasons.add(stamped.skippedReason);
            }
          }
          const doc = await uploadWorkOrderDocument(entityId, workOrderId, toSend, geotag);
          setDocuments((prev) => [doc, ...prev]);
        } catch (err) {
          errors.push(`${original.name} — ${err instanceof ApiError ? err.message : "could not upload"}.`);
        }
      }
      setUploadProgress(null);
      setUploading(false);
    }

    if (errors.length > 0) setUploadError(errors.join(" "));
    if (skippedReasons.size > 0) {
      setGeotagNotice(
        `Uploaded without a location stamp: ${[...skippedReasons].map((r) => GEOTAG_SKIPPED_MESSAGES[r]).join(" ")}`,
      );
    }
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file(s) after an error
    uploadFiles(selected);
  }

  function handleCameraCaptured(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    // Critical: reset the input value so tapping "Take Photo" again
    // re-launches the camera app for another shot, rather than being a
    // no-op because the browser sees the same file value as last time.
    e.target.value = "";
    uploadFiles(selected);
  }

  async function handleView(document: WorkOrderDocument) {
    setOpeningId(document.document_id);
    try {
      const res = await getWorkOrderDocumentDownloadUrl(entityId, workOrderId, document.document_id);
      window.open(res.download_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Could not open document");
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDelete(documentId: number) {
    setPendingDelete(null);
    setDeletingId(documentId);
    setUploadError(null);
    try {
      await deleteWorkOrderDocument(entityId, workOrderId, documentId);
      setDocuments((prev) => prev.filter((d) => d.document_id !== documentId));
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Could not delete document");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <p className="projects-section-label work-order-documents-heading">
        Documents <span className="work-order-type-hint">({documents.length}/{MAX_WORK_ORDER_DOCUMENTS})</span>
      </p>
      <p className="work-order-type-hint work-order-documents-hint">
        PDF, JPG, PNG, WEBP, XLS, or XLSX — up to {MAX_WORK_ORDER_DOCUMENT_SIZE_BYTES / (1024 * 1024)} MB each,{" "}
        {MAX_WORK_ORDER_DOCUMENTS} per work order.
      </p>

      <div className="work-order-upload-controls">
        <label
          className={`work-orders-new-panel work-order-upload-row${uploading || atLimit ? " disabled" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            multiple
            disabled={uploading || atLimit}
            onChange={handleFileSelected}
            className="visually-hidden"
          />
          <span>
            {uploading
              ? `Uploading ${uploadProgress ? uploadProgress.done + 1 : 1} of ${uploadProgress?.total ?? 1}…`
              : atLimit
                ? "Limit reached — delete one to add another."
                : "Choose files to upload"}
          </span>
        </label>
        {/* `capture="environment"` launches the phone's native camera app
            directly on mobile; desktop browsers simply ignore the hint and
            fall back to a normal file picker, so this is always shown --
            no device-detection branching needed. Each tap captures one
            photo; tapping again re-launches the camera for the next shot,
            which is how "multiple photos" is supported here. */}
        <label
          className={`work-orders-new-panel work-order-upload-row${uploading || atLimit ? " disabled" : ""}`}
        >
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            disabled={uploading || atLimit}
            onChange={handleCameraCaptured}
            className="visually-hidden"
          />
          <span>{uploading ? "Uploading…" : "Take Photo"}</span>
        </label>
      </div>
      {uploadError && (
        <p className="work-order-type-hint work-order-upload-error" style={{ color: "var(--app-danger)" }}>
          {uploadError}
        </p>
      )}
      {/* Informational, not an error -- the upload itself succeeded. Shown
          so a denied/unavailable location permission (which must never
          block the photo) is at least visible, rather than a mysteriously
          missing watermark with no explanation. */}
      {geotagNotice && <p className="work-order-type-hint work-order-documents-hint">{geotagNotice}</p>}

      {loading ? (
        <div className="projects-loading">Loading…</div>
      ) : loadError ? (
        <div className="projects-loading">{loadError}</div>
      ) : documents.length === 0 ? (
        <div className="projects-empty">No documents yet.</div>
      ) : (
        <div className="work-order-documents-list">
          {documents.map((doc) => (
            <div key={doc.document_id} className="work-order-document-card">
              <div className="work-order-document-name">{doc.file_name}</div>
              <div className="work-order-assignee-contact">
                {formatSize(doc.size_bytes)} · {doc.uploaded_by_name} ·{" "}
                {new Date(doc.created_at).toLocaleDateString()}
              </div>
              <div className="work-order-document-actions">
                <button
                  className="projects-btn"
                  disabled={openingId === doc.document_id}
                  onClick={() => handleView(doc)}
                >
                  {openingId === doc.document_id ? "Opening…" : "View"}
                </button>
                <button
                  className="projects-btn danger"
                  disabled={deletingId === doc.document_id}
                  onClick={() => setPendingDelete(doc)}
                >
                  {deletingId === doc.document_id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete this document?"
        message={`This permanently deletes "${pendingDelete?.file_name}". This can't be undone.`}
        confirmLabel="Delete"
        confirming={deletingId === pendingDelete?.document_id}
        confirmingLabel="Deleting…"
        onConfirm={() => pendingDelete && handleDelete(pendingDelete.document_id)}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
