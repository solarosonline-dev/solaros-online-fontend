import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMyEntityMetrics, type AdminEntityMetrics } from "../../api/adminMetrics";
import { getEntity } from "../../api/entity";
import { useAuth } from "../../lib/AuthContext";
import { ApiError } from "../../api/client";
import { formatMoneyShort } from "../../lib/money";
import "./MobileDashboardPage.css";

export default function MobileDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<AdminEntityMetrics | null>(null);
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const entityId = user?.entity_id;

    Promise.all([
      getMyEntityMetrics(),
      entityId != null ? getEntity(entityId) : Promise.resolve(null),
    ])
      .then(([metricsRes, entityRes]) => {
        if (cancelled) return;
        setMetrics(metricsRes);
        setCurrency(entityRes?.currency);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : "Failed to load mobile metrics");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.entity_id]);

  if (loading) {
    return (
      <div className="mobile-dashboard-loading-container">
        <div className="mobile-dashboard-spinner" />
        <p>Updating dashboard...</p>
      </div>
    );
  }

  if (loadError || !metrics) {
    return (
      <div className="mobile-dashboard-error-container">
        <span>⚠️</span>
        <p>{loadError ?? "Unable to fetch metrics"}</p>
        <button onClick={() => window.location.reload()} className="mobile-dashboard-retry-btn">
          Retry
        </button>
      </div>
    );
  }

  const { leads, quotes, projects, workorders } = metrics;

  return (
    <div className="mobile-dashboard-page">
      <div className="mobile-dashboard-welcome">
        <h2>Hello, {user?.full_name?.split(" ")[0]}! 👋</h2>
        <p className="mobile-dashboard-entity-name">{metrics.entity_name}</p>
      </div>

      {/* Hero Financial Banner */}
      <div className="mobile-dashboard-revenue-banner">
        <span className="revenue-banner-title">Realized Revenue</span>
        <span className="revenue-banner-value">
          {formatMoneyShort(projects.completed_amount || 0, currency)}
        </span>
        <div className="revenue-banner-subtext">
          <span>Pipeline: {formatMoneyShort(quotes.quotes_total_amount || 0, currency)}</span>
        </div>
      </div>

      {/* Tile Grid */}
      <div className="mobile-dashboard-tiles-grid">
        <div className="mobile-dashboard-tile" onClick={() => navigate("/app/leads")}>
          <div className="mobile-tile-icon-wrapper" style={{ backgroundColor: "#eff6ff" }}>
            <span style={{ color: "#2563eb" }}>👤</span>
          </div>
          <span className="mobile-tile-value">{leads.leads_count}</span>
          <span className="mobile-tile-label">Total Leads</span>
        </div>

        <div className="mobile-dashboard-tile" onClick={() => navigate("/app/leads")}>
          <div className="mobile-tile-icon-wrapper" style={{ backgroundColor: "#ecfdf5" }}>
            <span style={{ color: "#10b981" }}>🌟</span>
          </div>
          <span className="mobile-tile-value">{projects.projects_active_count}</span>
          <span className="mobile-tile-label">Active Projects</span>
        </div>

        <div className="mobile-dashboard-tile" onClick={() => navigate("/app/my-work-orders")}>
          <div className="mobile-tile-icon-wrapper" style={{ backgroundColor: "#fef3c7" }}>
            <span style={{ color: "#d97706" }}>⚙️</span>
          </div>
          <span className="mobile-tile-value">
            {workorders.workorders_generated_count - workorders.workorders_completed_count}
          </span>
          <span className="mobile-tile-label">Pending Work</span>
        </div>

        <div className="mobile-dashboard-tile" onClick={() => navigate("/app/entity")}>
          <div className="mobile-tile-icon-wrapper" style={{ backgroundColor: "#fdf2f8" }}>
            <span style={{ color: "#db2777" }}>🏢</span>
          </div>
          <span className="mobile-tile-value">Settings</span>
          <span className="mobile-tile-label">Configuration</span>
        </div>
      </div>

      {/* Touch-Friendly Action Buttons */}
      <div className="mobile-dashboard-quick-actions">
        <h3>Quick Actions</h3>
        <button
          type="button"
          className="mobile-dashboard-action-btn"
          onClick={() => navigate("/app/leads/new")}
        >
          <span className="action-btn-icon">➕</span>
          <div className="action-btn-text">
            <h4>Add New Lead</h4>
            <p>Register client contact and site details</p>
          </div>
          <span className="action-btn-arrow">➡️</span>
        </button>

        <button
          type="button"
          className="mobile-dashboard-action-btn"
          onClick={() => navigate("/app/my-work-orders")}
        >
          <span className="action-btn-icon">📝</span>
          <div className="action-btn-text">
            <h4>My Work Orders</h4>
            <p>Execute checklists and upload site reports</p>
          </div>
          <span className="action-btn-arrow">➡️</span>
        </button>
      </div>
    </div>
  );
}
