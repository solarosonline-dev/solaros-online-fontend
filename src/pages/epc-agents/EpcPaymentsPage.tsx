import { useState, useEffect } from "react";
import { useAuth } from "../../lib/AuthContext";
import {
  getLeadStates,
  getLeadCustomStates,
  getLeadDealValues,
  getEarnedCommission,
  getPaidCommission,
  getPaymentRequests,
  addPaymentRequest,
  approvePaymentRequest,
  MOCK_LEADS,
} from "../../lib/epcAgentStorage";
import { listLeads, type Lead } from "../../api/leads";
import { isAgent } from "../../lib/roles";
import { formatMoney } from "../../lib/money";
import "./EpcAgents.css";

export default function EpcPaymentsPage() {
  const { user } = useAuth();
  const isAgentUser = user ? isAgent(user.roles) : false;
  const loggedInUserId = user?.user_id || 9901;
  const loggedInUserName = user?.full_name || "Aarav Sharma";
  const entityId = user?.entity_id;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // Payments / requests state
  const [requests, setRequests] = useState<any[]>([]);
  const [requestAmount, setRequestAmount] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

  useEffect(() => {
    setRequests(getPaymentRequests());
  }, []);

  // Fetch leads
  useEffect(() => {
    let cancelled = false;
    if (entityId) {
      listLeads(entityId)
        .then((res) => {
          if (!cancelled) {
            const dbLeads = res.items;
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
  }, [entityId]);

  const leadStates = getLeadStates();
  const customStates = getLeadCustomStates();
  const dealValues = getLeadDealValues();
  const commissions = JSON.parse(localStorage.getItem("epc_agents_commissions") || "[]");

  // Balance computations
  const earnedComm = getEarnedCommission(
    loggedInUserId,
    leads,
    commissions,
    leadStates,
    customStates,
    dealValues
  );
  const paidComm = getPaidCommission(loggedInUserId, requests);
  const owedComm = Math.max(0, earnedComm - paidComm);

  // Filter requests
  const filteredRequests = isAgentUser
    ? requests.filter((r) => r.agentId === loggedInUserId)
    : requests;

  const pendingRequests = filteredRequests.filter((r) => r.status === "PENDING");
  const paidHistory = filteredRequests.filter((r) => r.status === "PAID");

  function handleRequestPayout(e: React.FormEvent) {
    e.preventDefault();
    setRequestError(null);
    const amt = parseFloat(requestAmount);

    if (isNaN(amt) || amt <= 0) {
      setRequestError("Please enter a valid amount.");
      return;
    }
    if (amt > owedComm) {
      setRequestError(`Insufficient balance. You can request up to ${formatMoney(owedComm, "INR")}.`);
      return;
    }

    const newReq = addPaymentRequest(loggedInUserId, loggedInUserName, amt);
    setRequests([newReq, ...requests]);
    setRequestAmount("");
    alert("Payout request submitted successfully!");
  }

  function handleApprovePayout(reqId: string) {
    approvePaymentRequest(reqId);
    setRequests(getPaymentRequests());
    alert("Payout request marked as PAID successfully!");
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--app-text-muted)" }}>Loading Payments...</div>;

  return (
    <div className="epc-payments-page">
      <div className="epc-dashboard-header">
        <h1>{isAgentUser ? "Commissions & Payment Requests" : "Agent Payouts Approval Ledger"}</h1>
        <p className="subtitle">
          {isAgentUser
            ? "Inspect your lifetime earnings and outstanding commission. Submit payment release requests anytime."
            : "Review pending agent release requests, approve payouts, and audit lifetime payout transaction logs."}
        </p>
      </div>

      {isAgentUser && (
        <div className="epc-payments-split">
          <div className="epc-payments-panel card">
            <h3>Earnings & Payout Balance</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              <div className="balance-row">
                <span className="label">Total Earned</span>
                <span className="value">{formatMoney(earnedComm, "INR")}</span>
              </div>
              <div className="balance-row">
                <span className="label">Total Paid (withdrawn)</span>
                <span className="value">{formatMoney(paidComm, "INR")}</span>
              </div>
              <hr style={{ border: 0, borderTop: "1px solid var(--app-border)", margin: "8px 0" }} />
              <div className="balance-row large">
                <span className="label">Owed Outstanding</span>
                <span className="value text-success">{formatMoney(owedComm, "INR")}</span>
              </div>
            </div>
          </div>

          <div className="epc-payments-panel card">
            <h3>Request Payout</h3>
            <form onSubmit={handleRequestPayout} style={{ marginTop: 16 }}>
              <div className="epc-form-group">
                <label>Payout Amount Requested (INR)</label>
                <input
                  type="number"
                  placeholder="E.G. 15000"
                  value={requestAmount}
                  disabled={owedComm <= 0}
                  onChange={(e) => setRequestAmount(e.target.value)}
                  className="epc-input"
                />
                {requestError && <span className="error-text">{requestError}</span>}
              </div>
              <button type="submit" className="entity-btn primary" disabled={owedComm <= 0 || !requestAmount}>
                {owedComm <= 0 ? "No balance to request" : "Submit Payout Request"}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="epc-payments-history-section">
        <div className="amc-filters">
          <button className={activeTab === "pending" ? "active" : ""} onClick={() => setActiveTab("pending")}>
            Pending Approvals ({pendingRequests.length})
          </button>
          <button className={activeTab === "history" ? "active" : ""} onClick={() => setActiveTab("history")}>
            Agent Payments Tab ({paidHistory.length})
          </button>
        </div>

        <div className="epc-panel">
          {activeTab === "pending" && (
            <>
              {pendingRequests.length === 0 ? (
                <div className="empty-state">No pending payout requests found.</div>
              ) : (
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Request ID</th>
                      <th>Agent Name</th>
                      <th>Amount Requested</th>
                      <th>Requested Date</th>
                      <th>Status</th>
                      {!isAgentUser && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map((r) => (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td><strong>{r.agentName}</strong></td>
                        <td>{formatMoney(r.amount, "INR")}</td>
                        <td>{new Date(r.requestedAt).toLocaleDateString()}</td>
                        <td>
                          <span className="badge state-NEW">AWAITING RELEASE</span>
                        </td>
                        {!isAgentUser && (
                          <td>
                            <button className="entity-btn primary mini-btn" onClick={() => handleApprovePayout(r.id)}>
                              Approve & Pay
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {activeTab === "history" && (
            <>
              {paidHistory.length === 0 ? (
                <div className="empty-state">No payment release history found.</div>
              ) : (
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Transaction ID</th>
                      <th>Agent Name</th>
                      <th>Amount Paid</th>
                      <th>Requested Date</th>
                      <th>Paid Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidHistory.map((r) => (
                      <tr key={r.id}>
                        <td>{r.id}</td>
                        <td><strong>{r.agentName}</strong></td>
                        <td>{formatMoney(r.amount, "INR")}</td>
                        <td>{new Date(r.requestedAt).toLocaleDateString()}</td>
                        <td>{r.paidAt ? new Date(r.paidAt).toLocaleDateString() : "—"}</td>
                        <td>
                          <span className="badge state-COMPLETED">PAID</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
