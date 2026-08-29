import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { listEntityQuotes, type EntityQuoteListItem } from "../../api/quotes";
import { ApiError } from "../../api/client";
import Pagination from "../../lib/Pagination";
import "./QuotesPage.css";

const PAGE_SIZE = 20;

export default function QuotesPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const navigate = useNavigate();

  const [quotes, setQuotes] = useState<EntityQuoteListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Generating a quote lives on the Leads page now (a lead only ever needs
  // one, and NEW leads already show up there) -- this page shows quotes
  // only, server-paginated like Leads/Projects.
  function load() {
    setLoading(true);
    setLoadError(null);
    listEntityQuotes(entityId, { page, page_size: PAGE_SIZE })
      .then((res) => {
        setQuotes(res.items);
        setTotal(res.total);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load quotes"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, page]);

  // Client-side, scoped to the currently loaded page only -- filters what's
  // already in memory, no extra request per keystroke.
  const filteredQuotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter((row) => row.lead_name.toLowerCase().includes(q) || row.lead_mobile.includes(q));
  }, [quotes, search]);

  return (
    <div className="quotes-page">
      <h1>Quotes</h1>

      <input
        type="search"
        className="quotes-search"
        placeholder="Search name or mobile (current page)…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="quotes-table-wrap">
        {loading ? (
          <div className="quotes-loading">Loading…</div>
        ) : loadError ? (
          <div className="quotes-loading">{loadError}</div>
        ) : filteredQuotes.length === 0 ? (
          <div className="quotes-empty">{quotes.length === 0 ? "No quotes yet." : "No matches on this page."}</div>
        ) : (
          <table className="quotes-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Mobile</th>
                <th>Total amount</th>
                <th>Status</th>
                <th>Created</th>
                <th>Accepted</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.map((row) => {
                // An agreement can only ever be created while the lead is
                // QUOTE_ACCEPTED (backend: 409 INVALID_LEAD_STATE
                // otherwise); AGREEMENT_GENERATED/AGREEMENT_ACCEPTED means
                // one already exists. Anything else (QUOTE_GENERATED,
                // REJECTED) has no action to offer here.
                const agreementAction: "generate" | "view" | null =
                  row.lead_status === "QUOTE_ACCEPTED"
                    ? "generate"
                    : row.lead_status === "AGREEMENT_GENERATED" || row.lead_status === "AGREEMENT_ACCEPTED"
                      ? "view"
                      : null;
                return (
                  <tr key={row.quote_id}>
                    <td data-label="Lead">{row.lead_name}</td>
                    <td data-label="Mobile">{row.lead_mobile}</td>
                    <td data-label="Total amount">₹{Number(row.total_amount).toLocaleString("en-IN")}</td>
                    <td data-label="Status">
                      <span className="quotes-status-badge">{row.status}</span>
                    </td>
                    <td data-label="Created">{new Date(row.created_at).toLocaleDateString()}</td>
                    <td data-label="Accepted">{row.accepted_at ? new Date(row.accepted_at).toLocaleDateString() : "—"}</td>
                    <td className="quotes-table-action-cell">
                      <button className="quotes-btn" onClick={() => navigate(`/app/leads/${row.lead_id}/quote`)}>
                        View quote
                      </button>
                    </td>
                    <td className="quotes-table-action-cell">
                      {agreementAction && (
                        <button
                          className="quotes-btn primary"
                          onClick={() => navigate(`/app/leads/${row.lead_id}/agreement`)}
                        >
                          {agreementAction === "generate" ? "Generate agreement" : "View agreement"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && !loadError && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      )}
    </div>
  );
}
