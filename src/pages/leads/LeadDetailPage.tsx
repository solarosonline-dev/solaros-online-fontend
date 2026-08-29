import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import {
  getLead,
  updateLead,
  updateLeadStatus,
  type LeadDetail,
  type LeadStatus,
  type ManualLeadStatus,
  type ExtractedLeadData,
} from "../../api/leads";
import { ApiError } from "../../api/client";
import { getProjectForLead, type ProjectForLead } from "../../api/projects";
import BillUploadWidget from "./BillUploadWidget";
import LeadWorkOrders from "./LeadWorkOrders";
import { LeadStatusBadge } from "./leadFunnel";
import { METER_TYPES, LEAD_TYPES } from "./leadOptions";
import { STATES, getDiscomsForState } from "./discomOptions";
import "./LeadsPage.css";

function manualTransitions(status: LeadStatus): { label: string; target: ManualLeadStatus; primary: boolean }[] {
  switch (status) {
    case "NEW":
      return [{ label: "Reject lead", target: "REJECTED", primary: false }];
    case "QUOTE_GENERATED":
      return [
        { label: "Mark quote accepted", target: "QUOTE_ACCEPTED", primary: true },
        { label: "Reject lead", target: "REJECTED", primary: false },
      ];
    case "QUOTE_ACCEPTED":
      return [{ label: "Reject lead", target: "REJECTED", primary: false }];
    case "AGREEMENT_GENERATED":
      return [
        { label: "Mark agreement accepted", target: "AGREEMENT_ACCEPTED", primary: true },
        { label: "Reject lead", target: "REJECTED", primary: false },
      ];
    default:
      return [];
  }
}

