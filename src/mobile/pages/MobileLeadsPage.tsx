import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { listLeads, type Lead, type LeadStatus } from "../../api/leads";
import { isAgent } from "../../lib/roles";
import { ApiError } from "../../api/client";
import { LeadStatusBadge } from "../../pages/leads/leadFunnel";
import Pagination from "../../lib/Pagination";
import "./MobileLeadsPage.css";

const PAGE_SIZE = 15;

export default function MobileLeadsPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const navigate = useNavigate();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");
  const [page, setPage] = useState(1);
  const [expandedLeadId, setExpandedLeadId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    listLeads(
      entityId,
      {
        status: statusFilter || undefined,
        search: search || undefined,
        page,
        page_size: PAGE_SIZE,
      },
      isAgent(user!.roles)
    )
      .then((res) => {
        setLeads(res.items);
        setTotal(res.total);
      })
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "Failed to load leads")
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, statusFilter, search, page]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
    setExpandedLeadId(null);
  }

  function toggleExpand(leadId: number) {
    setExpandedLeadId((prev) => (prev === leadId ? null : leadId));
  }

  const statuses: { label: string; value: LeadStatus | "" }[] = [
    { label: "All", value: "" },
    { label: "New", value: "NEW" },
    { label: "Quoted", value: "QUOTE_GENERATED" },
    { label: "Agreements", value: "AGREEMENT_GENERATED" },
    { label: "Rejected", value: "REJECTED" },
  ];

  return (
    <div className="mobile-leads-page">
      <div className="mobile-leads-header">
        <h1>Leads Directory</h1>
        <button
          className="mobile-btn-add-primary"
          onClick={() => navigate("/app/leads/new")}
        >
          ➕ Add Lead
        </button>
      </div>

      {/* Filter Chips Scroll */}
      <div className="mobile-leads-filter-scroll">
        {statuses.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`mobile-filter-chip ${statusFilter === item.value ? "selected" : ""}`}
            onClick={() => {
              setStatusFilter(item.value);
              setPage(1);
              setExpandedLeadId(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <form className="mobile-leads-search" onSubmit={handleSearchSubmit}>
        <input
          type="search"
          placeholder="🔍 Search client name or phone..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </form>

      {/* Leads Cards List */}
      <div className="mobile-leads-list">
        {loading ? (
          <div className="mobile-leads-state-msg">
            <div className="mobile-leads-spinner" />
            <p>Syncing directory...</p>
          </div>
        ) : loadError ? (
          <div className="mobile-leads-state-msg error">
            <p>{loadError}</p>
            <button onClick={load} className="mobile-leads-retry-btn">
              Retry
            </button>
          </div>
        ) : leads.length === 0 ? (
          <div className="mobile-leads-state-msg empty">
            <p>No leads found in this filter.</p>
          </div>
        ) : (
          leads.map((lead) => {
            const isExpanded = expandedLeadId === lead.lead_id;

            const quoteAction: "generate" | "view" | null =
              lead.status === "NEW"
                ? "generate"
                : lead.status === "REJECTED"
                  ? null
                  : "view";

            const agreementAction: "generate" | "view" | null =
              lead.status === "QUOTE_ACCEPTED"
                ? "generate"
                : lead.status === "AGREEMENT_GENERATED" || lead.status === "AGREEMENT_ACCEPTED"
                  ? "view"
                  : null;

            return (
              <div
                key={lead.lead_id}
                className={`mobile-lead-card ${isExpanded ? "expanded" : ""}`}
              >
                {/* Front Summary Section */}
                <div className="lead-card-front" onClick={() => toggleExpand(lead.lead_id)}>
                  <div className="lead-card-main-info">
                    <h3>{lead.name}</h3>
                    <p className="lead-card-meta">
                      👤 ID: #{lead.lead_id} • Created: {new Date(lead.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="lead-card-right-info">
                    <LeadStatusBadge status={lead.status} />
                    <span className="lead-card-chevron">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Double Down Drawer Panel */}
                {isExpanded && (
                  <div className="lead-card-drawer">
                    <div className="lead-card-divider" />
                    
                    <div className="lead-drawer-metadata">
                      <p><strong>Mobile:</strong> {lead.mobile}</p>
                      <p><strong>Sales rep:</strong> {lead.assigned_sales_rep_name ?? "Unassigned"}</p>
                      <p><strong>Created:</strong> {new Date(lead.created_at).toLocaleDateString()}</p>
                    </div>

                    <div className="lead-drawer-communication">
                      <a href={`tel:${lead.mobile}`} className="comm-btn call-btn">
                        📞 Call Client
                      </a>
                      <a
                        href={`https://wa.me/${lead.mobile.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="comm-btn wa-btn"
                      >
                        💬 WhatsApp
                      </a>
                    </div>

                    <div className="lead-drawer-actions">
                      <button
                        className="drawer-action-btn"
                        onClick={() => navigate(`/app/leads/${lead.lead_id}`)}
                      >
                        ℹ️ View Details
                      </button>

                      {quoteAction && (
                        <button
                          className="drawer-action-btn primary"
                          onClick={() => {
                            if (quoteAction === "generate") {
                              navigate(`/app/leads/${lead.lead_id}/quote`);
                            } else {
                              navigate(`/app/leads/${lead.lead_id}/quote`);
                            }
                          }}
                        >
                          📄 {quoteAction === "generate" ? "Generate Quote" : "View Quote"}
                        </button>
                      )}

                      {agreementAction && (
                        <button
                          className="drawer-action-btn primary"
                          onClick={() => navigate(`/app/leads/${lead.lead_id}/agreement`)}
                        >
                          ✍️ {agreementAction === "generate" ? "Create Agreement" : "View Agreement"}
                        </button>
                      )}

                      {lead.project_id != null && (
                        <button
                          className="drawer-action-btn success"
                          onClick={() => navigate(`/app/projects/${lead.project_id}`)}
                        >
                          🏗️ View Project
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {!loading && !loadError && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
      )}
    </div>
  );
}
