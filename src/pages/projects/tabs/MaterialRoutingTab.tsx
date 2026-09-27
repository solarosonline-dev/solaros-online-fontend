import { useState } from "react";
import { routeMaterials, createProcurementOrder, type RouteSuggestion, type RouteMaterialRequestItem } from "../../../api/procurement";
import { type MaterialType, type MaterialUnit } from "../../../api/warehouses";
import { ApiError } from "../../../api/client";

type Props = {
  entityId: number;
  projectId: number;
};

export default function MaterialRoutingTab({ entityId, projectId }: Props) {
  const [items, setItems] = useState<RouteMaterialRequestItem[]>([]);
  const [suggestions, setSuggestions] = useState<RouteSuggestion[] | null>(null);
  const [unfulfillable, setUnfulfillable] = useState<RouteMaterialRequestItem[] | null>(null);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  // New item form
  const [materialType, setMaterialType] = useState<MaterialType>("PANEL");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [unit, setUnit] = useState<MaterialUnit>("PIECES");

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (quantity === "" || quantity <= 0) return;
    
    setItems((prev) => [
      ...prev,
      {
        material_type: materialType,
        make: make.trim() || null,
        model: model.trim() || null,
        quantity: Number(quantity),
        unit,
      },
    ]);
    setMake("");
    setModel("");
    setQuantity("");
    setSuggestions(null);
    setUnfulfillable(null);
  }

  function handleRemoveItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setSuggestions(null);
    setUnfulfillable(null);
  }

  async function handleRoute() {
    if (items.length === 0) return;
    setIsRouting(true);
    setRoutingError(null);
    try {
      const res = await routeMaterials(entityId, { project_id: projectId, items });
      setSuggestions(res.suggestions);
      setUnfulfillable(res.unfulfillable_items);
    } catch (err) {
      if (err instanceof ApiError) setRoutingError(err.message);
      else setRoutingError("Failed to calculate routes");
    } finally {
      setIsRouting(false);
    }
  }

  async function handleCreateOrder(suggestion: RouteSuggestion) {
    setIsCreatingOrder(true);
    try {
      await createProcurementOrder(entityId, {
        project_id: projectId,
        warehouse_id: suggestion.warehouse_id,
        items: suggestion.items,
        // Optional notes indicating it was auto-routed
        notes: `Auto-routed from ${suggestion.warehouse_name} (${suggestion.distance_km.toFixed(1)} km away)`,
      });
      alert(`Procurement order created for warehouse: ${suggestion.warehouse_name}`);
      // Remove the items we just ordered from the active BOM so we don't double-order
      const fulfilledSignatures = new Set(suggestion.items.map(i => `${i.material_type}:${i.make}:${i.model}:${i.unit}`));
      setItems(prev => {
        return prev.map(item => {
          const sig = `${item.material_type}:${item.make}:${item.model}:${item.unit}`;
          if (fulfilledSignatures.has(sig)) {
             const matchingFulfillment = suggestion.items.find(i => `${i.material_type}:${i.make}:${i.model}:${i.unit}` === sig);
             if (matchingFulfillment) {
               return { ...item, quantity: item.quantity - matchingFulfillment.quantity };
             }
          }
          return item;
        }).filter(item => item.quantity > 0);
      });
      // Clear routes to force recalculation of remaining items
      setSuggestions(null);
      setUnfulfillable(null);
    } catch (err) {
      alert("Failed to create procurement order");
    } finally {
      setIsCreatingOrder(false);
    }
  }

  return (
    <div className="project-detail-panel">
      <h3 style={{ margin: "0 0 16px" }}>Material Routing & Procurement</h3>
      <p style={{ margin: "0 0 24px", color: "var(--app-text-muted)" }}>
        Build a Bill of Materials (BOM) and let the engine find the closest warehouses with available stock.
      </p>

      <div className="routing-layout">
        {/* Left: BOM Builder */}
        <div className="add-lead-panel" style={{ flex: 1, margin: 0, width: "100%", boxSizing: "border-box" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: "14px" }}>Bill of Materials</h4>
          
          <form onSubmit={handleAddItem} className="bom-form-grid">
            <div>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>Type</label>
              <select value={materialType} onChange={(e) => setMaterialType(e.target.value as MaterialType)} style={{ width: "100%", padding: "6px" }}>
                <option value="PANEL">Panel</option>
                <option value="INVERTER">Inverter</option>
                <option value="MOUNTING_STRUCTURE">Mounting</option>
                <option value="CABLE">Cable</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>Make</label>
              <input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Make" style={{ width: "100%", padding: "6px" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>Model</label>
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" style={{ width: "100%", padding: "6px" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>Qty</label>
              <input type="number" min="0" step="0.1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} style={{ width: "100%", padding: "6px" }} required />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>Unit</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value as MaterialUnit)} style={{ width: "100%", padding: "6px" }}>
                <option value="PIECES">Pieces</option>
                <option value="METERS">Meters</option>
                <option value="KGS">Kgs</option>
              </select>
            </div>
            <button type="submit" className="entity-btn primary" style={{ padding: "6px 12px", height: "31px" }}>Add</button>
          </form>

          {items.length === 0 ? (
            <div className="entity-panel-empty" style={{ padding: "16px", minHeight: "auto" }}>No items in BOM.</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
              {items.map((item, i) => (
                <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--app-border)" }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{item.quantity} {item.unit.toLowerCase()}</span> of {item.material_type}
                    {(item.make || item.model) && (
                      <span style={{ color: "var(--app-text-muted)", marginLeft: "8px" }}>
                        ({item.make} {item.model})
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={() => handleRemoveItem(i)} style={{ background: "none", border: "none", color: "var(--app-danger-text)", cursor: "pointer" }}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="entity-btn primary"
            style={{ width: "100%" }}
            onClick={handleRoute}
            disabled={items.length === 0 || isRouting}
          >
            {isRouting ? "Calculating routes..." : "Find Warehouses"}
          </button>
          {routingError && <div className="leads-status error" style={{ marginTop: "12px" }}>{routingError}</div>}
        </div>

        {/* Right: Routing Suggestions */}
        <div style={{ flex: 1 }}>
          {suggestions === null && unfulfillable === null ? (
            <div className="entity-panel-empty" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              Run "Find Warehouses" to see fulfillment options.
            </div>
          ) : (
            <div>
              <h4 style={{ margin: "0 0 12px", fontSize: "14px" }}>Fulfillment Suggestions</h4>
              {suggestions?.length === 0 ? (
                <div style={{ background: "var(--app-bg-muted)", padding: "16px", borderRadius: "var(--app-radius)", marginBottom: "16px" }}>
                  No active warehouses have stock for these items.
                </div>
              ) : (
                suggestions?.map((s) => (
                  <div key={s.warehouse_id} style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius)", padding: "16px", marginBottom: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{s.warehouse_name}</div>
                        <div style={{ fontSize: "12px", color: "var(--app-text-muted)" }}>{s.distance_km.toFixed(1)} km away</div>
                      </div>
                      <button
                        type="button"
                        className="entity-btn primary"
                        disabled={isCreatingOrder}
                        onClick={() => handleCreateOrder(s)}
                      >
                        Create Order
                      </button>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px" }}>
                      {s.items.map((item, i) => (
                        <li key={i}>
                          {item.quantity} {item.unit.toLowerCase()} - {item.material_type} {item.make} {item.model}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}

              {unfulfillable && unfulfillable.length > 0 && (
                <div style={{ background: "var(--app-danger-bg)", border: "1px solid var(--app-danger-border)", borderRadius: "var(--app-radius)", padding: "16px" }}>
                  <div style={{ fontWeight: 500, color: "var(--app-danger-text)", marginBottom: "8px" }}>Unfulfillable Items (Out of Stock)</div>
                  <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "var(--app-danger-text)" }}>
                    {unfulfillable.map((item, i) => (
                      <li key={i}>
                        {item.quantity} {item.unit.toLowerCase()} - {item.material_type} {item.make} {item.model}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
