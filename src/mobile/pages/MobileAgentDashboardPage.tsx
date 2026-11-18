import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { syncAgentWorkspace } from "../../api/agentWorkspace";
import {
  getEarnedCommission,
  getLeadAssignments,
  getLeadCustomStates,
  getLeadDealValues,
  getLeadStates,
  getPaidCommission,
  getPaymentRequests,
  syncAssignmentsFromLeads,
} from "../../lib/epcAgentStorage";
import { leadsAccess, listLeads, type Lead } from "../../api/leads";
import { formatMoney } from "../../lib/money";
import { stageBadgeClass, stageLabel } from "./agentWorkspaceUi";
import "./MobileAgentPages.css";

export default function MobileAgentDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const agentId = user?.user_id ?? 0;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setSyncTick] = useState(0);

  useEffect(() => {
    if (user) syncAgentWorkspace(user).then(() => setSyncTick((t) => t + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.entity_id, user?.user_id]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.entity_id) {
      setLoading(false);
      return;
    }
    listLeads(user.entity_id, {}, leadsAccess(user))
      .then((res) => {
        if (cancelled) return;
        syncAssignmentsFromLeads(res.items.map((l) => ({ ...l, created_by_user_id: user.user_id })));
        setLeads(res.items);
      })
      .catch(() => !cancelled && setLeads([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user?.entity_id]);

  if (loading) return <div className="m-empty">Loading dashboard…</div>;

  const leadStates = getLeadStates();
  const assignments = getLeadAssignments();
  const customStates = getLeadCustomStates();
  const dealValues = getLeadDealValues();
  const terminal = leadStates[leadStates.length - 1];
  const order = leadStates[leadStates.length - 2];
  const stageOf = (l: Lead) => customStates[l.lead_id] || "NEW";

  const myLeads = leads.filter((l) => assignments[l.lead_id] === agentId);
  const earned = getEarnedCommission(
    agentId,
    leads,
    JSON.parse(localStorage.getItem("epc_agents_commissions") || "[]"),
    leadStates,
    customStates,
    dealValues,
  );
  const paid = getPaidCommission(agentId, getPaymentRequests());
  const owed = Math.max(0, earned - paid);

  const now = new Date();
  const closed = myLeads.filter((l) => stageOf(l) === terminal || stageOf(l) === order);
  const mtdRevenue = closed
    .filter((l) => {
      const d = new Date(l.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, l) => s + (dealValues[l.lead_id] || 0), 0);
  const completed = myLeads.filter((l) => stageOf(l) === terminal).length;
  const active = myLeads.length - completed;

  const funnel = leadStates.map((s) => ({ name: s, count: myLeads.filter((l) => stageOf(l) === s).length }));
  const maxCount = Math.max(1, ...funnel.map((f) => f.count));

  return (
    <div className="m-page">
      <div className="m-page-title">
        <h1>Welcome, {user?.full_name?.split(" ")[0] ?? "Agent"}</h1>
      </div>

      <div className="ma-stats">
        <div className="m-card ma-stat">
          <span className="m-kv-label">MTD revenue</span>
          <span className="m-metric">{formatMoney(mtdRevenue, "INR")}</span>
        </div>
        <div className="m-card ma-stat">
          <span className="m-kv-label">Owed</span>
          <span className="m-metric ma-success">{formatMoney(owed, "INR")}</span>
        </div>
        <div className="m-card ma-stat">
          <span className="m-kv-label">Total earned</span>
          <span className="m-metric ma-accent">{formatMoney(earned, "INR")}</span>
        </div>
        <div className="m-card ma-stat">
          <span className="m-kv-label">Completed deals</span>
          <span className="m-metric">{completed}</span>
          <span className="m-card-sub">{active} active</span>
        </div>
      </div>

      <div className="m-section-head">
        <h2 className="m-section-title">Lead funnel</h2>
      </div>
      <div className="m-card">
        {funnel.map((f) => (
          <div className="ma-bar-row" key={f.name}>
            <span className="ma-bar-label">{stageLabel(f.name)}</span>
            <span className="ma-bar-track">
              <span className="ma-bar-fill" style={{ width: `${(f.count / maxCount) * 100}%`, display: "block" }} />
            </span>
            <span className="ma-bar-value">{f.count}</span>
          </div>
        ))}
      </div>

      <div className="m-section-head">
        <h2 className="m-section-title">Recent closed deals</h2>
        <button type="button" className="m-btn sm" onClick={() => navigate("/app/agent/leads")}>
          All leads
        </button>
      </div>
      {closed.length === 0 ? (
        <div className="m-empty">No closed or placed orders yet.</div>
      ) : (
        <div className="m-list">
          {closed.map((l) => (
            <div
              key={l.lead_id}
              className="m-card m-card-tap"
              onClick={() => navigate(`/app/leads/${l.lead_id}`)}
            >
              <div className="m-card-top">
                <span className="m-card-title">{l.name}</span>
                <span className={stageBadgeClass(stageOf(l), terminal)}>{stageLabel(stageOf(l))}</span>
              </div>
              <div className="m-card-sub">{formatMoney(dealValues[l.lead_id] || 0, "INR")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
