import { useEffect, useState } from "react";
import {
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  type Warehouse,
} from "../../../api/warehouses";
import { listEntityVendors, type Vendor } from "../../../api/vendors";
import { ApiError } from "../../../api/client";
import LocationPicker from "../../../components/map/LocationPicker";
import InventoryList from "./InventoryList";

type Props = {
  entityId: number;
};

export default function WarehousesTab({ entityId }: Props) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVendorId, setNewVendorId] = useState<number | "">("");
  const [newAddress, setNewAddress] = useState("");
  const [newLatitude, setNewLatitude] = useState<number | null>(null);
  const [newLongitude, setNewLongitude] = useState<number | null>(null);
  const [addingError, setAddingError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);

  const isMobile = document.body.classList.contains("mobile-view");

  function load() {
    Promise.all([listWarehouses(entityId), listEntityVendors(entityId)])
      .then(([whRes, venRes]) => {
        setWarehouses(whRes.items);
        setVendors(venRes.items.filter((v) => v.is_active));
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message);
        else setError("Failed to load warehouses");
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
        vendor_id: newVendorId === "" ? null : newVendorId,
        address: newAddress.trim() || null,
        latitude: newLatitude,
        longitude: newLongitude,
        is_active: editingWarehouse ? editingWarehouse.is_active : true,
      };

      if (editingWarehouse) {
        const updated = await updateWarehouse(entityId, editingWarehouse.warehouse_id, data);
        setWarehouses((prev) => prev.map((w) => (w.warehouse_id === updated.warehouse_id ? updated : w)));
        setEditingWarehouse(null);
      } else {
        const created = await createWarehouse(entityId, data);
        setWarehouses((prev) => [...prev, created]);
        setIsAdding(false);
      }
      setNewName("");
      setNewVendorId("");
      setNewAddress("");
      setNewLatitude(null);
      setNewLongitude(null);
    } catch (err) {
      if (err instanceof ApiError) setAddingError(err.message);
      else setAddingError(editingWarehouse ? "Failed to update warehouse" : "Failed to create warehouse");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEditing(warehouse: Warehouse) {
    setEditingWarehouse(warehouse);
    setIsAdding(false);
    setNewName(warehouse.name);
    setNewVendorId(warehouse.vendor_id || "");
    setNewAddress(warehouse.address || "");
    setNewLatitude(warehouse.latitude);
    setNewLongitude(warehouse.longitude);
    setAddingError(null);
  }

  function startAdding() {
    setIsAdding(true);
    setEditingWarehouse(null);
    setNewName("");
    setNewVendorId("");
    setNewAddress("");
    setNewLatitude(null);
    setNewLongitude(null);
    setAddingError(null);
  }

  function cancelForm() {
    setIsAdding(false);
    setEditingWarehouse(null);
    setNewName("");
    setNewVendorId("");
    setNewAddress("");
    setNewLatitude(null);
    setNewLongitude(null);
    setAddingError(null);
  }

  async function handleToggleActive(warehouse: Warehouse) {
    try {
      const updated = await updateWarehouse(entityId, warehouse.warehouse_id, {
        is_active: !warehouse.is_active,
      });
      setWarehouses((prev) => prev.map((w) => (w.warehouse_id === updated.warehouse_id ? updated : w)));
      if (selectedWarehouse && selectedWarehouse.warehouse_id === updated.warehouse_id) {
        setSelectedWarehouse(updated);
      }
    } catch (err) {
      alert("Failed to update status");
    }
  }

  if (loading) return <div className="entity-panel-empty">Loading warehouses...</div>;
  if (error) return <div className="entity-panel-empty error">{error}</div>;

  // Selected Warehouse Inventory View
  if (selectedWarehouse) {
    return (
      <div className="warehouse-inventory-view">
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "center",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: isMobile ? "15px" : "18px" }}>
              Inventory: {selectedWarehouse.name}
            </h3>
            <div style={{ fontSize: "12px", color: "var(--app-text-muted)", lineHeight: "1.4" }}>
              {selectedWarehouse.address || "No address specified"}
            </div>
          </div>
          <button
            type="button"
            className="mobile-user-cancel-btn"
            onClick={() => setSelectedWarehouse(null)}
            style={{ width: isMobile ? "100%" : "auto", minHeight: "unset !important", padding: isMobile ? "10px" : "12px" }}
          >
            ← Back to Warehouses
          </button>
        </div>
        <InventoryList entityId={entityId} warehouseId={selectedWarehouse.warehouse_id} />
      </div>
    );
  }

  if (isMobile) {
    // Render High-Fidelity Mobile View
    const isModalOpen = isAdding || editingWarehouse !== null;

    return (
      <div className="mobile-warehouses-tab">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, fontFamily: "Bricolage Grotesque, sans-serif" }}>
            Registered Warehouses
          </h3>
          {!isModalOpen && (
            <button type="button" className="mobile-btn-add-primary" onClick={startAdding} style={{ margin: 0 }}>
              ➕ Add Warehouse
            </button>
          )}
        </div>

        {/* List Card Stack */}
        <div className="mobile-users-list" style={{ marginTop: "12px" }}>
          {warehouses.length === 0 ? (
            <div className="mobile-users-state empty">
              <p>No warehouses added yet.</p>
            </div>
          ) : (
            warehouses.map((w) => (
              <div key={w.warehouse_id} className={`mobile-user-card ${!w.is_active ? "inactive-row" : ""}`} style={{ padding: "14px" }}>
                <div className="mobile-user-card-main" style={{ paddingRight: 0 }}>
                  <div className="mobile-user-info">
                    <h3 style={{ fontSize: "15px" }}>{w.name}</h3>
                    <p>
                      ⚙️ Owner:{" "}
                      {w.vendor_name ? (
                        <span style={{ fontWeight: 600, color: "var(--app-accent)" }}>{w.vendor_name}</span>
                      ) : (
                        <span style={{ fontStyle: "italic" }}>Internal</span>
                      )}
                    </p>
                    {w.address && <p>📍 Address: {w.address}</p>}
                    {w.latitude !== null && w.longitude !== null && (
                      <p>
                        🔗 Map:{" "}
                        <a
                          href={`https://maps.google.com/?q=${w.latitude},${w.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ textDecoration: "underline", color: "var(--app-accent)" }}
                        >
                          Show site coordinate map
                        </a>
                      </p>
                    )}
                  </div>

                  <span className={`project-status-badge ${w.is_active ? "completed" : "rejected"}`}>
                    {w.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Mobile Operations Bar */}
                <div className="mobile-user-card-footer" style={{ marginTop: "8px", borderTop: "1px solid var(--app-border)", paddingTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="drawer-action-btn"
                    onClick={() => startEditing(w)}
                    style={{ padding: "8px 12px", width: "auto", fontSize: "12px", minHeight: "unset !important" }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="drawer-action-btn"
                    onClick={() => handleToggleActive(w)}
                    style={{
                      padding: "8px 12px",
                      width: "auto",
                      fontSize: "12px",
                      minHeight: "unset !important",
                      color: w.is_active ? "var(--app-danger)" : "var(--app-accent)"
                    }}
                  >
                    {w.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    className="drawer-action-btn primary"
                    onClick={() => setSelectedWarehouse(w)}
                    style={{ padding: "8px 12px", width: "auto", fontSize: "12px", minHeight: "unset !important" }}
                  >
                    Inventory
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Bottom Sheet overlay Form for Warehouses */}
        {isModalOpen && (
          <div className="mobile-user-modal-overlay" onClick={cancelForm}>
            <div className="mobile-user-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="mobile-user-modal-handle" onClick={cancelForm} />

              <div className="mobile-user-modal-header">
                <h3>{editingWarehouse ? "Edit Warehouse Coordinates" : "Add New Logistical Warehouse"}</h3>
                <p>Add physical coordinates and vendor partner associations to track material supply lists.</p>
              </div>

              <form onSubmit={handleCreateOrUpdate} className="mobile-user-invite-form">
                <div className="mobile-form-field">
                  <label>Warehouse Name *</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Central Delhi Hub"
                    required
                    autoFocus
                  />
                </div>

                <div className="mobile-form-field">
                  <label>Vendor Partner Link</label>
                  <select
                    value={newVendorId}
                    onChange={(e) => setNewVendorId(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <option value="">-- Internal Warehouse (No Vendor) --</option>
                    {vendors.map((v) => (
                      <option key={v.vendor_id} value={v.vendor_id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mobile-form-field">
                  <label>Physical Street Address</label>
                  <textarea
                    rows={2}
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="Physical logistics loading details..."
                    style={{ fontSize: "13px !important", padding: "10px 12px", height: "auto" }}
                  />
                </div>

                <div className="mobile-form-field">
                  <label>Geospatial Location Map coordinates</label>
                  <div className="mobile-location-picker-wrap" style={{ border: "1px solid var(--app-border)", borderRadius: "10px", padding: "8px" }}>
                    <LocationPicker
                      initialLat={newLatitude}
                      initialLng={newLongitude}
                      onLocationSelect={(lat, lng) => {
                        setNewLatitude(lat);
                        setNewLongitude(lng);
                      }}
                    />
                  </div>
                  {newLatitude !== null && newLongitude !== null && (
                    <div className="mobile-coordinates-alert" style={{ marginTop: "4px", fontSize: "11px", fontWeight: 600, color: "var(--app-text-muted)" }}>
                      📍 Coordinates verified: {newLatitude.toFixed(6)}, {newLongitude.toFixed(6)}
                    </div>
                  )}
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
                    {isSubmitting ? "Saving details..." : "🚀 Save Warehouse Profile"}
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

  // Desktop Responsive Table
  return (
    <div className="warehouses-tab">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ margin: 0 }}>Registered Warehouses</h3>
        {!isAdding && !editingWarehouse && (
          <button type="button" className="entity-btn primary" onClick={startAdding}>
            + Add warehouse
          </button>
        )}
      </div>

      {(isAdding || editingWarehouse) && (
        <form onSubmit={handleCreateOrUpdate} className="add-lead-panel" style={{ marginBottom: "24px" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: "14px" }}>{editingWarehouse ? "Edit Warehouse" : "Add New Warehouse"}</h4>
          <div className="add-lead-field">
            <label>Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. North Hub" autoFocus />
          </div>
          <div className="add-lead-field">
            <label>Vendor (Optional)</label>
            <select
              value={newVendorId}
              onChange={(e) => setNewVendorId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">-- Internal Warehouse (No Vendor) --</option>
              {vendors.map(v => (
                <option key={v.vendor_id} value={v.vendor_id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="add-lead-field">
            <label>Address</label>
            <textarea rows={2} value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
          </div>
          <div className="add-lead-field">
            <label>Map Location (Optional)</label>
            <LocationPicker
              initialLat={newLatitude}
              initialLng={newLongitude}
              onLocationSelect={(lat, lng) => {
                setNewLatitude(lat);
                setNewLongitude(lng);
              }}
            />
            {newLatitude !== null && newLongitude !== null && (
              <div style={{ fontSize: "12px", color: "var(--app-text-muted)", marginTop: "4px" }}>
                Saved: {newLatitude.toFixed(6)}, {newLongitude.toFixed(6)}
              </div>
            )}
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

      {warehouses.length === 0 && !isAdding && !editingWarehouse ? (
        <div className="entity-panel-empty">No warehouses added yet.</div>
      ) : (
        <div className="leads-table-container">
          <table className="leads-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Vendor</th>
                <th>Address</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.map((wh) => (
                <tr key={wh.warehouse_id} className={!wh.is_active ? "inactive-row" : ""}>
                  <td data-label="Name">
                    <div style={{ fontWeight: 500 }}>{wh.name}</div>
                    {wh.latitude !== null && wh.longitude !== null && (
                      <div style={{ marginTop: "4px" }}>
                        <a
                          href={`https://maps.google.com/?q=${wh.latitude},${wh.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: "12px", textDecoration: "none" }}
                        >
                          📍 Map
                        </a>
                      </div>
                    )}
                  </td>
                  <td data-label="Vendor">
                    {wh.vendor_name ? (
                      <span style={{ fontSize: "13px", color: "var(--app-text-muted)" }}>
                        🏢 {wh.vendor_name}
                      </span>
                    ) : (
                      <span style={{ fontSize: "13px", color: "var(--app-text-muted)", fontStyle: "italic" }}>
                        Internal
                      </span>
                    )}
                  </td>
                  <td data-label="Address">{wh.address || "—"}</td>
                  <td data-label="Status">
                    <span className={`project-status-badge ${wh.is_active ? "completed" : "rejected"}`}>
                      {wh.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td data-label="Actions" className="leads-table-action-cell" style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="entity-btn"
                        onClick={() => startEditing(wh)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="entity-btn"
                        onClick={() => handleToggleActive(wh)}
                      >
                        {wh.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className="entity-btn primary"
                        onClick={() => setSelectedWarehouse(wh)}
                      >
                        Manage Inventory
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
