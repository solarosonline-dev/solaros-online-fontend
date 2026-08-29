import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { listEntityAgreements, type EntityAgreementListItem } from "../../api/agreements";
import { ApiError } from "../../api/client";
import Pagination from "../../lib/Pagination";
import "../quotes/QuotesPage.css";

const PAGE_SIZE = 20;

export default function AgreementsPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const navigate = useNavigate();

  const [agreements, setAgreements] = useState<EntityAgreementListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Generating an agreement lives on the Quotes page now (for a
  // QUOTE_ACCEPTED lead) -- this page shows agreements only, server-
  // paginated like Leads/Projects.
  function load() {
    setLoading(true);
    setLoadError(null);
    listEntityAgreements(entityId, { page, page_size: PAGE_SIZE })
      .then((res) => {
        setAgreements(res.items);
        setTotal(res.total);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load agreements"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, page]);

  // Client-side, scoped to the currently loaded page only -- filters what's
  // already in memory, no extra request per keystroke.
  const filteredAgreements = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agreements;
    return agreements.filter((row) => row.lead_name.toLowerCase().includes(q) || row.lead_mobile.includes(q));
  }, [agreements, search]);

  return (
    <div className="quotes-page">
      <h1>Agreements</h1>

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
        ) : filteredAgreements.length === 0 ? (
          <div className="quotes-empty">{agreements.length === 0 ? "No agreements yet." : "No matches on this page."}</div>
        ) : (
          <table className="quotes-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Mobile</th>
                <th>Status</th>
                <th>Created</th>
                <th>Signed</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredAgreements.map((row) => (
                <tr key={row.agreement_id}>
                  <td data-label="Lead">{row.lead_name}</td>
                  <td data-label="Mobile">{row.lead_mobile}</td>
                  <td data-label="Status">
                    <span className="quotes-status-badge">{row.status}</span>
                  </td>
                  <td data-label="Created">{new Date(row.created_at).toLocaleDateString()}</td>
                  <td data-label="Signed">{row.signed_at ? new Date(row.signed_at).toLocaleDateString() : "—"}</td>
                  <td className="quotes-table-action-cell">
                    <button
                      className="quotes-btn"
                      onClick={() => navigate(`/app/leads/${row.lead_id}/agreement`)}
                    >
                      View agreement
                    </button>
                  </td>
                  <td className="quotes-table-action-cell">
                    {/* project_id is only set once the agreement is ACCEPTED
                        -- that's what creates the Project. */}
                    {row.project_id != null && (
                      <button
                        className="quotes-btn primary"
                        onClick={() => navigate(`/app/projects/${row.project_id}`)}
                      >
                        View project
                      </button>
                    )}
                  </td>
                </tr>
              ))}
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
