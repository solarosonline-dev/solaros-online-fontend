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
export default function WorkOrderDocuments({ entityId, workOrderId }: { entityId: number; workOrderId: number }) {
  const [documents, setDocuments] = useState<WorkOrderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WorkOrderDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    listWorkOrderDocuments(entityId, workOrderId)
      .then((res) => setDocuments(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load documents"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, workOrderId]);

  const atLimit = documents.length >= MAX_WORK_ORDER_DOCUMENTS;

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file(s) after an error
    if (selected.length === 0) return;

    setUploadError(null);

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
        try {
          const doc = await uploadWorkOrderDocument(entityId, workOrderId, withinLimit[i]);
          setDocuments((prev) => [doc, ...prev]);
        } catch (err) {
          errors.push(`${withinLimit[i].name} — ${err instanceof ApiError ? err.message : "could not upload"}.`);
        }
      }
      setUploadProgress(null);
      setUploading(false);
    }

    if (errors.length > 0) setUploadError(errors.join(" "));
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
      {uploadError && (
        <p className="work-order-type-hint work-order-upload-error" style={{ color: "var(--app-danger)" }}>
          {uploadError}
        </p>
      )}

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
