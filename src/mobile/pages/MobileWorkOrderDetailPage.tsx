import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import {
  getWorkOrder,
  updateWorkOrderStatus,
  type WorkOrderDetail,
} from "../../api/workOrders";
import { ApiError } from "../../api/client";
import WorkOrderDocuments from "../../pages/projects/WorkOrderDocuments";
import CommissioningPanel from "../../pages/projects/CommissioningPanel";
import SiteDesignPanel from "../../pages/projects/SiteDesignPanel";
import "./MobileWorkOrderDetailPage.css";

export default function MobileWorkOrderDetailPage() {
  const { workOrderId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const entityId = user!.entity_id!;

  const [wo, setWo] = useState<WorkOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [transitioning, setTransitioning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  function load() {
    if (!workOrderId) return;
    setLoading(true);
    setLoadError(null);
    getWorkOrder(entityId, Number(workOrderId))
      .then(setWo)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "Failed to load work order")
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, workOrderId]);

  const handleTransition = async (target: "IN_PROGRESS" | "COMPLETED") => {
    if (!workOrderId) return;
    setTransitioning(true);
    setStatusMessage(null);

    try {
      const res = await updateWorkOrderStatus(entityId, Number(workOrderId), target);
      setWo((prev) => (prev ? { ...prev, status: res.status, closed_at: res.closed_at } : prev));
      setStatusMessage({
        kind: "success",
        message: `Work Order marked as ${res.status.replace("_", " ")} successfully!`,
      });
    } catch (err) {
      setStatusMessage({
        kind: "error",
        message: err instanceof ApiError ? err.message : "Failed to change status",
      });
    } finally {
      setTransitioning(false);
    }
  };

  if (loading) {
    return (
      <div className="mobile-detail-state">
        <div className="mobile-detail-spinner" />
        <p>Syncing task specifications...</p>
      </div>
    );
  }

  if (loadError || !wo) {
    return (
      <div className="mobile-detail-state error">
        <span>⚠️</span>
        <p>{loadError ?? "Work order details not found"}</p>
        <button onClick={() => navigate("/app/my-work-orders")} className="mobile-detail-back-btn">
          Go Back
        </button>
      </div>
    );
  }

  const isNew = wo.status === "NEW";
  const isInProgress = wo.status === "IN_PROGRESS";
  const isCompleted = wo.status === "COMPLETED";

  return (
    <div className="mobile-wo-detail-page">
      {/* Header back navigation bar */}
      <div className="mobile-detail-header">
        <button
          type="button"
          className="detail-back-arrow"
          onClick={() => {
            if (wo.project_id) {
              navigate("/app/my-work-orders");
            } else {
              navigate(`/app/leads/${wo.lead.lead_id}`);
            }
          }}
        >
          ⬅️ Back
        </button>
        <span className={`detail-status-badge ${isCompleted ? "completed" : ""}`}>
          {wo.status}
        </span>
      </div>

      {/* Hero Overview */}
      <div className="mobile-wo-detail-hero">
        <span className="wo-type-label">{wo.type.replace("_", " ")}</span>
        <h2>{wo.lead.name}</h2>
        <p className="wo-hero-address">📍 {wo.lead.address || "No address added"}</p>

        {/* Tactile customer anchors */}
        <div className="wo-hero-actions">
          <a href={`tel:${wo.lead.mobile}`} className="detail-action-circle">
            <span className="action-circle-icon">📞</span>
            <span className="action-circle-label">Call Client</span>
          </a>
          <a
            href={`https://wa.me/${wo.lead.mobile.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="detail-action-circle"
            style={{ backgroundColor: "#ecfdf5", border: "1px solid #a7f3d0" }}
          >
            <span className="action-circle-icon" style={{ color: "#10b981" }}>💬</span>
            <span className="action-circle-label" style={{ color: "#065f46" }}>WhatsApp</span>
          </a>
          {wo.lead.latitude && wo.lead.longitude ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${wo.lead.latitude},${wo.lead.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="detail-action-circle"
              style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}
            >
              <span className="action-circle-icon" style={{ color: "#2563eb" }}>🗺️</span>
              <span className="action-circle-label" style={{ color: "#1e40af" }}>Navigate</span>
            </a>
          ) : null}
        </div>
      </div>

      {/* Dynamic Workflow Actions */}
      <div className="mobile-wo-action-panel">
        {statusMessage && (
          <div className={`wo-status-message-alert ${statusMessage.kind}`}>
            {statusMessage.kind === "success" ? "✅" : "⚠️"} {statusMessage.message}
          </div>
        )}

        {isNew && (
          <button
            type="button"
            className="wo-execution-primary-btn active-state"
            disabled={transitioning}
            onClick={() => handleTransition("IN_PROGRESS")}
          >
            {transitioning ? "Processing..." : "🚀 Start This Task"}
          </button>
        )}

        {isInProgress && (
          <button
            type="button"
            className="wo-execution-primary-btn success active-state"
            disabled={transitioning}
            onClick={() => handleTransition("COMPLETED")}
          >
            {transitioning ? "Saving completion..." : "✅ Mark as Completed"}
          </button>
        )}

        {isCompleted && (
          <div className="wo-completion-banner">
            🎉 This work order is fully completed and signed off!
          </div>
        )}
      </div>

      {/* Integration panels and Document Upload cards */}
      <div className="mobile-wo-sections">
        
        <div className="mobile-detail-card-item">
          <h3>Execution Reports & Photos</h3>
          <p className="section-meta-desc">
            Upload on-site site surveys, equipment installation lists, and photos below. Camera capture is supported directly.
          </p>
          <WorkOrderDocuments
            entityId={entityId}
            workOrderId={wo.work_order_id}
            onDocumentsChange={() => {}}
            onAnyDocumentChange={() => {}}
          />
        </div>

        {wo.type === "COMMISSIONING" && (
          <div className="mobile-detail-card-item">
            <h3>Commissioning specifications</h3>
            <CommissioningPanel
              entityId={entityId}
              workOrderId={wo.work_order_id}
            />
          </div>
        )}

        {wo.type === "SITE_DESIGN" && (
          <div className="mobile-detail-card-item">
            <h3>Site Layout & Spatial Specifications</h3>
            <SiteDesignPanel
              entityId={entityId}
              workOrderId={wo.work_order_id}
              projectId={wo.project_id}
              leadId={wo.lead_id}
            />
          </div>
        )}

      </div>
    </div>
  );
}
