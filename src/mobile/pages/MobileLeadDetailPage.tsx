import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getLead, type LeadDetail } from "../../api/leads";
import { ApiError } from "../../api/client";
import { LeadStatusBadge } from "../../pages/leads/leadFunnel";
import LeadWorkOrders from "../../pages/leads/LeadWorkOrders";
import LeadSiteImages from "../../pages/leads/LeadSiteImages";
import { useAuth } from "../../lib/AuthContext";
import { isAgent } from "../../lib/roles";
import "./MobileLeadDetailPage.css";

export default function MobileLeadDetailPage() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const entityId = user!.entity_id!;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // States for Site Images component (as required by LeadSiteImages pattern)
  const [images, setImages] = useState<any[]>([]);
  const imagesLoading = false;
  const imagesError = null;

  function load() {
    if (!leadId) return;
    setLoading(true);
    setLoadError(null);
    getLead(entityId, Number(leadId), isAgent(user!.roles))
      .then((res) => {
        setLead(res);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Failed to load lead details");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, leadId]);

  if (loading) {
    return (
      <div className="mobile-detail-state">
        <div className="mobile-detail-spinner" />
        <p>Fetching lead details...</p>
      </div>
    );
  }

  if (loadError || !lead) {
    return (
      <div className="mobile-detail-state error">
        <span>⚠️</span>
        <p>{loadError ?? "Lead not found"}</p>
        <button onClick={() => navigate("/app/leads")} className="mobile-detail-back-btn">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="mobile-lead-detail-page">
      {/* Header with quick back link */}
      <div className="mobile-detail-header">
        <button type="button" className="detail-back-arrow" onClick={() => navigate("/app/leads")}>
          ⬅️ Directory
        </button>
        <LeadStatusBadge status={lead.status} />
      </div>

      {/* Main client overview card */}
      <div className="mobile-detail-hero">
        <h2>{lead.name}</h2>
        <p className="detail-hero-address">📍 {lead.address || "No address added"}</p>

        {/* Tactile Communication triggers */}
        <div className="detail-hero-actions">
          <a href={`tel:${lead.mobile}`} className="detail-action-circle">
            <span className="action-circle-icon">📞</span>
            <span className="action-circle-label">Call</span>
          </a>
          <a
            href={`https://wa.me/${lead.mobile.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="detail-action-circle"
            style={{ backgroundColor: "#ecfdf5", border: "1px solid #a7f3d0" }}
          >
            <span className="action-circle-icon" style={{ color: "#10b981" }}>💬</span>
            <span className="action-circle-label" style={{ color: "#065f46" }}>WhatsApp</span>
          </a>
          {lead.latitude && lead.longitude ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${lead.latitude},${lead.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="detail-action-circle"
              style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}
            >
              <span className="action-circle-icon" style={{ color: "#2563eb" }}>🗺️</span>
              <span className="action-circle-label" style={{ color: "#1e40af" }}>Maps</span>
            </a>
          ) : null}
        </div>
      </div>

      {/* Accordion detail cards */}
      <div className="mobile-detail-sections">
        
        {/* SECTION 1: SYSTEM & CONNECTION DETAILS */}
        <div className="mobile-detail-card-item">
          <h3>System & Utility</h3>
          <div className="detail-card-grid">
            <div className="grid-item">
              <span className="grid-label">Sanctioned Load</span>
              <span className="grid-value">{lead.sanctioned_load != null ? `${lead.sanctioned_load} kW` : "—"}</span>
            </div>
            <div className="grid-item">
              <span className="grid-label">Meter Phase</span>
              <span className="grid-value">{lead.metertype || "—"}</span>
            </div>
            <div className="grid-item">
              <span className="grid-label">CA Number</span>
              <span className="grid-value">{lead.ca_number || "—"}</span>
            </div>
            <div className="grid-item">
              <span className="grid-label">Roof Size</span>
              <span className="grid-value">{lead.roof_area_sqft != null ? `${lead.roof_area_sqft} sqft` : "—"}</span>
            </div>
            <div className="grid-item" style={{ gridColumn: "span 2" }}>
              <span className="grid-label">Requirement comments</span>
              <p className="grid-paragraph">{lead.requirement || "No custom comment added."}</p>
            </div>
          </div>
        </div>

        {/* SECTION 2: WORK ORDERS / SITE SURVEYS */}
        <div className="mobile-detail-card-item">
          <h3>Site Surveys</h3>
          <p className="section-meta-desc">Schedule and view site survey work orders below.</p>
          <div className="mobile-detail-wo-wrapper">
            <LeadWorkOrders entityId={entityId} leadId={lead.lead_id} />
          </div>
        </div>

        {/* SECTION 3: ATTACHMENTS & SITE IMAGES */}
        <div className="mobile-detail-card-item">
          <h3>Site Images</h3>
          <div className="mobile-detail-images-wrapper">
            <LeadSiteImages
              entityId={entityId}
              leadId={lead.lead_id}
              images={images}
              loading={imagesLoading}
              loadError={imagesError}
              onImagesChange={setImages}
              onPreviewChange={() => {}}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
