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
  MOCK_LEADS,
  syncAssignmentsFromLeads,
} from "../../lib/epcAgentStorage";
import { leadsAccess, listLeads, type Lead } from "../../api/leads";
import { formatMoney } from "../../lib/money";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import "./EpcAgents.css";

export default function AgentDashboardPage() {
  const { user } = useAuth();
  const agentId = user?.user_id || 9901;
  const agentName = user?.full_name || "Aarav Sharma";

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // Stages, commission rules and payouts come from the backend (shared with the
  // admin/agent on the other side); re-render once mirrored.
  const [, setSyncTick] = useState(0);
  useEffect(() => {
    if (user) syncAgentWorkspace(user).then(() => setSyncTick((t) => t + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.entity_id, user?.user_id]);

  // Load leads from DB + Mock Leads
  useEffect(() => {
    let cancelled = false;
    if (user?.entity_id) {
      listLeads(user.entity_id, {}, leadsAccess(user))
        .then((res) => {
          if (!cancelled) {
            // Merge actual leads with mock leads to guarantee a rich dashboard experience
            const dbLeads = res.items;
            syncAssignmentsFromLeads(
              dbLeads.map((l) => ({ ...l, created_by_user_id: user.user_id })),
            );
            const mockLeadsMapped = MOCK_LEADS.map(ml => ({
              lead_id: ml.lead_id,
              name: ml.name,
              mobile: ml.mobile,
              status: "NEW" as const,
              created_at: ml.created_at,
              project_id: null,
            }));
            setLeads([...dbLeads, ...mockLeadsMapped]);
          }
        })
        .catch(() => {
          if (!cancelled) {
            // Fallback fully to mock leads on error or offline
            const mockLeadsMapped = MOCK_LEADS.map(ml => ({
              lead_id: ml.lead_id,
              name: ml.name,
              mobile: ml.mobile,
              status: "NEW" as const,
              created_at: ml.created_at,
              project_id: null,
            }));
            setLeads(mockLeadsMapped);
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
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [user?.entity_id]);

  const leadStates = getLeadStates();
  const assignments = getLeadAssignments();
  const customStates = getLeadCustomStates();
  const dealValues = getLeadDealValues();
  const paymentRequests = getPaymentRequests();

  // Filter leads assigned to this agent
  const myLeads = leads.filter((l) => assignments[l.lead_id] === agentId);

  // Compute metrics
  const terminalState = leadStates[leadStates.length - 1];
  const orderState = leadStates[leadStates.length - 2];

  const completedLeads = myLeads.filter((l) => customStates[l.lead_id] === terminalState).length;
  const activePipelineCount = myLeads.filter((l) => customStates[l.lead_id] !== terminalState).length;

  const earnedComm = getEarnedCommission(
    agentId,
    leads,
    JSON.parse(localStorage.getItem("epc_agents_commissions") || "[]"),
    leadStates,
    customStates,
    dealValues
  );
  const paidComm = getPaidCommission(agentId, paymentRequests);
  const owedComm = Math.max(0, earnedComm - paidComm);

  // MTD Realized Revenue
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const mtdRevenue = myLeads
    .filter((l) => {
      const state = customStates[l.lead_id] || "NEW";
      if (state !== terminalState && state !== orderState) return false;
      const date = new Date(l.created_at);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    })
    .reduce((sum, l) => sum + (dealValues[l.lead_id] || 0), 0);

  // Chart data: count of leads per state
  const chartData = leadStates.map((state) => {
    const count = myLeads.filter((l) => (customStates[l.lead_id] || "NEW") === state).length;
    return { name: state, count };
  });

  const COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--app-text-muted)" }}>Loading Dashboard…</div>;

  return (
    <div className="epc-agent-dashboard">
      <div className="epc-dashboard-header">
        <h1>Welcome, {agentName}</h1>
        <p className="subtitle">Your personal performance, earnings, and lead pipelines at a glance.</p>
      </div>

      <div className="epc-stats-grid">
        <div className="epc-stat-card">
          <span className="label">MTD Realized Revenue</span>
          <span className="value">{formatMoney(mtdRevenue, "INR")}</span>
          <span className="desc">Total contract value completed this month</span>
        </div>
        <div className="epc-stat-card">
          <span className="label">Owed Commission</span>
          <span className="value text-success">{formatMoney(owedComm, "INR")}</span>
          <span className="desc">Outstanding payout owed to you</span>
        </div>
        <div className="epc-stat-card">
          <span className="label">Total Earned</span>
          <span className="value text-accent">{formatMoney(earnedComm, "INR")}</span>
          <span className="desc">Lifetime commissions earned</span>
        </div>
        <div className="epc-stat-card">
          <span className="label">Completed Deals</span>
          <span className="value">{completedLeads}</span>
          <span className="desc">{activePipelineCount} active leads in pipeline</span>
        </div>
      </div>

      <div className="epc-dashboard-charts-layout">
        <div className="epc-chart-panel">
          <h3>Lead Funnel Distribution</h3>
          <p className="chart-desc">Your leads across configured project stages</p>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--app-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} stroke="var(--app-border)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} stroke="var(--app-border)" />
                <Tooltip contentStyle={{ background: "var(--app-surface)", borderColor: "var(--app-border)", borderRadius: 6 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={36}>
                  {chartData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="epc-chart-panel">
          <h3>Recent Realized Deals</h3>
          <p className="chart-desc">Your highest earnings from recent closings</p>
          <div className="deals-list-scroller">
            {myLeads.filter(l => (customStates[l.lead_id] || "NEW") === terminalState || (customStates[l.lead_id] || "NEW") === orderState).length === 0 ? (
              <div className="empty-state">No closed or placed orders yet.</div>
            ) : (
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>Lead Name</th>
                    <th>State</th>
                    <th>Deal Value</th>
                  </tr>
                </thead>
                <tbody>
                  {myLeads
                    .filter(l => (customStates[l.lead_id] || "NEW") === terminalState || (customStates[l.lead_id] || "NEW") === orderState)
                    .map((l) => (
                      <tr key={l.lead_id}>
                        <td><strong>{l.name}</strong></td>
                        <td>
                          <span className={`badge state-${customStates[l.lead_id]}`}>
                            {customStates[l.lead_id]}
                          </span>
                        </td>
                        <td>{formatMoney(dealValues[l.lead_id] || 0, "INR")}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
