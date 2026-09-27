import { useEffect, useState } from "react";
import { listProcurementOrders, updateProcurementOrder, type ProcurementOrderResponse } from "../../../api/procurement";
import { listPayments, createPayment, type Payment, type PaymentCreate, type PaymentMethod, type PaymentStatus } from "../../../api/payments";
import { ApiError } from "../../../api/client";

type Props = {
  entityId: number;
  projectId: number;
};

function statusBadgeClass(status: string) {
  switch (status) {
    case "DRAFT": return "project-status-badge";
    case "SUBMITTED": return "project-status-badge in-progress";
    case "APPROVED": return "project-status-badge approved"; // reusing existing colors or defaults
    case "FULFILLED": return "project-status-badge completed";
    case "CANCELLED": return "project-status-badge rejected";
    default: return "project-status-badge";
  }
}

function ProcurementOrderCard({ order, entityId, onUpdate }: { order: ProcurementOrderResponse, entityId: number, onUpdate: () => void }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  
  // Edit Cost state
  const [isEditingCost, setIsEditingCost] = useState(false);
  const [costInput, setCostInput] = useState(order.total_cost?.toString() || "");
  const [savingCost, setSavingCost] = useState(false);

  // Add Payment state
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("NEFT");
  const [payRef, setPayRef] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payStatus, setPayStatus] = useState<PaymentStatus>("COMPLETED");
  const [payNotes, setPayNotes] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
    setLoadingPayments(true);
    listPayments(entityId, { procurement_id: order.procurement_id })
      .then(res => setPayments(res.items.filter(p => p.direction === "OUTBOUND")))
      .catch(console.error)
      .finally(() => setLoadingPayments(false));
  }, [entityId, order.procurement_id]);

  async function handleSaveCost() {
    setSavingCost(true);
    try {
      await updateProcurementOrder(entityId, order.procurement_id, {
        total_cost: costInput ? Number(costInput) : null
      });
      setIsEditingCost(false);
      onUpdate();
    } catch (err: any) {
      alert(err.message || "Failed to update cost");
    } finally {
      setSavingCost(false);
    }
  }

  async function handleSavePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payAmount || isNaN(Number(payAmount))) return;

    setSavingPayment(true);
    try {
      const payload: PaymentCreate = {
        project_id: order.project_id,
        vendor_id: order.vendor_id,
        procurement_id: order.procurement_id,
        direction: "OUTBOUND",
        amount: Number(payAmount),
        payment_method: payMethod,
        reference_number: payRef || null,
        status: payStatus,
        payment_date: new Date(payDate).toISOString(),
        notes: payNotes || null
      };
      const newPayment = await createPayment(entityId, payload);
      setPayments([newPayment, ...payments]);
      setShowAddPayment(false);
      
      setPayAmount("");
      setPayRef("");
      setPayNotes("");
    } catch (err: any) {
      alert(err.message || "Failed to record payment");
    } finally {
      setSavingPayment(false);
    }
  }

  const totalPaid = payments
    .filter(p => p.status === "COMPLETED")
    .reduce((sum, p) => sum + p.amount, 0);
  
  const balance = (order.total_cost || 0) - totalPaid;

  return (
    <div style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius)", padding: "16px", overflowX: "auto" }}>
      <div className="procurement-order-header" style={{ marginBottom: "1rem" }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: "16px", marginBottom: "4px" }}>Order #{order.procurement_id}</div>
          <div style={{ fontSize: "13px", color: "var(--app-text-muted)" }}>
            Created on {new Date(order.created_at).toLocaleDateString()}
            {order.notes && <><br /><em>{order.notes}</em></>}
          </div>
        </div>
        <div>
          <span className={statusBadgeClass(order.status)}>{order.status}</span>
        </div>
      </div>
      
      {/* Cost & Payment Summary */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem", padding: "12px", background: "var(--app-bg-hover)", borderRadius: "var(--app-radius)" }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <div style={{ fontSize: "12px", color: "var(--app-text-muted)", marginBottom: "4px" }}>Total Material Cost</div>
          {isEditingCost ? (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input 
                type="number" 
                className="admin-input" 
                style={{ width: "120px" }}
                value={costInput} 
                onChange={e => setCostInput(e.target.value)} 
                placeholder="0.00"
              />
              <button className="projects-btn primary" style={{ padding: "4px 8px", fontSize: "12px" }} onClick={handleSaveCost} disabled={savingCost}>Save</button>
              <button className="projects-btn" style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => setIsEditingCost(false)}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <strong style={{ fontSize: "16px" }}>{order.total_cost != null ? `₹${order.total_cost.toLocaleString()}` : "Not set"}</strong>
              <button className="projects-btn" style={{ padding: "2px 8px", fontSize: "12px" }} onClick={() => { setCostInput(order.total_cost?.toString() || ""); setIsEditingCost(true); }}>Edit</button>
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: "150px" }}>
          <div style={{ fontSize: "12px", color: "var(--app-text-muted)", marginBottom: "4px" }}>Paid to Vendor</div>
          <strong style={{ fontSize: "16px", color: totalPaid > 0 ? "var(--app-accent)" : "inherit" }}>₹{totalPaid.toLocaleString()}</strong>
        </div>
        <div style={{ flex: 1, minWidth: "150px" }}>
          <div style={{ fontSize: "12px", color: "var(--app-text-muted)", marginBottom: "4px" }}>Balance Due</div>
          <strong style={{ fontSize: "16px", color: balance > 0 ? "var(--app-danger-text)" : "inherit" }}>₹{Math.max(0, balance).toLocaleString()}</strong>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h4 style={{ margin: 0, fontSize: "13px", color: "var(--app-text-muted)", textTransform: "uppercase" }}>Items</h4>
      </div>
      <div className="leads-table-container" style={{ margin: "0 0 16px" }}>
        <table className="leads-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Make & Model</th>
              <th style={{ textAlign: "right" }}>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.item_id}>
                <td data-label="Type">{item.material_type}</td>
                <td data-label="Make/Model">
                  {item.make || item.model ? `${item.make || ""} ${item.model || ""}`.trim() : "—"}
                </td>
                <td data-label="Qty" style={{ textAlign: "right" }}>
                  {item.quantity} <span style={{ fontSize: "12px", color: "var(--app-text-muted)" }}>{item.unit.toLowerCase()}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Outbound Payments Section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderTop: "1px solid var(--app-border)", paddingTop: "16px" }}>
        <h4 style={{ margin: 0, fontSize: "13px", color: "var(--app-text-muted)", textTransform: "uppercase" }}>Vendor Payments</h4>
        {!showAddPayment && (
          <button className="projects-btn primary" style={{ padding: "4px 12px", fontSize: "13px" }} onClick={() => setShowAddPayment(true)}>
            + Record Payment
          </button>
        )}
      </div>

      {showAddPayment && (
        <form className="projects-form-card" onSubmit={handleSavePayment} style={{ marginBottom: "16px" }}>
          <div className="projects-form-row">
            <div className="projects-form-field">
              <label>Amount (₹)</label>
              <input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} required />
            </div>
            <div className="projects-form-field">
              <label>Date</label>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required />
            </div>
            <div className="projects-form-field">
              <label>Method</label>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value as PaymentMethod)}>
                <option value="UPI">UPI</option>
                <option value="NEFT">NEFT</option>
                <option value="RTGS">RTGS</option>
                <option value="IMPS">IMPS</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CARD">Card</option>
                <option value="CASH">Cash</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <div className="projects-form-row">
            <div className="projects-form-field">
              <label>Status</label>
              <select value={payStatus} onChange={e => setPayStatus(e.target.value as PaymentStatus)}>
                <option value="COMPLETED">Paid (Completed)</option>
                <option value="PENDING">Pending (e.g. uncleared cheque)</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>
            <div className="projects-form-field" style={{ flex: 2 }}>
              <label>Reference Number (UTR / Cheque No)</label>
              <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
            <button type="submit" className="projects-btn primary" disabled={savingPayment}>
              {savingPayment ? "Saving..." : "Save Payment"}
            </button>
            <button type="button" className="projects-btn" onClick={() => setShowAddPayment(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loadingPayments ? (
        <div className="text-muted" style={{ fontSize: "13px" }}>Loading payments...</div>
      ) : payments.length > 0 ? (
        <div className="projects-table-wrap">
          <table className="projects-table" style={{ fontSize: "13px" }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.payment_id}>
                  <td data-label="Date">{new Date(p.payment_date).toLocaleDateString()}</td>
                  <td data-label="Amount"><strong>₹{p.amount.toLocaleString()}</strong></td>
                  <td data-label="Method">{p.payment_method}</td>
                  <td data-label="Reference">{p.reference_number || "-"}</td>
                  <td data-label="Status">
                    <span className={`entity-chip ${p.status === 'COMPLETED' ? 'success' : p.status === 'FAILED' ? 'danger' : ''}`}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-muted" style={{ fontSize: "13px" }}>No payments recorded for this order yet.</div>
      )}
    </div>
  );
}

export default function ProcurementOrdersTab({ entityId, projectId }: Props) {
  const [orders, setOrders] = useState<ProcurementOrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    listProcurementOrders(entityId, projectId)
      .then((res) => {
        setOrders(res.items);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message);
        else setError("Failed to load procurement orders");
        setLoading(false);
      });
  }

  useEffect(load, [entityId, projectId]);

  if (loading) return <div className="entity-panel-empty">Loading procurement orders...</div>;
  if (error) return <div className="entity-panel-empty error">{error}</div>;

  if (orders.length === 0) {
    return (
      <div>
        <h3 style={{ margin: "0 0 16px" }}>Procurement Orders</h3>
        <div className="entity-panel-empty">No procurement orders created for this project yet. Use the Material Routing tab to generate orders.</div>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 16px" }}>Procurement Orders</h3>
      <div style={{ display: "grid", gap: "16px" }}>
        {orders.map((order) => (
          <ProcurementOrderCard key={order.procurement_id} order={order} entityId={entityId} onUpdate={load} />
        ))}
      </div>
    </div>
  );
}
