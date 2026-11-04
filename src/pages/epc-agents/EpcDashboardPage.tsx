import { useState, useEffect } from "react";
import { useAuth } from "../../lib/AuthContext";
import { syncAgentWorkspace } from "../../api/agentWorkspace";
import {
  getLeadStates,
  getLeadCustomStates,
  getLeadDealValues,
  getLeadAssignments,
  getEarnedCommission,
  getPaidCommission,
  getPaymentRequests,
  MOCK_AGENTS,
  MOCK_LEADS,
  syncAssignmentsFromLeads,
} from "../../lib/epcAgentStorage";
import { leadsAccess, listLeads, type Lead } from "../../api/leads";
import { listEntityUsers, type EntityUser } from "../../api/entityUsers";
import { formatMoney } from "../../lib/money";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import "./EpcAgents.css";

export default function EpcDashboardPage() {
  const { user } = useAuth();
  const entityId = user?.entity_id;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<EntityUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<number | "">("");

  // Stages, commission rules and payouts come from the backend (shared with the
  // admin/agent on the other side); re-render once mirrored.
  const [, setSyncTick] = useState(0);
  useEffect(() => {
    if (user) syncAgentWorkspace(user).then(() => setSyncTick((t) => t + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.entity_id, user?.user_id]);

  // Load leads and agents
  useEffect(() => {
    let cancelled = false;
    if (entityId) {
      Promise.all([listLeads(entityId, {}, leadsAccess(user)), listEntityUsers(entityId)])
        .then(([leadsRes, usersRes]) => {
          if (!cancelled) {
            // Merge real + mock leads
            const dbLeads = leadsRes.items;
            syncAssignmentsFromLeads(dbLeads);
            const mockLeadsMapped = MOCK_LEADS.map(ml => ({
              lead_id: ml.lead_id,
              name: ml.name,
              mobile: ml.mobile,
              status: "NEW" as const,
              created_at: ml.created_at,
              project_id: null,
            }));
            setLeads([...dbLeads, ...mockLeadsMapped]);

            // Filter users who are ENTITY_AGENT
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
          // Mock fallbacks
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

  const leadStates = getLeadStates();
  const assignments = getLeadAssignments();
  const customStates = getLeadCustomStates();
  const dealValues = getLeadDealValues();
  const paymentRequests = getPaymentRequests();
  const commissions = JSON.parse(localStorage.getItem("epc_agents_commissions") || "[]");

  const terminalState = leadStates[leadStates.length - 1];
  const orderState = leadStates[leadStates.length - 2];

  // Set default selected agent
  useEffect(() => {
    if (agents.length > 0 && selectedAgentId === "") {
      setSelectedAgentId(agents[0].user_id);
    }
  }, [agents, selectedAgentId]);

  // Aggregate metrics
  const totalRevenue = leads
    .filter((l) => {
      const s = customStates[l.lead_id] || "NEW";
      return s === terminalState || s === orderState;
    })
    .reduce((sum, l) => sum + (dealValues[l.lead_id] || 0), 0);

  const totalOutstandingComm = agents.reduce((sum, ag) => {
    const earned = getEarnedCommission(ag.user_id, leads, commissions, leadStates, customStates, dealValues);
    const paid = getPaidCommission(ag.user_id, paymentRequests);
    return sum + Math.max(0, earned - paid);
  }, 0);

  const totalPaidComm = paymentRequests
    .filter((r) => r.status === "PAID")
    .reduce((sum, r) => sum + r.amount, 0);

  const pendingPayoutRequests = paymentRequests.filter((r) => r.status === "PENDING").length;

  // Leaderboard: Top Agents by Realized Business (deal value)
  const leaderboardData = agents
    .map((ag) => {
      const myAgentLeads = leads.filter((l) => assignments[l.lead_id] === ag.user_id);
      const revenue = myAgentLeads
        .filter((l) => {
          const s = customStates[l.lead_id] || "NEW";
          return s === terminalState || s === orderState;
        })
        .reduce((sum, l) => sum + (dealValues[l.lead_id] || 0), 0);

      return {
        name: ag.full_name,
        revenue,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // Selected agent details
  const selectedAgent = agents.find((ag) => ag.user_id === selectedAgentId);
  const selectedAgentLeads = selectedAgent
    ? leads.filter((l) => assignments[l.lead_id] === selectedAgent.user_id)
    : [];

  const selectedAgentEarned = selectedAgent
    ? getEarnedCommission(selectedAgent.user_id, leads, commissions, leadStates, customStates, dealValues)
    : 0;
  const selectedAgentPaid = selectedAgent ? getPaidCommission(selectedAgent.user_id, paymentRequests) : 0;
  const selectedAgentOwed = Math.max(0, selectedAgentEarned - selectedAgentPaid);

  const selectedAgentChartData = leadStates.map((state) => {
    const count = selectedAgentLeads.filter((l) => (customStates[l.lead_id] || "NEW") === state).length;
    return { name: state, count };
  });

  const COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--app-text-muted)" }}>Loading EPC Dashboard…</div>;

  return (
    <div className="epc-admin-dashboard">
      <div className="epc-dashboard-header">
        <h1>EPC Operations Dashboard</h1>
        <p className="subtitle">Collective tracking, agent leadership, payout releases, and individual metrics exploration.</p>
      </div>

      <div className="epc-stats-grid">
        <div className="epc-stat-card">
          <span className="label">Total Realized Business</span>
          <span className="value">{formatMoney(totalRevenue, "INR")}</span>
          <span className="desc">Cumulative value of all closed deals</span>
        </div>
        <div className="epc-stat-card">
          <span className="label">Total Commissions Owed</span>
          <span className="value text-success">{formatMoney(totalOutstandingComm, "INR")}</span>
          <span className="desc">Unreleased agent commissions</span>
        </div>
        <div className="epc-stat-card">
          <span className="label">Total Commissions Paid</span>
          <span className="value text-accent">{formatMoney(totalPaidComm, "INR")}</span>
          <span className="desc">Total payout issued to date</span>
        </div>
        <div className="epc-stat-card">
          <span className="label">Pending Releases</span>
          <span className="value text-warning">{pendingPayoutRequests}</span>
          <span className="desc">Awaiting approval requests</span>
        </div>
      </div>

      <div className="epc-dashboard-charts-layout">
        <div className="epc-chart-panel">
          <h3>Agent Leaderboard (Realized Business)</h3>
          <p className="chart-desc">Agents ranked by realized contract deal value</p>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={leaderboardData} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--app-border)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} stroke="var(--app-border)" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} stroke="var(--app-border)" width={100} />
                <Tooltip formatter={(value) => [formatMoney(Number(value), "INR"), "Business"]} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]} barSize={24} fill="#2563eb">
                  {leaderboardData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="epc-chart-panel">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Agent Performance Explorer</h3>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(Number(e.target.value))}
              style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--app-border)", fontSize: 13, background: "var(--app-surface)", color: "var(--app-text)" }}
            >
              {agents.map((ag) => (
                <option key={ag.user_id} value={ag.user_id}>
                  {ag.full_name}
                </option>
              ))}
            </select>
          </div>
          {selectedAgent ? (
            <>
              <p className="chart-desc">Deep-dive stats for {selectedAgent.full_name}</p>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, padding: 10, background: "var(--app-bg)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "var(--app-text-muted)" }}>Total Leads</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4, color: "var(--app-text)" }}>{selectedAgentLeads.length}</div>
                </div>
                <div style={{ flex: 1, padding: 10, background: "var(--app-bg)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "var(--app-text-muted)" }}>Owed</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4, color: "#16a34a" }}>{formatMoney(selectedAgentOwed, "INR")}</div>
                </div>
                <div style={{ flex: 1, padding: 10, background: "var(--app-bg)", borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "var(--app-text-muted)" }}>Paid</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4, color: "#2563eb" }}>{formatMoney(selectedAgentPaid, "INR")}</div>
                </div>
              </div>
              <div style={{ width: "100%", height: 150 }}>
                <ResponsiveContainer>
                  <BarChart data={selectedAgentChartData} margin={{ top: 10, right: 10, left: -30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--app-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--app-text-muted)" }} stroke="var(--app-border)" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--app-text-muted)" }} stroke="var(--app-border)" />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="empty-state">Please onboard agents to explore their metrics.</div>
          )}
        </div>
      </div>
    </div>
  );
}
