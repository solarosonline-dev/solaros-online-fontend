import { useEffect, useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { SERVER_PAYOUT_PREFIX, payPayoutRequest, requestPayout, syncAgentWorkspace } from "../../api/agentWorkspace";
import { ApiError } from "../../api/client";
import {
  addPaymentRequest,
  approvePaymentRequest,
  getEarnedCommission,
  getLeadCustomStates,
  getLeadDealValues,
  getLeadStates,
  getPaidCommission,
  getPaymentRequests,
  syncAssignmentsFromLeads,
  type PaymentRequest,
} from "../../lib/epcAgentStorage";
import { leadsAccess, listLeads, type Lead } from "../../api/leads";
import { isAgent } from "../../lib/roles";
import { formatMoney } from "../../lib/money";
import FullScreenForm from "../../components/FullScreenForm";
import NumberField from "../../components/NumberField";
import "./MobileAgentPages.css";

export default function MobileAgentPaymentsPage() {
  const { user } = useAuth();
  const isAgentUser = user ? isAgent(user.roles) : false;
  const userId = user?.user_id ?? 0;
  const entityId = user?.entity_id;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<PaymentRequest[]>(() => getPaymentRequests());
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setSyncTick] = useState(0);

  useEffect(() => {
    if (user)
      syncAgentWorkspace(user).then(() => {
        setRequests(getPaymentRequests());
        setSyncTick((t) => t + 1);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.entity_id, user?.user_id]);

  useEffect(() => {
    let cancelled = false;
    if (!entityId) {
      setLoading(false);
      return;
    }
    listLeads(entityId, {}, leadsAccess(user))
      .then((res) => {
        if (cancelled) return;
        syncAssignmentsFromLeads(res.items);
        setLeads(res.items);
      })
      .catch(() => !cancelled && setLeads([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  const earned = getEarnedCommission(
    userId,
    leads,
    JSON.parse(localStorage.getItem("epc_agents_commissions") || "[]"),
    getLeadStates(),
    getLeadCustomStates(),
    getLeadDealValues(),
  );
  const paid = getPaidCommission(userId, requests);
  const owed = Math.max(0, earned - paid);

  const visible = isAgentUser ? requests.filter((r) => r.agentId === userId) : requests;
  const pending = visible.filter((r) => r.status === "PENDING");
  const history = visible.filter((r) => r.status === "PAID");
  const list = tab === "pending" ? pending : history;

  async function refresh() {
    if (user) await syncAgentWorkspace(user);
    setRequests(getPaymentRequests());
  }

  async function submitRequest() {
    setFormError(null);
    if (!(amount > 0)) return setFormError("Please enter a valid amount.");
    if (amount > owed) return setFormError(`You can request up to ${formatMoney(owed, "INR")}.`);
    setBusy(true);
    try {
      if (entityId) await requestPayout(entityId, amount);
      else addPaymentRequest(userId, user?.full_name ?? "", amount);
      await refresh();
      setAmount(0);
      setFormOpen(false);
      setNotice("Payout request submitted.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to submit the request.");
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    setActionError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (id.startsWith(SERVER_PAYOUT_PREFIX) && entityId) {
        await payPayoutRequest(entityId, Number(id.slice(SERVER_PAYOUT_PREFIX.length)));
      } else {
        approvePaymentRequest(id); // demo request, local only
      }
      await refresh();
      setNotice("Payout marked as paid.");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to mark the payout as paid.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="m-empty">Loading payments…</div>;

  return (
    <div className="m-page">
      <div className="m-page-title">
        <h1>{isAgentUser ? "Commissions" : "Payouts"}</h1>
      </div>

      {isAgentUser && (
        <div className="m-card">
          <div className="ma-row">
            <span className="m-kv-label">Total earned</span>
            <strong>{formatMoney(earned, "INR")}</strong>
          </div>
          <div className="ma-row">
            <span className="m-kv-label">Total paid</span>
            <strong>{formatMoney(paid, "INR")}</strong>
          </div>
          <div className="ma-row large">
            <span>Owed</span>
            <span className="ma-success">{formatMoney(owed, "INR")}</span>
          </div>
          <div className="m-card-actions">
            <button type="button" className="m-btn primary block" disabled={owed <= 0} onClick={() => setFormOpen(true)}>
              {owed <= 0 ? "No balance to request" : "Request payout"}
            </button>
          </div>
        </div>
      )}

      {notice && <p className="m-status success">{notice}</p>}
      {actionError && <p className="m-status error">{actionError}</p>}

      <div className="m-segment" role="group" aria-label="Payout status">
        <button type="button" className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>
          Pending ({pending.length})
        </button>
        <button type="button" className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          Paid ({history.length})
        </button>
      </div>

      {list.length === 0 ? (
        <div className="m-empty">{tab === "pending" ? "No pending payout requests." : "No payment history yet."}</div>
      ) : (
        <div className="m-list">
          {list.map((r) => (
            <div className="m-card" key={r.id}>
              <div className="m-card-top">
                <span className="m-card-title">{formatMoney(r.amount, "INR")}</span>
                <span className={`m-badge ${r.status === "PAID" ? "success" : "warning"}`}>
                  {r.status === "PAID" ? "Paid" : "Awaiting"}
                </span>
              </div>
              <div className="m-card-sub">
                {r.agentName} · requested {new Date(r.requestedAt).toLocaleDateString()}
                {r.paidAt ? ` · paid ${new Date(r.paidAt).toLocaleDateString()}` : ""}
              </div>
              {!isAgentUser && r.status === "PENDING" && (
                <div className="m-card-actions">
                  <button type="button" className="m-btn sm primary" disabled={busy} onClick={() => approve(r.id)}>
                    Approve &amp; pay
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <FullScreenForm
          title="Request payout"
          onClose={() => setFormOpen(false)}
          footer={
            <button type="button" className="m-btn primary block" disabled={busy || amount <= 0} onClick={submitRequest}>
              {busy ? "Submitting…" : "Submit request"}
            </button>
          }
        >
          <p className="m-fs-hint">Available: {formatMoney(owed, "INR")}</p>
          <div className="m-field">
            <label htmlFor="ma-amount">Amount (INR)</label>
            <NumberField id="ma-amount" value={amount} onCommit={setAmount} emptyValue={0} />
          </div>
          {formError && <p className="m-status error">{formError}</p>}
        </FullScreenForm>
      )}
    </div>
  );
}
