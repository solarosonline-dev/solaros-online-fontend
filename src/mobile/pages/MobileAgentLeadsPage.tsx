import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { syncAgentWorkspace } from "../../api/agentWorkspace";
import {
  getLeadAssignments,
  getLeadCustomStates,
  getLeadDealValues,
  getLeadStates,
  syncAssignmentsFromLeads,
} from "../../lib/epcAgentStorage";
import { leadsAccess, listLeads, updateLeadStage, type Lead } from "../../api/leads";
import { ApiError } from "../../api/client";
import { listEntityUsers, type EntityUser } from "../../api/entityUsers";
import { isAgent } from "../../lib/roles";
import { formatMoney } from "../../lib/money";
import FullScreenForm from "../../components/FullScreenForm";
import MobileSelect from "../../components/MobileSelect";
import SearchableSelect from "../../components/SearchableSelect";
import NumberField from "../../components/NumberField";
import { stageBadgeClass, stageLabel } from "./agentWorkspaceUi";
import "./MobileAgentPages.css";

const PROPOSAL_STATE = "PROPOSAL_SENT";

export default function MobileAgentLeadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const entityId = user?.entity_id;
  const isAgentUser = user ? isAgent(user.roles) : false;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<EntityUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState<number | "">("");
  const [customStates, setCustomStates] = useState<Record<number, string>>({});
  const [dealValues, setDealValues] = useState<Record<number, number>>({});
  const [, setAssignments] = useState<Record<number, number>>({});
  const [, setSyncTick] = useState(0);

  const [editId, setEditId] = useState<number | null>(null);
  const [stage, setStage] = useState("");
  const [dealValue, setDealValue] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (user) syncAgentWorkspace(user).then(() => setSyncTick((t) => t + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.entity_id, user?.user_id]);

  useEffect(() => {
    let cancelled = false;
    if (!entityId) {
      setLoading(false);
      return;
    }
    // An ENTITY_AGENT can't list entity users (403), so skip that call for them.
    Promise.all([
      listLeads(entityId, { created_by_user_id: agentFilter || undefined, page_size: 200 }, leadsAccess(user)),
      isAgentUser ? Promise.resolve({ items: [] as EntityUser[] }) : listEntityUsers(entityId),
    ])
      .then(([leadsRes, usersRes]) => {
        if (cancelled) return;
        syncAssignmentsFromLeads(
          leadsRes.items.map((l) => ({
            lead_id: l.lead_id,
            created_by_user_id: isAgentUser ? user?.user_id : l.created_by_user_id,
            agent_stage: l.agent_stage,
            deal_value: l.deal_value,
          })),
        );
        setAssignments(getLeadAssignments());
        setCustomStates(getLeadCustomStates());
        setDealValues(getLeadDealValues());
        setLeads(leadsRes.items);
        setAgents(usersRes.items.filter((u) => u.roles.includes("ENTITY_AGENT")));
      })
      .catch(() => {
        if (!cancelled) {
          setLeads([]);
          setAgents([]);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, agentFilter]);

  const leadStates = getLeadStates();
  const terminal = leadStates[leadStates.length - 1];
  const order = leadStates[leadStates.length - 2];
  const needsDealValue = stage === PROPOSAL_STATE || stage === order || stage === terminal;
  const editing = leads.find((l) => l.lead_id === editId) ?? null;

  const valueStage = (st: string) => st === PROPOSAL_STATE || st === order || st === terminal;

  // Stages that carry a deal value open the form to collect it; the rest save
  // straight from the dropdown.
  function pickStage(l: Lead, next: string) {
    if (isAgentUser) return;
    setSaveError(null);
    setListError(null);
    if (valueStage(next)) {
      setEditId(l.lead_id);
      setStage(next);
      setDealValue(dealValues[l.lead_id] || 0);
    } else {
      void save(l.lead_id, next, false);
    }
  }

  async function save(id: number | null = editId, nextStage: string = stage, withValue: boolean = needsDealValue) {
    if (!id || !entityId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await updateLeadStage(entityId, id, {
        stage: nextStage,
        ...(withValue ? { deal_value: dealValue } : {}),
      });
      syncAssignmentsFromLeads([
        { lead_id: saved.lead_id, agent_stage: saved.agent_stage, deal_value: saved.deal_value },
      ]);
      setCustomStates(getLeadCustomStates());
      setDealValues(getLeadDealValues());
      setEditId(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to update the lead";
      setSaveError(msg);
      setListError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="m-empty">Loading leads…</div>;

  return (
    <div className="m-page">
      <div className="m-page-title">
        <h1>{isAgentUser ? "My leads" : "All leads"}</h1>
        <button type="button" className="m-btn primary sm" onClick={() => navigate("/app/leads/new")}>
          + Add lead
        </button>
      </div>

      {!isAgentUser && agents.length > 0 && (
        <div className="m-filter-row">
          <button type="button" className={`m-chip${agentFilter === "" ? " active" : ""}`} onClick={() => setAgentFilter("")}>
            All
          </button>
          <SearchableSelect
            ariaLabel="Filter by agent"
            placeholder={`Search ${agents.length} agents…`}
            value={agentFilter === "" ? "" : String(agentFilter)}
            options={agents.map((ag) => ({ value: String(ag.user_id), label: ag.full_name }))}
            onChange={(v) => setAgentFilter(Number(v))}
          />
        </div>
      )}

      {listError && !editing && <p className="m-status error">{listError}</p>}

      {leads.length === 0 ? (
        <div className="m-empty">No leads found.</div>
      ) : (
        <div className="m-list">
          {leads.map((l) => {
            const rejected = l.status === "REJECTED";
            const st = rejected ? "REJECTED" : customStates[l.lead_id] || "NEW";
            const dv = dealValues[l.lead_id];
            const locked = rejected || st === terminal;
            const stageOptions = leadStates.map((s) => ({ value: s, label: stageLabel(s) }));
            if (!stageOptions.some((o) => o.value === st)) stageOptions.unshift({ value: st, label: stageLabel(st) });
            return (
              <div className="m-card" key={l.lead_id}>
                <div className="m-card-top" onClick={() => navigate(`/app/leads/${l.lead_id}`)}>
                  <span className="m-card-title">{l.name}</span>
                  <span className={stageBadgeClass(st, terminal)}>{stageLabel(st)}</span>
                </div>
                <div className="m-card-sub">
                  {l.mobile}
                  {!isAgentUser && l.created_by_name ? ` · ${l.created_by_name}` : ""}
                  {dv ? ` · ${formatMoney(dv, "INR")}` : ""}
                </div>
                {!isAgentUser && (
                  <div className="m-card-actions">
                    <MobileSelect
                      compact
                      ariaLabel={`Stage for ${l.name}`}
                      value={st}
                      options={stageOptions}
                      disabled={locked || saving}
                      onChange={(v) => pickStage(l, v)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <FullScreenForm
          title="Update stage"
          onClose={() => setEditId(null)}
          footer={
            <button type="button" className="m-btn primary block" disabled={saving} onClick={() => save()}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          }
        >
          <p className="m-fs-hint">{editing.name}</p>
          <div className="m-kv" style={{ marginBottom: 16 }}>
            <span className="m-kv-label">Moving to</span>
            <span className="m-kv-value">
              {stageLabel(stage)}
              {stage === terminal ? " (terminal, locks the lead)" : ""}
            </span>
          </div>
          {needsDealValue && (
            <div className="m-field">
              <label htmlFor="ma-deal">
                {stage === PROPOSAL_STATE ? "Proposed deal value (INR)" : "Realized deal value (INR)"}
              </label>
              <NumberField id="ma-deal" value={dealValue} onCommit={setDealValue} emptyValue={0} />
              <p className="ma-hint">
                {stage === PROPOSAL_STATE
                  ? "Shown for reference; commission is only calculated once the deal is won."
                  : "Commission is calculated from this value."}
              </p>
            </div>
          )}
          {saveError && <p className="m-status error">{saveError}</p>}
        </FullScreenForm>
      )}
    </div>
  );
}
