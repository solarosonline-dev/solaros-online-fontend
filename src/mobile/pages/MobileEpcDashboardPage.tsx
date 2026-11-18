import { useEffect, useState } from "react";
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
import { listEntityUsers, type EntityUser } from "../../api/entityUsers";
import { formatMoney, formatMoneyShort } from "../../lib/money";
import SearchableSelect from "../../components/SearchableSelect";
import { stageLabel } from "./agentWorkspaceUi";
import "./MobileAgentPages.css";

export default function MobileEpcDashboardPage() {
  const { user } = useAuth();
  const entityId = user?.entity_id;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<EntityUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [, setSyncTick] = useState(0);

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
    Promise.all([listLeads(entityId, {}, leadsAccess(user)), listEntityUsers(entityId)])
      .then(([leadsRes, usersRes]) => {
        if (cancelled) return;
        syncAssignmentsFromLeads(leadsRes.items);
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
  }, [entityId]);

  useEffect(() => {
    if (agents.length > 0 && selectedId === "") setSelectedId(agents[0].user_id);
  }, [agents, selectedId]);

  if (loading) return <div className="m-empty">Loading dashboard…</div>;

  const leadStates = getLeadStates();
  const assignments = getLeadAssignments();
  const customStates = getLeadCustomStates();
  const dealValues = getLeadDealValues();
  const requests = getPaymentRequests();
  const commissions = JSON.parse(localStorage.getItem("epc_agents_commissions") || "[]");
  const terminal = leadStates[leadStates.length - 1];
  const order = leadStates[leadStates.length - 2];
  const stageOf = (l: Lead) => customStates[l.lead_id] || "NEW";
  const isClosed = (l: Lead) => stageOf(l) === terminal || stageOf(l) === order;
  const revenueOf = (ls: Lead[]) =>
    ls.filter(isClosed).reduce((s, l) => s + (dealValues[l.lead_id] || 0), 0);

  const totalRevenue = revenueOf(leads);
  const totalOwed = agents.reduce(
    (s, ag) =>
      s +
      Math.max(
        0,
        getEarnedCommission(ag.user_id, leads, commissions, leadStates, customStates, dealValues) -
          getPaidCommission(ag.user_id, requests),
      ),
    0,
  );
  const totalPaid = requests.filter((r) => r.status === "PAID").reduce((s, r) => s + r.amount, 0);
  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  const leaderboard = agents
    .map((ag) => ({
      name: ag.full_name,
      revenue: revenueOf(leads.filter((l) => assignments[l.lead_id] === ag.user_id)),
    }))
    .sort((a, b) => b.revenue - a.revenue);
  const maxRevenue = Math.max(1, ...leaderboard.map((a) => a.revenue));

  const selected = agents.find((a) => a.user_id === selectedId);
  const selectedLeads = selected ? leads.filter((l) => assignments[l.lead_id] === selected.user_id) : [];
  const selEarned = selected
    ? getEarnedCommission(selected.user_id, leads, commissions, leadStates, customStates, dealValues)
    : 0;
  const selPaid = selected ? getPaidCommission(selected.user_id, requests) : 0;
  const funnel = leadStates.map((s) => ({ name: s, count: selectedLeads.filter((l) => stageOf(l) === s).length }));
  const maxCount = Math.max(1, ...funnel.map((f) => f.count));

  return (
    <div className="m-page">
      <div className="m-page-title">
        <h1>EPC dashboard</h1>
      </div>

      <div className="ma-stats">
        <div className="m-card ma-stat">
          <span className="m-kv-label">Realized business</span>
          <span className="m-metric">{formatMoneyShort(totalRevenue, "INR")}</span>
        </div>
        <div className="m-card ma-stat">
          <span className="m-kv-label">Owed</span>
          <span className="m-metric ma-success">{formatMoneyShort(totalOwed, "INR")}</span>
        </div>
        <div className="m-card ma-stat">
          <span className="m-kv-label">Paid</span>
          <span className="m-metric ma-accent">{formatMoneyShort(totalPaid, "INR")}</span>
        </div>
        <div className="m-card ma-stat">
          <span className="m-kv-label">Pending releases</span>
          <span className="m-metric ma-warning">{pendingCount}</span>
        </div>
      </div>

      <h2 className="m-section-title">Agent leaderboard</h2>
      {leaderboard.length === 0 ? (
        <div className="m-empty">No agents onboarded yet.</div>
      ) : (
        <div className="m-card">
          {leaderboard.map((a) => (
            <div className="ma-bar-row" key={a.name}>
              <span className="ma-bar-label">{a.name}</span>
              <span className="ma-bar-track">
                <span className="ma-bar-fill" style={{ width: `${(a.revenue / maxRevenue) * 100}%`, display: "block" }} />
              </span>
              <span className="ma-bar-value">{formatMoneyShort(a.revenue, "INR")}</span>
            </div>
          ))}
        </div>
      )}

      {agents.length > 0 && (
        <>
          <h2 className="m-section-title">Agent explorer</h2>
          <SearchableSelect
            ariaLabel="Agent"
            placeholder={`Search ${agents.length} agents…`}
            value={String(selectedId)}
            options={agents.map((ag) => ({ value: String(ag.user_id), label: ag.full_name }))}
            onChange={(v) => setSelectedId(Number(v))}
          />
          {selected && (
            <div className="m-card">
              <div className="m-kv-grid">
                <div className="m-kv">
                  <span className="m-kv-label">Leads</span>
                  <span className="m-kv-value">{selectedLeads.length}</span>
                </div>
                <div className="m-kv">
                  <span className="m-kv-label">Owed</span>
                  <span className="m-kv-value ma-success">{formatMoney(Math.max(0, selEarned - selPaid), "INR")}</span>
                </div>
                <div className="m-kv">
                  <span className="m-kv-label">Paid</span>
                  <span className="m-kv-value ma-accent">{formatMoney(selPaid, "INR")}</span>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
