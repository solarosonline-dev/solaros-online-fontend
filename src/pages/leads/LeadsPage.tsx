import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { listLeads, type Lead, type LeadStatus } from "../../api/leads";
import { ApiError } from "../../api/client";
import AddLeadForm from "./AddLeadForm";
import "./LeadsPage.css";

const STATUS_OPTIONS: { label: string; value: LeadStatus | "" }[] = [
  { label: "All statuses", value: "" },
  { label: "New", value: "NEW" },
  { label: "Quote generated", value: "QUOTE_GENERATED" },
  { label: "Quote accepted", value: "QUOTE_ACCEPTED" },
  { label: "Agreement generated", value: "AGREEMENT_GENERATED" },
  { label: "Agreement accepted", value: "AGREEMENT_ACCEPTED" },
  { label: "Rejected", value: "REJECTED" },
];

export default function LeadsPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const navigate = useNavigate();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");

  function load() {
    setLoading(true);
    setLoadError(null);
    listLeads(entityId, { status: statusFilter || undefined, search: search || undefined })
      .then((res) => setLeads(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load leads"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, statusFilter, search]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
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
        <form className="leads-filters" onSubmit={handleSearchSubmit}>
          <input
            type="search"
            placeholder="Search name or mobile…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "")}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </form>
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
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.lead_id} onClick={() => navigate(`/app/leads/${lead.lead_id}`)}>
                  <td>{lead.name}</td>
                  <td>{lead.mobile}</td>
                  <td>
                    <span className="lead-status-badge">{lead.status}</span>
                  </td>
                  <td>{new Date(lead.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
