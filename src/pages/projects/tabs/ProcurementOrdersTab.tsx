import { useEffect, useState } from "react";
import { listProcurementOrders, type ProcurementOrderResponse } from "../../../api/procurement";
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
          <div key={order.procurement_id} style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", borderRadius: "var(--app-radius)", padding: "16px", overflowX: "auto" }}>
            <div className="procurement-order-header">
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
            
            <h4 style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--app-text-muted)", textTransform: "uppercase" }}>Items</h4>
            <div className="leads-table-container" style={{ margin: 0 }}>
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
          </div>
        ))}
      </div>
    </div>
  );
}
