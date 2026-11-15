import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { formatStageLabel, listLeads, listSalesReps, type Lead, type SalesRepList } from "../../api/leads";
import { canManageLeads, hasFeature, isAgent } from "../../lib/roles";
import { ApiError } from "../../api/client";
import { LeadStageBadge } from "../../pages/leads/leadFunnel";
import { useLeadWorkflow } from "../../lib/useLeadWorkflow";
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
  // A workflow stage name, "REJECTED", or "" for every lead (same as web).
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { stages } = useLeadWorkflow(entityId);
  // Admins/sales managers can narrow by sales rep ("" = all, "unassigned", or a user id);
  // a rep's list is already limited to their own leads by the backend.
  const manager = canManageLeads(user!.roles);
  const [repFilter, setRepFilter] = useState<string>("");
  const [reps, setReps] = useState<SalesRepList | null>(null);
  const hasAgents = hasFeature(user, "AGENTS");
  const [page, setPage] = useState(1);
  const [expandedLeadId, setExpandedLeadId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    listLeads(
      entityId,
      {
        status: statusFilter === "REJECTED" ? "REJECTED" : undefined,
        stage: statusFilter && statusFilter !== "REJECTED" ? statusFilter : undefined,
        sales_rep_id: repFilter && repFilter !== "unassigned" ? Number(repFilter) : undefined,
        unassigned: repFilter === "unassigned" || undefined,
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

  useEffect(load, [entityId, statusFilter, search, page, repFilter]);

  useEffect(() => {
    if (!manager || !hasFeature(user, "CRM")) return;
    listSalesReps(entityId)
      .then(setReps)
      .catch(() => setReps(null));
  }, [entityId, manager]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickRep(value: string) {
    setRepFilter((prev) => (prev === value ? "" : value));
    setPage(1);
    setExpandedLeadId(null);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
    setExpandedLeadId(null);
  }

  function toggleExpand(leadId: number) {
    setExpandedLeadId((prev) => (prev === leadId ? null : leadId));
  }

  const stageChips: { label: string; value: string }[] = [
    { label: "All", value: "" },
    ...stages.map((st) => ({ label: formatStageLabel(st), value: st })),
    { label: "Rejected", value: "REJECTED" },
  ];

  return (
    <div className="mobile-leads-page">
      <div className="mobile-leads-header">
        <h1>
          Leads
          {!loading && !loadError && <span className="mobile-leads-count">{total}</span>}
        </h1>
        <button
          className="mobile-btn-add-primary"
          onClick={() => navigate("/app/leads/new")}
        >
          + Add lead
        </button>
      </div>

      {/* Search sits right under the title; both filter rows scroll sideways
          so they cost one line each instead of wrapping. */}
      <form className="mobile-leads-search" onSubmit={handleSearchSubmit}>
        <input
          type="search"
          placeholder="Search name or phone…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </form>

      <div className="mobile-leads-filter-scroll" role="group" aria-label="Filter by stage">
        {stageChips.map((item) => (
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

      {manager && reps && (reps.items.length > 0 || reps.unassigned_count > 0) && (
        <div className="mobile-leads-filter-scroll rep" role="group" aria-label="Filter by sales rep">
          {reps.items.map((r) => (
            <button
              key={r.user_id}
              type="button"
              className={`mobile-rep-chip ${repFilter === String(r.user_id) ? "selected" : ""}`}
              aria-pressed={repFilter === String(r.user_id)}
              onClick={() => pickRep(String(r.user_id))}
            >
              <span className="mobile-rep-chip-name">{r.full_name}</span>
              <span className="mobile-rep-chip-count">{r.open_count}/{r.assigned_count}</span>
            </button>
          ))}
          <button
            type="button"
            className={`mobile-rep-chip unassigned ${repFilter === "unassigned" ? "selected" : ""}`}
            aria-pressed={repFilter === "unassigned"}
            onClick={() => pickRep("unassigned")}
          >
            <span className="mobile-rep-chip-name">Unassigned</span>
            <span className="mobile-rep-chip-count">{reps.unassigned_count}</span>
          </button>
        </div>
      )}

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
                  {/* Two lines: who + stage, then phone/date with the sales rep
                      pushed to the right edge (the space that used to hold an
                      id and a chevron). */}
                  <div className="lead-card-row">
                    <h3>{lead.name}</h3>
                    <LeadStageBadge stage={lead.agent_stage} rejected={lead.status === "REJECTED"} />
                  </div>
                  <div className="lead-card-row sub">
                    <span className="lead-card-meta">
                      {lead.mobile} · {new Date(lead.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </span>
                    <span className={`lead-card-rep${lead.assigned_sales_rep_name ? "" : " none"}`}>
                      {lead.assigned_sales_rep_name ?? "Unassigned"}
                    </span>
                  </div>
                </div>

                {/* Double Down Drawer Panel */}
                {isExpanded && (
                  <div className="lead-card-drawer">
                    <div className="lead-drawer-metadata">
                      <p><strong>Lead</strong> #{lead.lead_id} · created {new Date(lead.created_at).toLocaleDateString()}</p>
                      {hasAgents && lead.created_by_name && <p><strong>Agent</strong> {lead.created_by_name}</p>}
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
