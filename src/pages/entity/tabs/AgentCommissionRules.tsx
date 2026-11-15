import { useState, useEffect } from "react";
import { getAgentCommissions, saveAgentCommissions, getLeadStates } from "../../../lib/epcAgentStorage";
import { listEntityUsers, type EntityUser } from "../../../api/entityUsers";
import { useAuth } from "../../../lib/AuthContext";
import { putCommissionRule, syncAgentWorkspace } from "../../../api/agentWorkspace";
import { ApiError } from "../../../api/client";
import { formatStageLabel } from "../../../api/leads";
import "../../epc-agents/EpcAgents.css";

// Per-agent commission rules (type + value). Lives under Entity Settings ->
// Agent Config; the stages that decide *when* commission is earned (the last
// two) are edited in the Lead Workflow tab. Every change persists at once.
export default function AgentCommissionRules() {
  const { user } = useAuth();
  const entityId = user?.entity_id;

  const [agents, setAgents] = useState<EntityUser[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  useEffect(() => {
    setCommissions(getAgentCommissions());
    // Backend is the source of truth for the rules.
    if (user) syncAgentWorkspace(user).then(() => setCommissions(getAgentCommissions()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.entity_id]);

  useEffect(() => {
    if (!entityId) {
      setAgents([]);
      return;
    }
    listEntityUsers(entityId)
      .then((res) => setAgents(res.items.filter((u) => u.roles.includes("ENTITY_AGENT"))))
      .catch(() => setAgents([]));
  }, [entityId]);

  function triggerFeedback(msg: string) {
    setSavedFeedback(msg);
    setTimeout(() => setSavedFeedback(null), 3000);
  }

  async function persistRule(agentId: number, rule: { type: string; value: number }) {
    try {
      if (entityId) await putCommissionRule(entityId, agentId, rule);
      triggerFeedback("Agent commission rule updated!");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to save the commission rule");
    }
  }

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

  const finalStages = getLeadStates().slice(-2);

  return (
    <div className="epc-panel">
      <div className="rates-config-workspace">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Agent Commission Rules</h3>
          {savedFeedback && (
            <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 500, marginLeft: "auto" }}>✓ {savedFeedback}</span>
          )}
        </div>
        <p className="section-desc" style={{ marginBottom: 20 }}>
          Configure individual payment rules for each agent. Commission is earned automatically once a lead reaches one of the last two workflow stages ({finalStages.map(formatStageLabel).join(" and ")} — change them in the Lead Workflow tab).
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
    </div>
  );
}
