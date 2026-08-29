import "./Pagination.css";

/** Simple prev/next page control, shared by any list page backed by the
 * page/page_size/total shape the backend already returns (leads, projects,
 * ...). Renders nothing once everything fits on one page -- callers don't
 * need to gate on that themselves. */
export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="app-pagination">
      <span className="app-pagination-info">
        {start}–{end} of {total}
      </span>
      <div className="app-pagination-controls">
        <button
          type="button"
          className="app-pagination-btn"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ← Prev
        </button>
        <span className="app-pagination-page">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="app-pagination-btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
