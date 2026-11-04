import { useState, useEffect } from "react";
import {
  getLeadStates,
  saveLeadStates,
  getAgentCommissions,
  saveAgentCommissions,
} from "../../lib/epcAgentStorage";
import { listEntityUsers, type EntityUser } from "../../api/entityUsers";
import { useAuth } from "../../lib/AuthContext";
import { putAgentConfig, putCommissionRule, syncAgentWorkspace } from "../../api/agentWorkspace";
import { ApiError } from "../../api/client";
import "./EpcAgents.css";

export default function EpcConfigPage() {
  const { user } = useAuth();
  const entityId = user?.entity_id;

  const [activeTab, setActiveTab] = useState<"states" | "rates">("states");

  // State Management
  const [states, setStates] = useState<string[]>([]);
  const [newState, setNewState] = useState("");

  // Rates Management
  const [agents, setAgents] = useState<EntityUser[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);

  // Feedback flags
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  useEffect(() => {
    setStates(getLeadStates());
    setCommissions(getAgentCommissions());
    // Backend is the source of truth (stages + rules shared with the agents).
    if (user)
      syncAgentWorkspace(user).then(() => {
        setStates(getLeadStates());
        setCommissions(getAgentCommissions());
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.entity_id]);

  async function persistStages(updated: string[], message: string) {
    const previous = states;
    setStates(updated);
    try {
      if (entityId) await putAgentConfig(entityId, updated);
      saveLeadStates(updated);
      triggerFeedback(message);
    } catch (err) {
      setStates(previous);
      alert(err instanceof ApiError ? err.message : "Failed to save the stages");
    }
  }

  // Rules persist on the backend.
  async function persistRule(agentId: number, rule: { type: string; value: number }) {
    try {
      if (entityId) await putCommissionRule(entityId, agentId, rule);
      triggerFeedback("Agent commission rule updated!");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to save the commission rule");
    }
  }

  // Fetch agents
  useEffect(() => {
    if (entityId) {
      listEntityUsers(entityId)
        .then((res) => {
          const dbAgents = res.items.filter((u) => u.roles.includes("ENTITY_AGENT"));
          setAgents(dbAgents);
        })
        .catch(() => {
          setAgents([]);
        });
    } else {
      setAgents([]);
    }
  }, [entityId]);

  // States Handlers
  function handleAddState() {
    const trimmed = newState.trim().toUpperCase().replace(/\s+/g, "_");
    if (!trimmed) return;
    if (states.includes(trimmed)) return;
    const updated = [...states, trimmed];
    setNewState("");
    persistStages(updated, "Project stages updated!");
  }

  function handleDeleteState(index: number) {
    if (states.length <= 2) {
      alert("An EPC must have at least 2 pipeline states.");
      return;
    }
    persistStages(states.filter((_, i) => i !== index), "Project stage deleted!");
  }

  function handleMoveState(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === states.length - 1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const updated = [...states];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    persistStages(updated, "Project stages re-ordered!");
  }

  // Rates Handlers
  function handleRateChange(agentId: number, field: "type" | "value", val: any, persist = true) {
    const updated = [...commissions];
    const index = updated.findIndex((c) => c.agentId === agentId);

    if (index !== -1) {
      updated[index] = { ...updated[index], [field]: val };
    } else {
      updated.push({ agentId, type: "PERCENT", value: 0, [field]: val });
    }

    setCommissions(updated);
    saveAgentCommissions(updated);
    // Selects persist at once; the number box persists on blur (not per keystroke).
    if (persist) persistRule(agentId, updated.find((c) => c.agentId === agentId));
  }

  function triggerFeedback(msg: string) {
    setSavedFeedback(msg);
    setTimeout(() => setSavedFeedback(null), 3000);
  }

  return (
    <div className="epc-config-page">
      <div className="epc-dashboard-header">
        <h1>EPC Operations Configuration</h1>
        <p className="subtitle">Set custom funnel statuses, establish agent commission rates, and manage terminal locked milestones.</p>
      </div>

      <div className="amc-filters">
        <button className={activeTab === "states" ? "active" : ""} onClick={() => setActiveTab("states")}>
          Configurable Lead States
        </button>
        <button className={activeTab === "rates" ? "active" : ""} onClick={() => setActiveTab("rates")}>
          Agent Commission Rules
        </button>
        {savedFeedback && (
          <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 500, marginLeft: "auto", alignSelf: "center" }}>
            ✓ {savedFeedback}
          </span>
        )}
      </div>

      <div className="epc-panel">
        {activeTab === "states" && (
          <div className="states-config-workspace">
            <h3>Pipeline Funnel Customizer</h3>
            <p className="section-desc" style={{ marginBottom: 20 }}>
              Add and arrange pipeline phases. The <strong>bottom-most stage</strong> is automatically treated as the <strong>Terminal (Locked) state</strong>. Leads reaching this state cannot be reverted.
            </p>

            <ul className="amc-inclusion-editor-list" style={{ maxWidth: 480 }}>
              {states.map((st, i) => {
                const isTerminal = i === states.length - 1;
                return (
                  <li key={st} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: isTerminal ? "#ecfdf5" : "var(--app-bg)", border: isTerminal ? "1px solid #10b981" : "1px solid var(--app-border)" }}>
                    <span style={{ fontWeight: isTerminal ? 600 : 500, color: isTerminal ? "#065f46" : "var(--app-text)" }}>
                      {st} {isTerminal ? " 🔒 (Terminal / Locked)" : ""}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="mini-arrow-btn" onClick={() => handleMoveState(i, "up")} disabled={i === 0}>▲</button>
                      <button className="mini-arrow-btn" onClick={() => handleMoveState(i, "down")} disabled={i === states.length - 1}>▼</button>
                      <button className="mini-delete-btn" onClick={() => handleDeleteState(i)}>×</button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="epc-form-inline" style={{ marginTop: 20, display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="E.G. TECHNICAL_SURVEY_COMPLETED"
                value={newState}
                onChange={(e) => setNewState(e.target.value)}
                className="epc-input"
                style={{ textTransform: "uppercase", maxWidth: 300 }}
              />
              <button className="entity-btn primary" onClick={handleAddState}>
                + Add Stage
              </button>
            </div>
          </div>
        )}

        {activeTab === "rates" && (
          <div className="rates-config-workspace">
            <h3>Custom Agent Commission Matrix</h3>
            <p className="section-desc" style={{ marginBottom: 20 }}>
              Configure individual payment rules for each agent. Commissions trigger automatically when deals reach ordered/terminal states.
            </p>

            {agents.length === 0 ? (
              <div className="empty-state">No registered agents found. Go to the Users tab to onboard your first Agent.</div>
            ) : (
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>Agent Name</th>
                    <th>Email Address</th>
                    <th>Commission Type</th>
                    <th>Payout Standard (INR or %)</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((ag) => {
                    const rule = commissions.find((c) => c.agentId === ag.user_id) || { type: "PERCENT", value: 0 };
                    return (
                      <tr key={ag.user_id}>
                        <td><strong>{ag.full_name}</strong></td>
                        <td>{ag.email}</td>
                        <td>
                          <select
                            value={rule.type}
                            onChange={(e) => handleRateChange(ag.user_id, "type", e.target.value)}
                            className="mini-select"
                          >
                            <option value="PERCENT">% of Total Revenue</option>
                            <option value="FIXED">Fixed Flat Amount</option>
                          </select>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              type="number"
                              value={rule.value}
                              onChange={(e) => handleRateChange(ag.user_id, "value", parseFloat(e.target.value) || 0, false)}
                              onBlur={() => persistRule(ag.user_id, rule)}
                              className="epc-input"
                              style={{ maxWidth: 100, padding: "4px 8px", fontSize: 13 }}
                            />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>
                              {rule.type === "PERCENT" ? "%" : "INR"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
