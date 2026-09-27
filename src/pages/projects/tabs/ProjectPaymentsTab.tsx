import { useState, useEffect } from "react";
import { listPayments, createPayment, type Payment, type PaymentCreate, type PaymentMethod, type PaymentStatus } from "../../../api/payments";

export function ProjectPaymentsTab({
  entityId,
  projectId,
}: {
  entityId: number;
  projectId: number;
}) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("NEFT");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState<PaymentStatus>("COMPLETED");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPayments();
  }, [entityId, projectId]);

  async function loadPayments() {
    setLoading(true);
    setError(null);
    try {
      const res = await listPayments(entityId, { project_id: projectId });
      // Only show INBOUND payments here (project revenue)
      setPayments(res.items.filter((p) => p.direction === "INBOUND"));
    } catch (err: any) {
      setError(err.message || "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || isNaN(Number(amount))) return;
    
    setSaving(true);
    try {
      const payload: PaymentCreate = {
        project_id: projectId,
        direction: "INBOUND",
        amount: Number(amount),
        payment_method: paymentMethod,
        reference_number: referenceNumber || null,
        status,
        payment_date: new Date(paymentDate).toISOString(),
        notes: notes || null,
      };
      
      const newPayment = await createPayment(entityId, payload);
      setPayments([newPayment, ...payments]);
      setShowAddForm(false);
      
      // Reset form
      setAmount("");
      setReferenceNumber("");
      setNotes("");
    } catch (err: any) {
      setError(err.message || "Failed to add payment");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-muted">Loading payments...</div>;

  const totalReceived = payments
    .filter(p => p.status === "COMPLETED")
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="project-payments-tab">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h3 style={{ margin: 0 }}>Project Payments</h3>
          <p className="text-muted" style={{ margin: "0.25rem 0 0" }}>
            Total Received: <strong>₹{totalReceived.toLocaleString()}</strong>
          </p>
        </div>
        {!showAddForm && (
          <button className="projects-btn primary" onClick={() => setShowAddForm(true)}>
            + Record Payment
          </button>
        )}
      </div>

      {error && <div className="error-message" style={{ marginBottom: "1rem" }}>{error}</div>}

      {showAddForm && (
        <form className="admin-form-card" onSubmit={handleAddPayment} style={{ marginBottom: "2rem" }}>
          <h4 style={{ marginTop: 0 }}>Record Incoming Payment</h4>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Amount (₹)</label>
              <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required />
            </div>
            <div className="admin-form-group">
              <label>Date</label>
              <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required />
            </div>
          </div>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label>Method</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}>
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
            <div className="admin-form-group">
              <label>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as PaymentStatus)}>
                <option value="COMPLETED">Received (Completed)</option>
                <option value="PENDING">Pending (e.g. uncleared cheque)</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>
          </div>
          <div className="admin-form-row">
            <div className="admin-form-group" style={{ flex: 2 }}>
              <label>Reference Number (UTR / Cheque No)</label>
              <input type="text" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} />
            </div>
          </div>
          <div className="admin-form-group">
            <label>Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
            <button type="submit" className="projects-btn primary" disabled={saving}>
              {saving ? "Saving..." : "Save Payment"}
            </button>
            <button type="button" className="projects-btn" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {payments.length === 0 ? (
        <div className="empty-state">No payments recorded for this project yet.</div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table projects-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.payment_id}>
                  <td data-label="Date">{new Date(p.payment_date).toLocaleDateString()}</td>
                  <td data-label="Amount"><strong>₹{p.amount.toLocaleString()}</strong></td>
                  <td data-label="Method">{p.payment_method}</td>
                  <td data-label="Reference">
                    {p.reference_number ? <span className="entity-chip">{p.reference_number}</span> : "-"}
                  </td>
                  <td data-label="Status">
                    <span className={`entity-chip ${p.status === 'COMPLETED' ? 'success' : p.status === 'FAILED' ? 'danger' : ''}`}>
                      {p.status}
                    </span>
                  </td>
                  <td data-label="Notes">{p.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
