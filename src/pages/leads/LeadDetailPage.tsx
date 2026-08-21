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
} from "../../api/leads";
import { ApiError } from "../../api/client";
import type { ExtractedBillData } from "../../lib/billExtractor";
import BillUploadWidget from "./BillUploadWidget";
import { METER_TYPES, LEAD_TYPES, DISCOMS } from "./leadOptions";
import "./LeadsPage.css";

function manualTransitions(status: LeadStatus): { label: string; target: ManualLeadStatus; primary: boolean }[] {
  switch (status) {
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
    discom: string;
    roof_area_sqft: string;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [transitioning, setTransitioning] = useState(false);

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
          discom: res.discom ?? "",
          roof_area_sqft: res.roof_area_sqft != null ? String(res.roof_area_sqft) : "",
        });
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load lead"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, leadId]);

  function handleExtracted(data: ExtractedBillData) {
    if (!draft) return;
    // Deliberately not autofilling name/mobile here — those identify an
    // existing lead and shouldn't be overwritten by a re-uploaded bill.
    setDraft({
      ...draft,
      address: data.supplyAddress ?? draft.address,
      email: data.email ?? draft.email,
      sanctioned_load: data.sanctionedLoad != null ? String(data.sanctionedLoad) : draft.sanctioned_load,
      metertype: data.phase ?? draft.metertype,
      discom: data.provider && data.provider !== "Unknown" ? data.provider : draft.discom,
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
        discom: draft.discom.trim() || undefined,
        roof_area_sqft: draft.roof_area_sqft ? Number(draft.roof_area_sqft) : undefined,
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
          {lead.name} <span className="lead-status-badge">{lead.status}</span>
        </h1>
        {actions.length > 0 && (
          <div className="lead-detail-actions">
            {actions.map((a) => (
              <button
                key={a.target}
                className={`leads-btn${a.primary ? " primary" : ""}`}
                disabled={transitioning}
                onClick={() => handleTransition(a.target)}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lead-detail-panel">
        <BillUploadWidget onExtracted={handleExtracted} />

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
              <label htmlFor="detailDiscom">Discom</label>
              <select
                id="detailDiscom"
                value={draft.discom}
                onChange={(e) => setDraft({ ...draft, discom: e.target.value })}
              >
                <option value="">—</option>
                {DISCOMS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
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

          {status && <p className={`leads-status ${status.kind}`}>{status.message}</p>}

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="submit" className="leads-btn primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="leads-btn" onClick={() => navigate("/app/leads")}>
              Back to leads
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
