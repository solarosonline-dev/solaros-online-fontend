import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { canManageLeads, isAgent } from "../../lib/roles";
import { listLeads, listSalesReps, type Lead, type SalesRepList } from "../../api/leads";
import { ApiError } from "../../api/client";
import { LeadFunnelNav, LeadStageBadge } from "./leadFunnel";
import { useLeadWorkflow } from "../../lib/useLeadWorkflow";
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

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  // A workflow stage name, "REJECTED", or "" for all leads.
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { stages } = useLeadWorkflow(entityId);
  const [page, setPage] = useState(1);

  // Admins and sales managers see every lead and can narrow by sales rep; a
  // rep's list is already scoped to their own leads by the backend.
  const manager = canManageLeads(user!.roles);
  // "" = everyone, "unassigned", or a rep's user id.
  const [repFilter, setRepFilter] = useState<string>("");
  const [reps, setReps] = useState<SalesRepList | null>(null);
  const hasAgents = !!user!.features?.includes("AGENTS");

  function loadReps() {
    if (!manager) return;
    listSalesReps(entityId)
      .then(setReps)
      .catch(() => setReps(null));
  }

  function load() {
    setLoading(true);
    setLoadError(null);
    listLeads(entityId, {
      status: statusFilter === "REJECTED" ? "REJECTED" : undefined,
      stage: statusFilter && statusFilter !== "REJECTED" ? statusFilter : undefined,
      search: search || undefined,
      sales_rep_id: repFilter && repFilter !== "unassigned" ? Number(repFilter) : undefined,
      unassigned: repFilter === "unassigned" || undefined,
      page,
      page_size: PAGE_SIZE,
    }, isAgent(user!.roles))
      .then((res) => {
        setLeads(res.items);
        setTotal(res.total);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load leads"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, statusFilter, search, page, repFilter]);
  useEffect(loadReps, [entityId, manager]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleRepFilterChange(value: string) {
    setRepFilter((prev) => (prev === value ? "" : value));
    setPage(1);
  }

  // Resetting the page alongside the filter/search change (rather than in a
  // separate effect keyed on them) keeps this to one fetch instead of one
  // for the stale page under the new filter followed by a second for page 1.
  function handleStatusFilterChange(status: string) {
    setStatusFilter(status);
    setPage(1);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  return (
    <div className="leads-page">
      <h1>
        Leads
        <button className="leads-btn primary" onClick={() => navigate("/app/leads/new")}>
          + Add lead
        </button>
      </h1>

      <LeadFunnelNav stages={stages} value={statusFilter} onSelect={handleStatusFilterChange} />
      {manager && reps && (reps.items.length > 0 || reps.unassigned_count > 0) && (
        <div className="leads-rep-strip" role="group" aria-label="Filter by sales rep">
          {reps.items.map((r) => (
            <button
              key={r.user_id}
              type="button"
              className={`leads-rep-chip${repFilter === String(r.user_id) ? " active" : ""}`}
              aria-pressed={repFilter === String(r.user_id)}
              onClick={() => handleRepFilterChange(String(r.user_id))}
            >
              <span className="leads-rep-chip-name">{r.full_name}</span>
              <span className="leads-rep-chip-count" title={`${r.open_count} open of ${r.assigned_count} assigned`}>
                {r.open_count} open · {r.assigned_count} total
              </span>
            </button>
          ))}
          <button
            type="button"
            className={`leads-rep-chip unassigned${repFilter === "unassigned" ? " active" : ""}`}
            aria-pressed={repFilter === "unassigned"}
            onClick={() => handleRepFilterChange("unassigned")}
          >
            <span className="leads-rep-chip-name">Unassigned</span>
            <span className="leads-rep-chip-count">{reps.unassigned_count} leads</span>
          </button>
        </div>
      )}
      <form className="leads-filters" onSubmit={handleSearchSubmit}>
        <input
          type="search"
          placeholder="Search name or mobile…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </form>

      <div className="leads-table-wrap">
        {loading ? (
          <div className="leads-loading">Loading…</div>
        ) : loadError ? (
          <div className="leads-loading">{loadError}</div>
        ) : leads.length === 0 ? (
          <div className="leads-empty">No leads yet.</div>
        ) : (
          <table className="leads-table leads-table-clickable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile</th>
                <th>Stage</th>
                <th>Sales rep</th>
                {hasAgents && manager && <th>Agent</th>}
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {/* The whole row drills into the lead; quotes, agreements and
                  the project are reached from the lead's own page. */}
              {leads.map((lead) => (
                <tr
                  key={lead.lead_id}
                  tabIndex={0}
                  onClick={() => navigate(`/app/leads/${lead.lead_id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") navigate(`/app/leads/${lead.lead_id}`);
                  }}
                >
                  <td data-label="Name">{lead.name}</td>
                  <td data-label="Mobile">{lead.mobile}</td>
                  <td data-label="Stage">
                    <LeadStageBadge stage={lead.agent_stage} rejected={lead.status === "REJECTED"} />
                  </td>
                  <td data-label="Sales rep">{lead.assigned_sales_rep_name ?? <span className="leads-muted">Unassigned</span>}</td>
                  {hasAgents && manager && (
                    <td data-label="Agent">{lead.created_by_name ?? <span className="leads-muted">—</span>}</td>
                  )}
                  <td data-label="Created">{new Date(lead.created_at).toLocaleDateString()}</td>
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