export default function LeadDetailPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const { leadId } = useParams();
  const navigate = useNavigate();

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<{
    name: string;
    mobile: string;
    address: string;
    type: string;
    email: string;
    sanctioned_load: string;
    metertype: string;
    state: string;
    discom: string;
    roof_area_sqft: string;
    ca_number: string;
    avg_monthly_bill: string;
    avg_monthly_units: string;
    requirement: string;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [project, setProject] = useState<ProjectForLead | null>(null);

  function load() {
    if (!leadId) return;
    setLoading(true);
    setLoadError(null);
    getLead(entityId, Number(leadId))
      .then((res) => {
        setLead(res);
        setDraft({
          name: res.name,
          mobile: res.mobile,
          address: res.address ?? "",
          type: res.type ?? "",
          email: res.email ?? "",
          sanctioned_load: res.sanctioned_load != null ? String(res.sanctioned_load) : "",
          metertype: res.metertype ?? "",
          state: res.state ?? "",
          discom: res.discom ?? "",
          roof_area_sqft: res.roof_area_sqft != null ? String(res.roof_area_sqft) : "",
          ca_number: res.ca_number ?? "",
          avg_monthly_bill: res.avg_monthly_bill ?? "",
          avg_monthly_units: res.avg_monthly_units != null ? String(res.avg_monthly_units) : "",
          requirement: res.requirement ?? "",
        });
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load lead"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, leadId]);

  useEffect(() => {
    if (!leadId || lead?.status !== "AGREEMENT_ACCEPTED") return;
    getProjectForLead(entityId, Number(leadId))
      .then(setProject)
      .catch(() => {});
  }, [entityId, leadId, lead?.status]);

  function handleStateChange(newState: string) {
    if (!draft) return;
    // A discom picked under the old state may not exist under the new one —
    // clear it rather than leave a stale value silently attached to the lead.
    setDraft({ ...draft, state: newState, discom: "" });
  }

  function handleExtracted(data: ExtractedLeadData) {
    if (!draft) return;
    // Deliberately not autofilling name/mobile here — those identify an
    // existing lead and shouldn't be overwritten by a re-uploaded bill.
    setDraft({
      ...draft,
      address: data.address ?? draft.address,
      email: data.email ?? draft.email,
      sanctioned_load: data.sanctioned_load != null ? String(data.sanctioned_load) : draft.sanctioned_load,
      metertype: data.metertype ?? draft.metertype,
      state: data.state ?? draft.state,
      discom: data.discom ?? draft.discom,
      ca_number: data.ca_number ?? draft.ca_number,
      avg_monthly_bill: data.avg_monthly_bill ?? draft.avg_monthly_bill,
      avg_monthly_units: data.avg_monthly_units != null ? String(data.avg_monthly_units) : draft.avg_monthly_units,
    });
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!draft || !leadId) return;
    setSaving(true);
    setStatus(null);
    try {
      const updated = await updateLead(entityId, Number(leadId), {
        name: draft.name.trim(),
        mobile: draft.mobile.trim(),
        address: draft.address.trim() || undefined,
        type: draft.type.trim() || undefined,
        email: draft.email.trim() || undefined,
        sanctioned_load: draft.sanctioned_load ? Number(draft.sanctioned_load) : undefined,
        metertype: draft.metertype || undefined,
        state: draft.state || undefined,
        discom: draft.discom.trim() || undefined,
        roof_area_sqft: draft.roof_area_sqft ? Number(draft.roof_area_sqft) : undefined,
        ca_number: draft.ca_number.trim() || undefined,
        avg_monthly_bill: draft.avg_monthly_bill ? Number(draft.avg_monthly_bill) : undefined,
        avg_monthly_units: draft.avg_monthly_units ? Number(draft.avg_monthly_units) : undefined,
        requirement: draft.requirement.trim() || undefined,
      });
      setLead(updated);
      setStatus({ kind: "success", message: "Saved." });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(target: ManualLeadStatus) {
    if (!leadId) return;
    setTransitioning(true);
    setStatus(null);
    try {
      const res = await updateLeadStatus(entityId, Number(leadId), target);
      setLead((prev) => (prev ? { ...prev, status: res.status } : prev));
      setStatus({ kind: "success", message: `Status updated to ${res.status}.` });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Could not update status" });
    } finally {
      setTransitioning(false);
    }
  }

  if (loading) return <div className="leads-loading">Loading…</div>;
  if (loadError || !lead || !draft) {
    return (
      <div className="leads-page">
        <Link to="/app/leads" className="lead-detail-back">
          ← Back to leads
        </Link>
        <p className="leads-status error">{loadError ?? "Lead not found."}</p>
      </div>
    );
  }

  const actions = manualTransitions(lead.status);

  return (
    <div className="leads-page">
      <Link to="/app/leads" className="lead-detail-back">
        ← Back to leads
      </Link>

      <div className="lead-detail-header">
        <h1 style={{ margin: 0 }}>
          {lead.name} <LeadStatusBadge status={lead.status} />
        </h1>
        <div className="lead-detail-actions">
          <Link to={`/app/leads/${lead.lead_id}/quote`} className="leads-btn primary">
            {lead.status === "NEW" ? "Generate quote" : "View quote"}
          </Link>
          {(lead.status === "QUOTE_ACCEPTED" ||
            lead.status === "AGREEMENT_GENERATED" ||
            lead.status === "AGREEMENT_ACCEPTED") && (
            <Link to={`/app/leads/${lead.lead_id}/agreement`} className="leads-btn primary">
              {lead.status === "QUOTE_ACCEPTED" ? "Generate agreement" : "View agreement"}
            </Link>
          )}
          {project && (
            <Link to={`/app/projects/${project.project_id}`} className="leads-btn primary">
              View project
            </Link>
          )}
          {actions.map((a) => (
            <button
              key={a.target}
              className={`leads-btn${a.primary ? " primary" : ""}${a.target === "REJECTED" ? " danger" : ""}`}
              disabled={transitioning}
              onClick={() => handleTransition(a.target)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lead-detail-layout">
      <div className="lead-detail-main">
      <div className="lead-detail-panel">
        <BillUploadWidget entityId={entityId} onExtracted={handleExtracted} />

        <form onSubmit={handleSave} noValidate>
          <div className="add-lead-field">
            <label htmlFor="detailName">Name</label>
            <input
              id="detailName"
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>

          <div className="add-lead-field">
            <label htmlFor="detailMobile">Mobile</label>
            <input
              id="detailMobile"
              type="tel"
              value={draft.mobile}
              onChange={(e) => setDraft({ ...draft, mobile: e.target.value })}
            />
          </div>

          <div className="add-lead-field">
            <label htmlFor="detailAddress">Address</label>
            <textarea
              id="detailAddress"
              rows={2}
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            />
          </div>

          <div className="add-lead-field-row">
            <div className="add-lead-field">
              <label htmlFor="detailEmail">Email</label>
              <input
                id="detailEmail"
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </div>
            <div className="add-lead-field">
              <label htmlFor="detailType">Type</label>
              <select
                id="detailType"
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
              >
                <option value="">—</option>
                {LEAD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="add-lead-field-row">
            <div className="add-lead-field">
              <label htmlFor="detailSanctionedLoad">Sanctioned load (kW)</label>
              <input
                id="detailSanctionedLoad"
                type="number"
                step="0.1"
                value={draft.sanctioned_load}
                onChange={(e) => setDraft({ ...draft, sanctioned_load: e.target.value })}
              />
            </div>
            <div className="add-lead-field">
              <label htmlFor="detailMeterType">Meter type</label>
              <select
                id="detailMeterType"
                value={draft.metertype}
                onChange={(e) => setDraft({ ...draft, metertype: e.target.value })}
              >
                <option value="">—</option>
                {METER_TYPES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="add-lead-field-row">
            <div className="add-lead-field">
              <label htmlFor="detailState">State</label>
              <select
                id="detailState"
                value={draft.state}
                onChange={(e) => handleStateChange(e.target.value)}
                title={STATES.find((s) => s.code === draft.state)?.name}
              >
                <option value="">—</option>
                {STATES.map((s) => (
                  <option key={s.code} value={s.code} title={s.name}>
                    {s.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="add-lead-field">
              <label htmlFor="detailDiscom">Discom</label>
              <select
                id="detailDiscom"
                value={draft.discom}
                onChange={(e) => setDraft({ ...draft, discom: e.target.value })}
                disabled={!draft.state}
                title={getDiscomsForState(draft.state).find((d) => d.code === draft.discom)?.name}
              >
                <option value="">—</option>
                {getDiscomsForState(draft.state).map((d) => (
                  <option key={d.code} value={d.code} title={d.name}>
                    {d.code}
                  </option>
                ))}
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="add-lead-field-row">
            <div className="add-lead-field">
              <label htmlFor="detailCaNumber">CA Number</label>
              <input
                id="detailCaNumber"
                type="text"
                placeholder="Customer Account Number (auto-filled)"
                value={draft.ca_number}
                onChange={(e) => setDraft({ ...draft, ca_number: e.target.value })}
              />
            </div>
            <div className="add-lead-field">
              <label htmlFor="detailAvgBill">Avg. Monthly Bill (₹)</label>
              <input
                id="detailAvgBill"
                type="number"
                placeholder="e.g. 5000 (auto-filled)"
                value={draft.avg_monthly_bill}
                onChange={(e) => setDraft({ ...draft, avg_monthly_bill: e.target.value })}
              />
            </div>
          </div>

          <div className="add-lead-field-row">
            <div className="add-lead-field">
              <label htmlFor="detailAvgUnits">Avg. Monthly Units</label>
              <input
                id="detailAvgUnits"
                type="number"
                placeholder="e.g. 850 (auto-filled)"
                value={draft.avg_monthly_units}
                onChange={(e) => setDraft({ ...draft, avg_monthly_units: e.target.value })}
              />
            </div>
            <div className="add-lead-field">
              <label htmlFor="detailRoofArea">Roof area (sq ft)</label>
              <input
                id="detailRoofArea"
                type="number"
                value={draft.roof_area_sqft}
                onChange={(e) => setDraft({ ...draft, roof_area_sqft: e.target.value })}
              />
            </div>
          </div>

          <div className="add-lead-field">
            <label htmlFor="detailRequirement">Requirement</label>
            <textarea
              id="detailRequirement"
              rows={3}
              placeholder="Comments, preferences, or specific requirements from the customer"
              value={draft.requirement}
              onChange={(e) => setDraft({ ...draft, requirement: e.target.value })}
            />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="submit" className="leads-btn primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="leads-btn" onClick={() => navigate("/app/leads")}>
              Back to leads
            </button>
          </div>

          {status && <p className={`leads-status ${status.kind}`}>{status.message}</p>}
        </form>
      </div>
      </div>

      <div className="lead-detail-side">
        <LeadWorkOrders entityId={entityId} leadId={lead.lead_id} />
      </div>
      </div>
    </div>
  );
}
