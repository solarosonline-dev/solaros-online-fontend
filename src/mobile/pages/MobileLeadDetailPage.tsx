import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  agentSetLeadStage,
  assignSalesRep,
  formatStageLabel,
  getLead,
  listSalesReps,
  setLeadWorkflowStage,
  type LeadDetail,
  type SalesRep,
} from "../../api/leads";
import { ApiError } from "../../api/client";
import { LeadStageBadge } from "../../pages/leads/leadFunnel";
import { useLeadWorkflow } from "../../lib/useLeadWorkflow";
import LeadWorkOrders from "../../pages/leads/LeadWorkOrders";
import LeadSiteImages from "../../pages/leads/LeadSiteImages";
import { useAuth } from "../../lib/AuthContext";
import { canManageLeads, hasFeature, isAgent } from "../../lib/roles";
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

  // Stage + sales rep controls (same rules as the web lead page): everyone who
  // can open the lead can move its stage; only admins/sales managers can
  // (re)assign the rep, others just see who it is.
  const { stages } = useLeadWorkflow(entityId);
  const canAssignRep = canManageLeads(user!.roles);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!canAssignRep || !hasFeature(user, "CRM")) return;
    listSalesReps(entityId)
      .then((res) => setSalesReps(res.items))
      .catch(() => setSalesReps([]));
  }, [entityId, canAssignRep]); // eslint-disable-line react-hooks/exhaustive-deps

  async function changeStage(stage: string) {
    if (!lead || stage === lead.agent_stage) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = isAgent(user!.roles)
        ? await agentSetLeadStage(entityId, lead.lead_id, stage)
        : await setLeadWorkflowStage(entityId, lead.lead_id, stage);
      setLead((prev) => (prev ? { ...prev, agent_stage: res.agent_stage } : prev));
      setNotice({ kind: "success", message: `Moved to ${formatStageLabel(stage)}.` });
    } catch (err) {
      setNotice({ kind: "error", message: err instanceof ApiError ? err.message : "Could not move the lead" });
    } finally {
      setSaving(false);
    }
  }

  async function changeRep(value: string) {
    if (!lead) return;
    const next = value === "" ? null : Number(value);
    if (next === (lead.assigned_sales_rep_id ?? null)) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await assignSalesRep(entityId, lead.lead_id, next);
      setLead((prev) =>
        prev
          ? { ...prev, assigned_sales_rep_id: res.assigned_sales_rep_id, assigned_sales_rep_name: res.assigned_sales_rep_name }
          : prev,
      );
      setNotice({
        kind: "success",
        message: res.assigned_sales_rep_name ? `Assigned to ${res.assigned_sales_rep_name}.` : "Sales rep removed.",
      });
    } catch (err) {
      setNotice({ kind: "error", message: err instanceof ApiError ? err.message : "Could not assign the sales rep" });
    } finally {
      setSaving(false);
    }
  }

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
        <LeadStageBadge stage={lead.agent_stage} rejected={lead.status === "REJECTED"} />
      </div>

      {/* Main client overview card */}
      <div className="mobile-detail-hero">
        <h2>{lead.name}</h2>
        <p className="detail-hero-address">📍 {lead.address || "No address added"}</p>

        {/* Tactile Communication triggers */}
        <div className="m-comm-row" style={{ width: "100%" }}>
          <a href={`tel:${lead.mobile}`} className="m-comm-btn call">
            📞 Call Client
          </a>
          <a
            href={`https://wa.me/${lead.mobile.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="m-comm-btn wa"
          >
            💬 WhatsApp
          </a>
          {lead.latitude && lead.longitude ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${lead.latitude},${lead.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="m-comm-btn nav"
            >
              🗺️ Navigate
            </a>
          ) : null}
        </div>
      </div>

      {/* Stage + sales rep: two compact fields side by side */}
      <div className="mobile-detail-card-item mobile-detail-assign">
        <div className="mobile-detail-assign-grid">
          {lead.status !== "REJECTED" && (
            <label className="mobile-detail-field">
              <span className="grid-label">Stage</span>
              <select value={lead.agent_stage ?? "NEW"} disabled={saving} onChange={(e) => changeStage(e.target.value)}>
                {(stages.includes(lead.agent_stage ?? "NEW") ? stages : [lead.agent_stage ?? "NEW", ...stages]).map((st) => (
                  <option key={st} value={st}>
                    {formatStageLabel(st)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {canAssignRep ? (
            <label className="mobile-detail-field">
              <span className="grid-label">Sales rep</span>
              <select value={lead.assigned_sales_rep_id ?? ""} disabled={saving} onChange={(e) => changeRep(e.target.value)}>
                <option value="">Unassigned</option>
                {lead.assigned_sales_rep_id != null && !salesReps.some((r) => r.user_id === lead.assigned_sales_rep_id) && (
                  <option value={lead.assigned_sales_rep_id}>{lead.assigned_sales_rep_name ?? "Former rep"}</option>
                )}
                {salesReps.map((r) => (
                  <option key={r.user_id} value={r.user_id}>
                    {r.full_name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="mobile-detail-field">
              <span className="grid-label">Sales rep</span>
              <span className="grid-value">{lead.assigned_sales_rep_name ?? "Unassigned"}</span>
            </div>
          )}
        </div>
        {notice && <p className={`mobile-detail-notice ${notice.kind}`}>{notice.message}</p>}
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
