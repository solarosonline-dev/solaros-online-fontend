import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { syncAgentWorkspace } from "../../api/agentWorkspace";
import {
  getLeadStates,
  getLeadCustomStates,
  getLeadDealValues,
  getLeadAssignments,
  saveLeadCustomStates,
  saveLeadDealValues,
  syncAssignmentsFromLeads,
  MOCK_AGENTS,
  MOCK_LEADS,
} from "../../lib/epcAgentStorage";
import { leadsAccess, listLeads, updateLeadStage, type Lead } from "../../api/leads";
import { ApiError } from "../../api/client";
import { listEntityUsers, type EntityUser } from "../../api/entityUsers";
import { isAgent } from "../../lib/roles";
import { formatMoney } from "../../lib/money";
import "./EpcAgents.css";

const PROPOSAL_STATE = "PROPOSAL_SENT";

export default function EpcAgentLeadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const entityId = user?.entity_id;
  const isAgentUser = user ? isAgent(user.roles) : false;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<EntityUser[]>([]);
  const [loading, setLoading] = useState(true);

  // States from Config
  const leadStates = getLeadStates();
  const terminalState = leadStates[leadStates.length - 1];
  const orderState = leadStates[leadStates.length - 2];

  // Local storage state references
  const [customStates, setCustomStates] = useState<Record<number, string>>({});
  const [dealValues, setDealValues] = useState<Record<number, number>>({});
  const [assignments, setAssignments] = useState<Record<number, number>>({});
  // Admin: view one agent's leads (server-side filter on who added the lead)
  const [agentFilter, setAgentFilter] = useState<number | "">("");

  // Editing state trigger modal
  const [updatingLeadId, setUpdatingLeadId] = useState<number | null>(null);
  const [selectedState, setSelectedState] = useState("");
  const [dealValueInput, setDealValueInput] = useState("");

  useEffect(() => {
    setCustomStates(getLeadCustomStates());
    setDealValues(getLeadDealValues());
    setAssignments(getLeadAssignments());
  }, []);

  // Stages, commission rules and payouts come from the backend (shared with the
  // admin/agent on the other side); re-render once mirrored.
  const [, setSyncTick] = useState(0);
  useEffect(() => {
    if (user) syncAgentWorkspace(user).then(() => setSyncTick((t) => t + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.entity_id, user?.user_id]);

  // Fetch leads + agents
  useEffect(() => {
    let cancelled = false;
    if (entityId) {
      // An ENTITY_AGENT can't list entity users (403 -- the list only feeds the
      // admin assign-to-agent dropdown), and the backend already returns just
      // their own leads. Skipping the call matters: a rejected Promise.all
      // would drop into the catch below and replace the real leads with mocks.
      Promise.all([
        listLeads(entityId, { created_by_user_id: agentFilter || undefined, page_size: 200 }, leadsAccess(user)),
        isAgentUser ? Promise.resolve({ items: [] as EntityUser[] }) : listEntityUsers(entityId),
      ])
        .then(([leadsRes, usersRes]) => {
          if (!cancelled) {
            const dbLeads = leadsRes.items;
            // Assigned agent = whoever added the lead (agents see only their own).
            syncAssignmentsFromLeads(
              dbLeads.map((l) => ({
                lead_id: l.lead_id,
                created_by_user_id: isAgentUser ? user?.user_id : l.created_by_user_id,
                agent_stage: l.agent_stage,
                deal_value: l.deal_value,
              })),
            );
            setAssignments(getLeadAssignments());
            setCustomStates(getLeadCustomStates());
            setDealValues(getLeadDealValues());
            const mockLeadsMapped = MOCK_LEADS.map(ml => ({
              lead_id: ml.lead_id,
              name: ml.name,
              mobile: ml.mobile,
              status: "NEW" as const,
              created_at: ml.created_at,
              project_id: null,
            }));
            setLeads(isAgentUser || agentFilter !== "" ? dbLeads : [...dbLeads, ...mockLeadsMapped]);

            const dbAgents = usersRes.items.filter((u) => u.roles.includes("ENTITY_AGENT"));
            const mockAgentsMapped = MOCK_AGENTS.map(ma => ({
              user_id: ma.user_id,
              full_name: ma.full_name,
              email: ma.email,
              phone: ma.phone,
              roles: ma.roles,
              state: "ACTIVE",
            }));
            setAgents([...dbAgents, ...mockAgentsMapped]);
          }
        })
        .catch(() => {
          if (!cancelled) {
            const mockLeadsMapped = MOCK_LEADS.map(ml => ({
              lead_id: ml.lead_id,
              name: ml.name,
              mobile: ml.mobile,
              status: "NEW" as const,
              created_at: ml.created_at,
              project_id: null,
            }));
            setLeads(mockLeadsMapped);

            const mockAgentsMapped = MOCK_AGENTS.map(ma => ({
              user_id: ma.user_id,
              full_name: ma.full_name,
              email: ma.email,
              phone: ma.phone,
              roles: ma.roles,
              state: "ACTIVE",
            }));
            setAgents(mockAgentsMapped);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      const mockLeadsMapped = MOCK_LEADS.map(ml => ({
        lead_id: ml.lead_id,
        name: ml.name,
        mobile: ml.mobile,
        status: "NEW" as const,
        created_at: ml.created_at,
        project_id: null,
      }));
      setLeads(mockLeadsMapped);

      const mockAgentsMapped = MOCK_AGENTS.map(ma => ({
        user_id: ma.user_id,
        full_name: ma.full_name,
        email: ma.email,
        phone: ma.phone,
        roles: ma.roles,
        state: "ACTIVE",
      }));
      setAgents(mockAgentsMapped);
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [entityId, agentFilter]);

  // Filter leads appropriately
  // Agents: the backend already returns only the leads they created.
  const displayedLeads = leads;

  function handleStateChangeTrigger(leadId: number, newState: string) {
    if (isAgentUser) return; // agents are view-only
    setUpdatingLeadId(leadId);
    setSelectedState(newState);
    setDealValueInput(String(dealValues[leadId] || ""));
  }

  const needsDealValue =
    selectedState === PROPOSAL_STATE || selectedState === orderState || selectedState === terminalState;

  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleStateSave() {
    if (!updatingLeadId || !entityId) return;
    setSaveError(null);

    // Deal value: the quoted value at PROPOSAL_SENT, the realized one at
    // order/terminal. Only the latter count as revenue/commission -- the
    // dashboards filter on state, so a proposal's value never inflates them.
    const val = needsDealValue ? parseFloat(dealValueInput) || 0 : undefined;

    // Demo leads only exist in this browser; real ones persist on the backend
    // so the agent sees the same stage and deal value.
    if (!MOCK_LEADS.some((m) => m.lead_id === updatingLeadId)) {
      try {
        const saved = await updateLeadStage(entityId, updatingLeadId, {
          stage: selectedState,
          ...(val !== undefined ? { deal_value: val } : {}),
        });
        syncAssignmentsFromLeads([{ lead_id: saved.lead_id, agent_stage: saved.agent_stage, deal_value: saved.deal_value }]);
      } catch (err) {
        setSaveError(err instanceof ApiError ? err.message : "Failed to update the lead");
        return;
      }
      setCustomStates(getLeadCustomStates());
      setDealValues(getLeadDealValues());
    } else {
      const nextStates = { ...customStates, [updatingLeadId]: selectedState };
      setCustomStates(nextStates);
      saveLeadCustomStates(nextStates);
      if (val !== undefined) {
        const nextValues = { ...dealValues, [updatingLeadId]: val };
        setDealValues(nextValues);
        saveLeadDealValues(nextValues);
      }
    }

    setUpdatingLeadId(null);
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--app-text-muted)" }}>Loading Leads...</div>;

  return (
    <div className="epc-leads-page">
      <div className="epc-dashboard-header">
        <h1 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {isAgentUser ? "My Leads Portfolio" : "All Leads Management"}
          <button className="leads-btn primary" onClick={() => navigate("/app/leads/new")}>
            + Add lead
          </button>
        </h1>
        <p className="subtitle">
          {isAgentUser
            ? "View the leads you've added. Lead stages are managed by your admin."
            : "Review, assign to agents, and update lead phases across your entire organization."}
        </p>
      </div>

      {!isAgentUser && (
        <div className="epc-filter-bar" style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px" }}>
          <label style={{ fontSize: 13, color: "var(--app-text-muted)" }}>Agent:</label>
          <select
            className="mini-select"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">All leads</option>
            {agents
              .filter((ag) => ag.user_id < 9000)
              .map((ag) => (
                <option key={ag.user_id} value={ag.user_id}>
                  {ag.full_name}'s leads
                </option>
              ))}
          </select>
          {agentFilter !== "" && (
            <button className="entity-btn" onClick={() => setAgentFilter("")}>
              Clear
            </button>
          )}
        </div>
      )}

      <div className="epc-leads-panel">
        {displayedLeads.length === 0 ? (
          <div className="empty-state">No leads found in your portfolio.</div>
        ) : (
          <div className="table-wrapper">
            <table className="leads-table stack-table">
              <thead>
                <tr>
                  <th>Lead ID</th>
                  <th>Customer Name</th>
                  <th>Mobile</th>
                  <th>Current State</th>
                  {!isAgentUser && <th>Agent (added by)</th>}
                  <th>Deal Value</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedLeads.map((l) => {
                  const state = customStates[l.lead_id] || "NEW";
                  const assignedId = assignments[l.lead_id];
                  const isTerminal = state === terminalState;

                  return (
                    <tr key={l.lead_id}>
                      <td data-label="Lead ID">L-{l.lead_id}</td>
                      <td data-label="Customer">
                        <strong
                          style={{ color: "var(--app-accent)", cursor: "pointer", textDecoration: "underline" }}
                          onClick={() => navigate(`/app/leads/${l.lead_id}`)}
                        >
                          {l.name}
                        </strong>
                      </td>
                      <td data-label="Mobile">{l.mobile}</td>
                      <td data-label="State">
                        <span className={`badge state-${state}`}>
                          {state} {isTerminal && "🔒"}
                        </span>
                      </td>
                      {!isAgentUser && (
                        <td data-label="Agent (added by)">
                          {(() => {
                            const creatorId = l.created_by_user_id ?? assignedId;
                            const creatorName =
                              l.created_by_name ?? agents.find((ag) => ag.user_id === assignedId)?.full_name;
                            return creatorName && creatorId ? (
                              <button
                                type="button"
                                title="View all leads by this agent"
                                onClick={() => setAgentFilter(creatorId)}
                                style={{ background: "none", border: 0, padding: 0, color: "var(--app-accent)", cursor: "pointer", textDecoration: "underline" }}
                              >
                                {creatorName}
                              </button>
                            ) : (
                              "—"
                            );
                          })()}
                        </td>
                      )}
                      <td data-label="Deal value">{dealValues[l.lead_id] ? formatMoney(dealValues[l.lead_id], "INR") : "—"}</td>
                      <td data-label="Stage">
                        {isAgentUser ? (
                          <span style={{ color: "var(--app-text-muted)" }}>View only</span>
                        ) : (
                          <select
                            value={state}
                            disabled={isTerminal}
                            onChange={(e) => handleStateChangeTrigger(l.lead_id, e.target.value)}
                            className={`mini-select state-select ${isTerminal ? "locked" : ""}`}
                          >
                            {leadStates.map((st) => (
                              <option key={st} value={st}>
                                {st} {st === terminalState ? " (Terminal)" : ""}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {updatingLeadId && (
        <div className="epc-modal-backdrop">
          <div className="epc-modal">
            <h3>Update Lead State</h3>
            <p>You are moving the lead to stage: <strong>{selectedState}</strong></p>

            {needsDealValue && (
              <div className="epc-form-group">
                <label>{selectedState === PROPOSAL_STATE ? "Proposed Deal Value (INR)" : "Realized Deal Value (INR)"}</label>
                <input
                  type="number"
                  placeholder={selectedState === PROPOSAL_STATE ? "Enter proposal value" : "Enter total contract value"}
                  value={dealValueInput}
                  onChange={(e) => setDealValueInput(e.target.value)}
                  className="epc-input"
                />
                <span className="input-hint">
                  {selectedState === PROPOSAL_STATE
                    ? "Shown for reference; commission is only calculated once the deal is won."
                    : "Commission calculations are derived directly from this value."}
                </span>
              </div>
            )}

            {saveError && <p style={{ color: "var(--app-danger, #b42318)", fontSize: 13 }}>{saveError}</p>}

            <div className="epc-modal-actions">
              <button className="entity-btn" onClick={() => setUpdatingLeadId(null)}>
                Cancel
              </button>
              <button className="entity-btn primary" onClick={handleStateSave}>
                Save Changes {selectedState === terminalState && "🔒"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
