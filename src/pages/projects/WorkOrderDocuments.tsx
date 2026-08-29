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

const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.webp";

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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
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
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after an error
    if (!file) return;

    setUploadError(null);
    if (file.size > MAX_WORK_ORDER_DOCUMENT_SIZE_BYTES) {
      setUploadError(`File must be ${MAX_WORK_ORDER_DOCUMENT_SIZE_BYTES / (1024 * 1024)} MB or smaller.`);
      return;
    }

    setUploading(true);
    try {
      const doc = await uploadWorkOrderDocument(entityId, workOrderId, file);
      setDocuments((prev) => [doc, ...prev]);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Could not upload document");
    } finally {
      setUploading(false);
    }
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
      <p className="projects-section-label">
        Documents <span className="work-order-type-hint">({documents.length}/{MAX_WORK_ORDER_DOCUMENTS})</span>
      </p>

      <div className="work-orders-new-panel">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          disabled={uploading || atLimit}
          onChange={handleFileSelected}
        />
        {uploading && <span className="work-order-type-hint">Uploading…</span>}
        {atLimit && !uploading && (
          <span className="work-order-type-hint">Limit reached — delete one to add another.</span>
        )}
        {uploadError && (
          <span className="work-order-type-hint" style={{ color: "var(--app-danger)" }}>
            {uploadError}
          </span>
        )}
      </div>

      <div className="projects-table-wrap">
        {loading ? (
          <div className="projects-loading">Loading…</div>
        ) : loadError ? (
          <div className="projects-loading">{loadError}</div>
        ) : documents.length === 0 ? (
          <div className="projects-empty">No documents yet.</div>
        ) : (
          <table className="projects-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Uploaded by</th>
                <th>Uploaded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.document_id}>
                  <td data-label="File">{doc.file_name}</td>
                  <td data-label="Size">{formatSize(doc.size_bytes)}</td>
                  <td data-label="Uploaded by">{doc.uploaded_by_name}</td>
                  <td data-label="Uploaded">{new Date(doc.created_at).toLocaleDateString()}</td>
                  <td className="projects-table-action-cell">
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
                      onClick={() => handleDelete(doc.document_id)}
                    >
                      {deletingId === doc.document_id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
