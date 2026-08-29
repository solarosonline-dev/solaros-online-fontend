import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { listLeads, type Lead, type LeadStatus } from "../../api/leads";
import { ApiError } from "../../api/client";
import AddLeadForm from "./AddLeadForm";
import { LeadFunnelNav, LeadStatusBadge } from "./leadFunnel";
import Pagination from "../../lib/Pagination";
import "./LeadsPage.css";

const PAGE_SIZE = 20;

export default function LeadsPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const navigate = useNavigate();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");
  const [page, setPage] = useState(1);

  function load() {
    setLoading(true);
    setLoadError(null);
    listLeads(entityId, {
      status: statusFilter || undefined,
      search: search || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((res) => {
        setLeads(res.items);
        setTotal(res.total);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load leads"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, statusFilter, search, page]);

  // Resetting the page alongside the filter/search change (rather than in a
  // separate effect keyed on them) keeps this to one fetch instead of one
  // for the stale page under the new filter followed by a second for page 1.
  function handleStatusFilterChange(status: LeadStatus | "") {
    setStatusFilter(status);
    setPage(1);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  function handleCreated() {
    setShowAddForm(false);
    load();
  }

  return (
    <div className="leads-page">
      <h1>
        Leads
        {!showAddForm && (
          <button className="leads-btn primary" onClick={() => setShowAddForm(true)}>
            + Add lead
          </button>
        )}
      </h1>

      {showAddForm && (
        <AddLeadForm entityId={entityId} onCreated={handleCreated} onCancel={() => setShowAddForm(false)} />
      )}

      {!showAddForm && (
        <>
          <LeadFunnelNav value={statusFilter} onSelect={handleStatusFilterChange} />
          <form className="leads-filters" onSubmit={handleSearchSubmit}>
            <input
              type="search"
              placeholder="Search name or mobile…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>
        </>
      )}

      <div className="leads-table-wrap">
        {loading ? (
          <div className="leads-loading">Loading…</div>
        ) : loadError ? (
          <div className="leads-loading">{loadError}</div>
        ) : leads.length === 0 ? (
          <div className="leads-empty">No leads yet.</div>
        ) : (
          <table className="leads-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                // A quote can only ever be created while the lead is NEW
                // (backend: 409 INVALID_LEAD_STATE otherwise); every status
                // after that implies one already exists. REJECTED is
                // ambiguous -- it could have happened before or after a
                // quote existed -- so it gets no action here.
                const quoteAction: "generate" | "view" | null =
                  lead.status === "NEW"
                    ? "generate"
                    : lead.status === "REJECTED"
                      ? null
                      : "view";
                return (
                  <tr key={lead.lead_id}>
                    <td data-label="Name">{lead.name}</td>
                    <td data-label="Mobile">{lead.mobile}</td>
                    <td data-label="Status">
                      <LeadStatusBadge status={lead.status} />
                    </td>
                    <td data-label="Created">{new Date(lead.created_at).toLocaleDateString()}</td>
                    <td className="leads-table-action-cell">
                      <button className="leads-btn" onClick={() => navigate(`/app/leads/${lead.lead_id}`)}>
                        View lead
                      </button>
                    </td>
                    <td className="leads-table-action-cell">
                      {quoteAction && (
                        <button
                          className="leads-btn primary"
                          onClick={() => navigate(`/app/leads/${lead.lead_id}/quote`)}
                        >
                          {quoteAction === "generate" ? "Generate quote" : "View quote"}
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

      {!showAddForm && !loading && !loadError && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      )}
    </div>
  );
}
