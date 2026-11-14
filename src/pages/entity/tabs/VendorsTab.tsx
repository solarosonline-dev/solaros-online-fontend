import { useEffect, useState } from "react";
import {
  listEntityVendors,
  createEntityVendor,
  updateEntityVendor,
  type Vendor,
} from "../../../api/vendors";
import { ApiError } from "../../../api/client";

type Props = {
  entityId: number;
};

export default function VendorsTab({ entityId }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [addingError, setAddingError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const isMobile = document.body.classList.contains("mobile-view");

  function load() {
    listEntityVendors(entityId)
      .then((res) => {
        setVendors(res.items);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message);
        else setError("Failed to load vendors");
        setLoading(false);
      });
  }

  useEffect(load, [entityId]);

  async function handleCreateOrUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) {
      setAddingError("Name is required");
      return;
    }

    setIsSubmitting(true);
    setAddingError(null);
    try {
      const data = {
        name: newName.trim(),
        contact_name: newContactName.trim() || null,
        email: newEmail.trim() || null,
        phone: newPhone.trim() || null,
        address: newAddress.trim() || null,
        is_active: editingVendor ? editingVendor.is_active : true,
      };

      if (editingVendor) {
        const updated = await updateEntityVendor(entityId, editingVendor.vendor_id, data);
        setVendors((prev) => prev.map((v) => (v.vendor_id === updated.vendor_id ? updated : v)));
        setEditingVendor(null);
      } else {
        const created = await createEntityVendor(entityId, data);
        setVendors((prev) => [...prev, created]);
        setIsAdding(false);
      }
      setNewName("");
      setNewContactName("");
      setNewEmail("");
      setNewPhone("");
      setNewAddress("");
    } catch (err) {
      if (err instanceof ApiError) setAddingError(err.message);
      else setAddingError(editingVendor ? "Failed to update vendor" : "Failed to create vendor");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEditing(vendor: Vendor) {
    setEditingVendor(vendor);
    setIsAdding(false);
    setNewName(vendor.name);
    setNewContactName(vendor.contact_name || "");
    setNewEmail(vendor.email || "");
    setNewPhone(vendor.phone || "");
    setNewAddress(vendor.address || "");
    setAddingError(null);
  }

  function startAdding() {
    setIsAdding(true);
    setEditingVendor(null);
    setNewName("");
    setNewContactName("");
    setNewEmail("");
    setNewPhone("");
    setNewAddress("");
    setAddingError(null);
  }

  function cancelForm() {
    setIsAdding(false);
    setEditingVendor(null);
    setNewName("");
    setNewContactName("");
    setNewEmail("");
    setNewPhone("");
    setNewAddress("");
    setAddingError(null);
  }

  async function handleToggleActive(vendor: Vendor) {
    try {
      const updated = await updateEntityVendor(entityId, vendor.vendor_id, {
        is_active: !vendor.is_active,
      });
      setVendors((prev) => prev.map((v) => (v.vendor_id === updated.vendor_id ? updated : v)));
    } catch (err) {
      alert("Failed to update status");
    }
  }

  if (loading) return <div className="entity-panel-empty">Loading vendors...</div>;
  if (error) return <div className="entity-panel-empty error">{error}</div>;

  if (isMobile) {
    // High-Fidelity Mobile View
    const isModalOpen = isAdding || editingVendor !== null;

    return (
      <div className="mobile-vendors-tab">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, fontFamily: "Bricolage Grotesque, sans-serif" }}>
            Registered Vendors
          </h3>
          {!isModalOpen && (
            <button type="button" className="mobile-btn-add-primary" onClick={startAdding} style={{ margin: 0 }}>
              ➕ Add Vendor
            </button>
          )}
        </div>

        {/* Vendors list as clean cards */}
        <div className="mobile-users-list" style={{ marginTop: "12px" }}>
          {vendors.length === 0 ? (
            <div className="mobile-users-state empty">
              <p>No vendors added yet.</p>
            </div>
          ) : (
            vendors.map((v) => (
              <div key={v.vendor_id} className={`mobile-user-card ${!v.is_active ? "inactive-row" : ""}`} style={{ padding: "14px" }}>
                <div className="mobile-user-card-main" style={{ paddingRight: 0 }}>
                  <div className="mobile-user-info">
                    <h3 style={{ fontSize: "15px" }}>{v.name}</h3>
                    {v.contact_name && <p>👤 Contact: {v.contact_name}</p>}
                    {v.email && <p>📧 {v.email}</p>}
                    {v.phone && <p>📱 {v.phone}</p>}
                    {v.address && <p>📍 Address: {v.address}</p>}
                  </div>

                  <span className={`project-status-badge ${v.is_active ? "completed" : "rejected"}`}>
                    {v.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="mobile-user-card-footer" style={{ marginTop: "8px", borderTop: "1px solid var(--app-border)", paddingTop: "10px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="drawer-action-btn"
                    onClick={() => startEditing(v)}
                    style={{ padding: "8px 12px", width: "auto", fontSize: "12px", minHeight: "unset !important" }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="drawer-action-btn"
                    onClick={() => handleToggleActive(v)}
                    style={{
                      padding: "8px 12px",
                      width: "auto",
                      fontSize: "12px",
                      minHeight: "unset !important",
                      color: v.is_active ? "var(--app-danger)" : "var(--app-accent)"
                    }}
                  >
                    {v.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Sheet overlay form for Mobile */}
        {isModalOpen && (
          <div className="mobile-user-modal-overlay" onClick={cancelForm}>
            <div className="mobile-user-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="mobile-user-modal-handle" onClick={cancelForm} />

              <div className="mobile-user-modal-header">
                <h3>{editingVendor ? "Edit Vendor Details" : "Add New Supplier Vendor"}</h3>
                <p>Add commercial logistics and supplier contacts to utilize on procurement orders.</p>
              </div>

              <form onSubmit={handleCreateOrUpdate} className="mobile-user-invite-form">
                <div className="mobile-form-field">
                  <label>Vendor Business Name *</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Sterling Panels Pvt Ltd"
                    required
                    autoFocus
                  />
                </div>

                <div className="mobile-form-field">
                  <label>Primary Contact Person Name</label>
                  <input
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="e.g. Johnathan Smith"
                  />
                </div>

                <div className="mobile-form-row">
                  <div className="mobile-form-field">
                    <label>Email ID Address</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="e.g. billing@supplier.com"
                    />
                  </div>
                  <div className="mobile-form-field">
                    <label>Mobile Number</label>
                    <input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="Phone or GSTIN phone"
                    />
                  </div>
                </div>

                <div className="mobile-form-field">
                  <label>Supplier Address Details</label>
                  <textarea
                    rows={2}
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="Physical supply warehouse coordinates"
                    style={{ fontSize: "13px !important", padding: "10px 12px", height: "auto" }}
                  />
                </div>

                {addingError && (
                  <div className="mobile-user-submit-error">⚠️ {addingError}</div>
                )}

                <div className="mobile-user-modal-actions">
                  <button
                    type="submit"
                    className="mobile-user-submit-btn"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Saving details..." : "🚀 Save Vendor Profile"}
                  </button>
                  <button
                    type="button"
                    className="mobile-user-cancel-btn"
                    onClick={cancelForm}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop Responsive Table View
  return (
    <div className="vendors-tab">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ margin: 0 }}>Registered Vendors</h3>
        {!isAdding && !editingVendor && (
          <button type="button" className="entity-btn primary" onClick={startAdding}>
            + Add vendor
          </button>
        )}
      </div>

      {(isAdding || editingVendor) && (
        <form onSubmit={handleCreateOrUpdate} className="add-lead-panel" style={{ marginBottom: "24px" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: "14px" }}>{editingVendor ? "Edit Vendor" : "Add New Vendor"}</h4>
          <div className="add-lead-field">
            <label>Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Acme Solar Supplies" autoFocus />
          </div>
          <div className="add-lead-field">
            <label>Contact Name (Optional)</label>
            <input value={newContactName} onChange={(e) => setNewContactName(e.target.value)} placeholder="e.g. Jane Doe" />
          </div>
          <div className="add-lead-field" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label>Email (Optional)</label>
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
            <div>
              <label>Phone (Optional)</label>
              <input type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+1234567890" />
            </div>
          </div>
          <div className="add-lead-field">
            <label>Address (Optional)</label>
            <textarea rows={2} value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
          </div>
          {addingError && <div className="leads-status error" style={{ marginBottom: "12px" }}>{addingError}</div>}
          <div className="add-lead-actions">
            <button type="submit" className="entity-btn primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </button>
            <button type="button" className="entity-btn" onClick={cancelForm} disabled={isSubmitting}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {vendors.length === 0 && !isAdding && !editingVendor ? (
        <div className="entity-panel-empty">No vendors added yet.</div>
      ) : (
        <div className="leads-table-container">
          <table className="leads-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Address</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.vendor_id} className={!v.is_active ? "inactive-row" : ""}>
                  <td data-label="Name">
                    <div style={{ fontWeight: 500 }}>{v.name}</div>
                  </td>
                  <td data-label="Contact">
                    {v.contact_name ? <div>{v.contact_name}</div> : null}
                    {v.email ? <div style={{ fontSize: "13px", color: "var(--app-text-muted)" }}>{v.email}</div> : null}
                    {v.phone ? <div style={{ fontSize: "13px", color: "var(--app-text-muted)" }}>{v.phone}</div> : null}
                    {!v.contact_name && !v.email && !v.phone ? "—" : null}
                  </td>
                  <td data-label="Address">{v.address || "—"}</td>
                  <td data-label="Status">
                    <span className={`project-status-badge ${v.is_active ? "completed" : "rejected"}`}>
                      {v.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td data-label="Actions" className="leads-table-action-cell" style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="entity-btn"
                        onClick={() => startEditing(v)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="entity-btn"
                        onClick={() => handleToggleActive(v)}
                      >
                        {v.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
