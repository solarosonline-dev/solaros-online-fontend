import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import {
  getLeadStates,
  getLeadCustomStates,
  getLeadDealValues,
  getLeadAssignments,
  saveLeadCustomStates,
  saveLeadDealValues,
  saveLeadAssignments,
  MOCK_AGENTS,
  MOCK_LEADS,
} from "../../lib/epcAgentStorage";
import { listLeads, type Lead } from "../../api/leads";
import { listEntityUsers, type EntityUser } from "../../api/entityUsers";
import { isAgent } from "../../lib/roles";
import { formatMoney } from "../../lib/money";
import "./EpcAgents.css";

export default function EpcAgentLeadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const entityId = user?.entity_id;
  const isAgentUser = user ? isAgent(user.roles) : false;
  const loggedInUserId = user?.user_id || 9901;

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

  // Editing state trigger modal
  const [updatingLeadId, setUpdatingLeadId] = useState<number | null>(null);
  const [selectedState, setSelectedState] = useState("");
  const [dealValueInput, setDealValueInput] = useState("");

  useEffect(() => {
    setCustomStates(getLeadCustomStates());
    setDealValues(getLeadDealValues());
    setAssignments(getLeadAssignments());
  }, []);

  // Fetch leads + agents
  useEffect(() => {
    let cancelled = false;
    if (entityId) {
      Promise.all([listLeads(entityId), listEntityUsers(entityId)])
        .then(([leadsRes, usersRes]) => {
          if (!cancelled) {
            const dbLeads = leadsRes.items;
            const mockLeadsMapped = MOCK_LEADS.map(ml => ({
              lead_id: ml.lead_id,
              name: ml.name,
              mobile: ml.mobile,
              status: "NEW" as const,
              created_at: ml.created_at,
              project_id: null,
            }));
            setLeads([...dbLeads, ...mockLeadsMapped]);

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
  }, [entityId]);

  // Filter leads appropriately
  const displayedLeads = isAgentUser
    ? leads.filter((l) => assignments[l.lead_id] === loggedInUserId)
    : leads;

  function handleAssignAgent(leadId: number, agentId: number) {
    const updated = { ...assignments, [leadId]: agentId };
    setAssignments(updated);
    saveLeadAssignments(updated);
  }

  function handleStateChangeTrigger(leadId: number, newState: string) {
    setUpdatingLeadId(leadId);
    setSelectedState(newState);
    setDealValueInput(String(dealValues[leadId] || ""));
  }

  function handleStateSave() {
    if (!updatingLeadId) return;

    // Save custom state
    const nextStates = { ...customStates, [updatingLeadId]: selectedState };
    setCustomStates(nextStates);
    saveLeadCustomStates(nextStates);

    // Save deal value if it is a realized revenue state
    if (selectedState === orderState || selectedState === terminalState) {
      const val = parseFloat(dealValueInput) || 0;
      const nextValues = { ...dealValues, [updatingLeadId]: val };
      setDealValues(nextValues);
      saveLeadDealValues(nextValues);
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
            ? "Track and advance your leads. Once a lead is in Terminal State, its state is locked."
            : "Review, assign to agents, and update lead phases across your entire organization."}
        </p>
      </div>

      <div className="epc-leads-panel">
        {displayedLeads.length === 0 ? (
          <div className="empty-state">No leads found in your portfolio.</div>
        ) : (
          <div className="table-wrapper">
            <table className="leads-table">
              <thead>
                <tr>
                  <th>Lead ID</th>
                  <th>Customer Name</th>
                  <th>Mobile</th>
                  <th>Current State</th>
                  {!isAgentUser && <th>Assigned Agent</th>}
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
                      <td>L-{l.lead_id}</td>
                      <td>
                        <strong
                          style={{ color: "var(--app-accent)", cursor: "pointer", textDecoration: "underline" }}
                          onClick={() => navigate(`/app/leads/${l.lead_id}`)}
                        >
                          {l.name}
                        </strong>
                      </td>
                      <td>{l.mobile}</td>
                      <td>
                        <span className={`badge state-${state}`}>
                          {state} {isTerminal && "🔒"}
                        </span>
                      </td>
                      {!isAgentUser && (
                        <td>
                          <select
                            value={assignedId || ""}
                            onChange={(e) => handleAssignAgent(l.lead_id, Number(e.target.value))}
                            className="mini-select"
                          >
                            <option value="">-- Unassigned --</option>
                            {agents.map((ag) => (
                              <option key={ag.user_id} value={ag.user_id}>
                                {ag.full_name}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td>{dealValues[l.lead_id] ? formatMoney(dealValues[l.lead_id], "INR") : "—"}</td>
                      <td>
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

            {(selectedState === orderState || selectedState === terminalState) && (
              <div className="epc-form-group">
                <label>Realized Deal Value (INR)</label>
                <input
                  type="number"
                  placeholder="Enter total contract value"
                  value={dealValueInput}
                  onChange={(e) => setDealValueInput(e.target.value)}
                  className="epc-input"
                />
                <span className="input-hint">Commission calculations are derived directly from this value.</span>
              </div>
            )}

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
