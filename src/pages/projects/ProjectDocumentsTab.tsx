import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProjectDocuments, type ProjectDocumentItem } from "../../api/projects";
import { ApiError } from "../../api/client";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What to show in a card's thumbnail slot when there's no image to render
 * -- a Quote/Agreement (no file, or a PDF), or a non-image WorkOrderDocument
 * (PDF/spreadsheet, including the generated SLD diagram). */
function placeholderLabel(item: ProjectDocumentItem): string {
  if (item.content_type === "application/pdf") return "PDF";
  if (item.source === "QUOTE") return "Quote";
  if (item.source === "AGREEMENT") return "Agreement";
  return "File";
}

/** One-stop grid of everything tied to a project -- the Lead's Quote(s) and
 * Agreement(s), plus every WorkOrderDocument across the project's work
 * orders (site photos, signed forms, the generated SLD diagram, etc) --
 * backed by GET .../projects/{id}/documents, which normalizes all three
 * sources into one shape (see ProjectDocumentItem in api/projects.ts).
 *
 * A grid of cards rather than a table: the sources have almost nothing in
 * common column-wise (a Quote has a status but no file size; a work order
 * photo has neither a Quote's status nor an Agreement's signing state), so
 * forcing them into shared columns would leave most cells blank. Mirrors
 * the .entity-card-row grid pattern used elsewhere in the app.
 */
export default function ProjectDocumentsTab({ entityId, projectId }: { entityId: number; projectId: number }) {
  const [items, setItems] = useState<ProjectDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    listProjectDocuments(entityId, projectId)
      .then((res) => setItems(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load documents"))
      .finally(() => setLoading(false));
  }, [entityId, projectId]);

  if (loading) return <div className="projects-loading">Loading…</div>;
  if (loadError) return <div className="projects-loading">{loadError}</div>;
  if (items.length === 0) return <div className="projects-empty">No documents yet.</div>;

  return (
    <div className="documents-grid">
      {items.map((item) => (
        <div key={item.key} className="document-card">
          {item.content_type?.startsWith("image/") && item.download_url ? (
            <a
              href={item.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="document-card-thumb-link"
              aria-label={`Open ${item.title}`}
            >
              <img src={item.download_url} alt={item.title} className="document-card-thumb" loading="lazy" />
            </a>
          ) : (
            <div className="document-card-thumb document-card-thumb-placeholder">{placeholderLabel(item)}</div>
          )}

          <div className="document-card-body">
            <div className="document-card-title" title={item.title}>
              {item.title}
            </div>
            {item.subtitle && <div className="document-card-subtitle">{item.subtitle.replace(/_/g, " ")}</div>}
            <div className="document-card-meta">
              {[
                item.size_bytes != null ? formatSize(item.size_bytes) : null,
                item.uploaded_by_name,
                new Date(item.created_at).toLocaleDateString(),
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>

          <div className="document-card-actions">
            {/* Quote/Agreement always carry a view_path (in-app route);
                Agreement additionally carries download_url once signed. A
                WorkOrderDocument only ever has download_url. */}
            {item.view_path && (
              <Link className="projects-btn" to={item.view_path}>
                View
              </Link>
            )}
            {item.download_url && (
              <a className="projects-btn" href={item.download_url} target="_blank" rel="noopener noreferrer">
                Download
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
