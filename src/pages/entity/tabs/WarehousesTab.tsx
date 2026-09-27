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

  function load() {
    Promise.all([
      listWarehouses(entityId),
      listEntityVendors(entityId)
    ])
      .then(([whRes, venRes]) => {
        setWarehouses(whRes.items);
        setVendors(venRes.items.filter(v => v.is_active));
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

  if (selectedWarehouse) {
    return (
      <div className="warehouse-inventory-view">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px" }}>Inventory: {selectedWarehouse.name}</h3>
            <div style={{ fontSize: "13px", color: "var(--app-text-muted)" }}>
              {selectedWarehouse.address || "No address specified"}
            </div>
          </div>
          <button type="button" className="entity-btn" onClick={() => setSelectedWarehouse(null)}>
            ← Back to warehouses
          </button>
        </div>
        <InventoryList entityId={entityId} warehouseId={selectedWarehouse.warehouse_id} />
      </div>
    );
  }

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
