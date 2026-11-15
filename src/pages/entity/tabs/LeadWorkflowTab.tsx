import { useState, useEffect } from "react";
import { getLeadStates, saveLeadStates } from "../../../lib/epcAgentStorage";
import { useAuth } from "../../../lib/AuthContext";
import { putAgentConfig, syncAgentWorkspace } from "../../../api/agentWorkspace";
import { formatStageLabel, getLeadWorkflow, putLeadWorkflow } from "../../../api/leads";
import { hasFeature } from "../../../lib/roles";
import { ApiError } from "../../../api/client";
import "../../epc-agents/EpcAgents.css";

export default function LeadWorkflowTab() {
  const { user } = useAuth();
  const entityId = user?.entity_id;
  const crm = hasFeature(user, "CRM");
  const hasAgents = hasFeature(user, "AGENTS");

  // State Management
  const [states, setStates] = useState<string[]>([]);
  const [newState, setNewState] = useState("");

  // Feedback flags
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  useEffect(() => {
    setStates(getLeadStates());
    // Backend is the source of truth (stages + rules shared with the agents).
    if (crm && entityId) {
      getLeadWorkflow(entityId).then((res) => setStates(res.stages)).catch(() => {});
    }
    if (user && hasAgents)
      syncAgentWorkspace(user).then(() => {
        setStates(getLeadStates());
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.entity_id]);

  async function persistStages(updated: string[], message: string) {
    const previous = states;
    setStates(updated);
    try {
      // CRM entities save through the lead-workflow route (no AGENTS needed);
      // agent-only entities through the agent config route -- same stored list.
      if (entityId) await (crm ? putLeadWorkflow(entityId, updated) : putAgentConfig(entityId, updated));
      saveLeadStates(updated);
      triggerFeedback(message);
    } catch (err) {
      setStates(previous);
      alert(err instanceof ApiError ? err.message : "Failed to save the workflow");
    }
  }

  // States Handlers
  function handleAddState() {
    const trimmed = newState.trim().toUpperCase().replace(/\s+/g, "_");
    if (!trimmed) return;
    if (states.includes(trimmed)) return;
    const updated = [...states, trimmed];
    setNewState("");
    persistStages(updated, "Lead workflow updated!");
  }

  function handleDeleteState(index: number) {
    if (states.length <= 2) {
      alert("A lead workflow needs at least 2 stages.");
      return;
    }
    persistStages(states.filter((_, i) => i !== index), "Stage removed!");
  }

  function handleMoveState(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === states.length - 1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const updated = [...states];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    persistStages(updated, "Stages re-ordered!");
  }

  function triggerFeedback(msg: string) {
    setSavedFeedback(msg);
    setTimeout(() => setSavedFeedback(null), 3000);
  }

  return (
    <div className="epc-config-page">
      <div className="epc-panel">
        {(
          <div className="states-config-workspace">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Workflow Stages</h3>
              {savedFeedback && (
                <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 500, marginLeft: "auto" }}>✓ {savedFeedback}</span>
              )}
            </div>
            <p className="section-desc" style={{ marginBottom: 20 }}>
              Add, remove and re-order the stages. Leads move forward automatically when a quote or agreement is generated, an agreement is accepted, or the project completes (stages named PROPOSAL_SENT, AGREEMENT, PROJECT_EXECUTION and COMPLETED).
              {hasAgents && <> The <strong>last two stages</strong> are the ones where agents earn commission (set the rates under Agent Config).</>}
            </p>

            <ul className="amc-inclusion-editor-list" style={{ maxWidth: 480 }}>
              {states.map((st, i) => {
                const isTerminal = i === states.length - 1;
                return (
                  <li key={st} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: isTerminal ? "#ecfdf5" : "var(--app-bg)", border: isTerminal ? "1px solid #10b981" : "1px solid var(--app-border)" }}>
                    <span style={{ fontWeight: isTerminal ? 600 : 500, color: isTerminal ? "#065f46" : "var(--app-text)" }}>
                      {formatStageLabel(st)} {isTerminal ? " (final stage)" : ""}
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
                placeholder="E.G. SITE_SURVEY"
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

      </div>
    </div>
  );
}
