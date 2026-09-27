import { useEffect, useState } from "react";
import {
  listInventory,
  addInventoryItem,
  updateInventoryItem,
  type InventoryItem,
  type MaterialType,
  type MaterialUnit,
} from "../../../api/warehouses";
import { ApiError } from "../../../api/client";

const MATERIAL_TYPES: Record<MaterialType, string> = {
  PANEL: "Solar Panel",
  INVERTER: "Inverter",
  MOUNTING_STRUCTURE: "Mounting Structure",
  CABLE: "Cable",
  OTHER: "Other",
};

const UNITS: Record<MaterialUnit, string> = {
  PIECES: "Pieces",
  METERS: "Meters",
  KGS: "Kilograms",
};

type Props = {
  entityId: number;
  warehouseId: number;
};

export default function InventoryList({ entityId, warehouseId }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<MaterialType>("PANEL");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<MaterialUnit>("PIECES");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState("");

  function load() {
    listInventory(entityId, warehouseId)
      .then((res) => {
        setItems(res.items);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message);
        else setError("Failed to load inventory");
        setLoading(false);
      });
  }

  useEffect(load, [entityId, warehouseId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setAddError("Enter a valid positive quantity");
      return;
    }

    setIsAdding(true);
    setAddError(null);
    try {
      const added = await addInventoryItem(entityId, warehouseId, {
        material_type: type,
        make: make.trim() || null,
        model: model.trim() || null,
        quantity_available: qty,
        unit,
      });
      // The backend upserts by type/make/model, so we might get back an updated
      // existing row rather than a purely new one. Replace or append accordingly.
      setItems((prev) => {
        const exists = prev.findIndex((i) => i.inventory_id === added.inventory_id);
        if (exists >= 0) {
          const next = [...prev];
          next[exists] = added;
          return next;
        }
        return [...prev, added].sort((a, b) => a.material_type.localeCompare(b.material_type));
      });
      setMake("");
      setModel("");
      setQuantity("");
    } catch (err) {
      if (err instanceof ApiError) setAddError(err.message);
      else setAddError("Failed to add inventory");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleSaveEdit(item: InventoryItem) {
    const qty = parseFloat(editQuantity);
    if (isNaN(qty) || qty < 0) {
      alert("Enter a valid non-negative quantity");
      return;
    }

    try {
      const updated = await updateInventoryItem(entityId, warehouseId, item.inventory_id, {
        quantity_available: qty,
      });
      setItems((prev) => prev.map((i) => (i.inventory_id === updated.inventory_id ? updated : i)));
      setEditingId(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to update quantity");
    }
  }

  if (loading) return <div className="entity-panel-empty" style={{ padding: "20px 0" }}>Loading inventory...</div>;
  if (error) return <div className="entity-panel-empty error" style={{ padding: "20px 0" }}>{error}</div>;

  return (
    <div className="inventory-list">
      <form onSubmit={handleAdd} className="add-lead-upload" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", alignItems: "end" }}>
        <div className="add-lead-field" style={{ marginBottom: 0 }}>
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as MaterialType)}>
            {Object.entries(MATERIAL_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="add-lead-field" style={{ marginBottom: 0 }}>
          <label>Make (Optional)</label>
          <input value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Longi" />
        </div>
        <div className="add-lead-field" style={{ marginBottom: 0 }}>
          <label>Model (Optional)</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. Hi-MO 5" />
        </div>
        
        <div className="add-lead-field" style={{ marginBottom: 0 }}>
          <label>Quantity</label>
          <input type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
        </div>
        <div className="add-lead-field" style={{ marginBottom: 0 }}>
          <label>Unit</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value as MaterialUnit)}>
            {Object.entries(UNITS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="entity-btn primary" disabled={isAdding} style={{ height: "36px" }}>
          {isAdding ? "Adding..." : "+ Add to stock"}
        </button>
        {addError && <div className="leads-status error" style={{ gridColumn: "1 / -1" }}>{addError}</div>}
      </form>

      {items.length === 0 ? (
        <div className="entity-panel-empty" style={{ padding: "24px 0", border: "none" }}>No inventory items recorded.</div>
      ) : (
        <div className="leads-table-container" style={{ marginTop: "24px" }}>
          <table className="leads-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Equipment</th>
                <th>Quantity</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.inventory_id}>
                  <td data-label="Type">{MATERIAL_TYPES[item.material_type]}</td>
                  <td data-label="Equipment">
                    {[item.make, item.model].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td data-label="Quantity">
                    {editingId === item.inventory_id ? (
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          style={{ width: "80px", padding: "4px 8px", borderRadius: "4px", border: "1px solid #ccc" }}
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                        />
                        <span style={{ fontSize: "13px", color: "var(--app-text-muted)" }}>{UNITS[item.unit]}</span>
                      </div>
                    ) : (
                      <span>{item.quantity_available} {UNITS[item.unit]}</span>
                    )}
                  </td>
                  <td data-label="Actions" className="leads-table-action-cell" style={{ textAlign: "right" }}>
                    {editingId === item.inventory_id ? (
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <button type="button" className="entity-btn primary" onClick={() => handleSaveEdit(item)}>
                          Save
                        </button>
                        <button type="button" className="entity-btn" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="entity-btn"
                        onClick={() => {
                          setEditingId(item.inventory_id);
                          setEditQuantity(String(item.quantity_available));
                        }}
                      >
                        Adjust Stock
                      </button>
                    )}
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
