import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { hasFeature, isAgent, isAgentModuleUser } from "../../lib/roles";
import { leadsAccess } from "../../api/leads";
import { listEntityUsers } from "../../api/entityUsers";
import {
  getLeadAssignments,
  syncAssignmentsFromLeads,
  saveLeadAssignments,
  getLeadStates,
  getLeadCustomStates,
  getLeadDealValues,
  saveLeadCustomStates,
  saveLeadDealValues,
  getEpcAgentSettings,
} from "../../lib/epcAgentStorage";
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
import { STATES, getDiscomsForState, resolveStateCode, resolveDiscomCode } from "./discomOptions";
import ConfirmDialog from "../../components/ConfirmDialog";
import DraftRestoredBanner from "../../components/DraftRestoredBanner";
import { useDraftAutosave } from "../../hooks/useDraftAutosave";
import { draftKeys, readDraft, clearDraft } from "../../lib/drafts";
import LocationPicker from "../../components/map/LocationPicker";
import "./LeadsPage.css";

type LeadDraftFields = {
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
  latitude: number | null;
  longitude: number | null;
};

function draftFieldsFromLead(res: LeadDetail): LeadDraftFields {
  return {
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
    avg_monthly_bill: res.avg_monthly_bill != null ? String(res.avg_monthly_bill) : "",
    avg_monthly_units: res.avg_monthly_units != null ? String(res.avg_monthly_units) : "",
    requirement: res.requirement ?? "",
    latitude: res.latitude ?? null,
    longitude: res.longitude ?? null,
  };
}

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

  const [draft, setDraft] = useState<LeadDraftFields | null>(null);
  const [draftRestoredAt, setDraftRestoredAt] = useState<number | null>(null);
  // The draft fields as fetched from the server, before any local
  // draft-autosave data was applied on top -- the baseline autosave is
  // compared against so an unmodified form doesn't get "autosaved" (and
  // then spuriously offered back as a "restore" on the next visit).
  // Updated to the just-saved values on a successful save too, so save
  // doesn't leave this stale and re-trigger autosave from formatting
  // differences (e.g. server-side trimming) between what was submitted and
  // what's re-fetched.
  const fetchedDraftRef = useRef<LeadDraftFields | null>(null);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [assignedAgentId, setAssignedAgentId] = useState<number | "">("");
  const [agents, setAgents] = useState<any[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const [project, setProject] = useState<ProjectForLead | null>(null);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  // Snapshot of `draft` as of the last successful save -- compared against
  // the live draft (see isDirtySinceSave) so the Save button can flip to a
  // disabled "Saved" and back without wiring an onChange handler onto every
  // one of the form's dozen-plus fields individually.
  const [savedSnapshot, setSavedSnapshot] = useState<typeof draft>(null);
  
  const [customStates, setCustomStates] = useState<Record<number, string>>({});
  const [dealValues, setDealValues] = useState<Record<number, number>>({});
  const [, setLeadStates] = useState<string[]>([]);
  const [terminalState, setTerminalState] = useState("");
  const [orderState, setOrderState] = useState("");

  const [updatingLeadId, setUpdatingLeadId] = useState<number | null>(null);
  const [selectedState] = useState("");
  const [dealValueInput, setDealValueInput] = useState("");

  useEffect(() => {
    const states = getLeadStates();
    setLeadStates(states);
    setTerminalState(states[states.length - 1]);
    setOrderState(states[states.length - 2]);
    setCustomStates(getLeadCustomStates());
    setDealValues(getLeadDealValues());
  }, []);
  
  const hasAgentsFeature = user ? hasFeature(user, "AGENTS") : false;
  const agentSettings = hasAgentsFeature ? getEpcAgentSettings() : { enabled: false, onlyWorkspace: false };
  // No CRM => /app/leads doesn't exist for this entity; the EPC workspace is its lead view.
  const showAgentsExclusive =
    hasAgentsFeature && (!hasFeature(user, "CRM") || (agentSettings.enabled && agentSettings.onlyWorkspace));

  useEffect(() => {
    // Agents can't list users (403); the list only feeds the admin assign dropdown.
    if (hasAgentsFeature && entityId && !(user && isAgent(user.roles))) {
      listEntityUsers(entityId)
        .then((res) => {
          const dbAgents = res.items.filter((u) => u.roles.includes("ENTITY_AGENT"));
          setAgents(dbAgents);
        })
        .catch(() => {
          setAgents([]);
        });
    }
  }, [hasAgentsFeature, entityId, user]);

  function load() {
    if (!leadId) return;
    setLoading(true);
    setLoadError(null);
    setSavedSnapshot(null);
    setDraftRestoredAt(null);
    getLead(entityId, Number(leadId), leadsAccess(user))
      .then((res) => {
        setLead(res);
        const fetched = draftFieldsFromLead(res);
        fetchedDraftRef.current = fetched;
        const stored = readDraft<LeadDraftFields>(draftKeys.leadEdit(leadId));
        if (stored) {
          setDraft(stored.data);
          setDraftRestoredAt(stored.timestamp);
        } else {
          setDraft(fetched);
        }
        // Agents only ever get their own leads from the backend (404 otherwise), so
        // no browser-side ownership check. Pull in the lead's stage + deal value.
        setAccessError(null);
        syncAssignmentsFromLeads([{ ...res, created_by_user_id: (res as { created_by_user_id?: number | null }).created_by_user_id }]);
        const assignedId = getLeadAssignments()[Number(leadId)];
        setCustomStates(getLeadCustomStates());
        setDealValues(getLeadDealValues());
        setAssignedAgentId(assignedId || "");
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load lead"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, leadId]);

  const isDirtySinceLoad =
    draft != null &&
    fetchedDraftRef.current != null &&
    JSON.stringify(draft) !== JSON.stringify(fetchedDraftRef.current);
  useDraftAutosave(leadId ? draftKeys.leadEdit(leadId) : null, draft, isDirtySinceLoad);

  function handleResetDraft() {
    if (!leadId) return;
    clearDraft(draftKeys.leadEdit(leadId));
    setDraftRestoredAt(null);
    if (fetchedDraftRef.current) setDraft(fetchedDraftRef.current);
  }

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
    // Extraction is AI-derived and returns the state/discom as either a
    // short code or a full name inconsistently -- resolve to the code the
    // <select> options actually use, or the dropdown silently shows nothing
    // selected even though the underlying value is set to something real.
    const resolvedState = data.state ? resolveStateCode(data.state) || draft.state : draft.state;
    setDraft({
      ...draft,
      address: data.address ?? draft.address,
      email: data.email ?? draft.email,
      sanctioned_load: data.sanctioned_load != null ? String(data.sanctioned_load) : draft.sanctioned_load,
      metertype: data.metertype ?? draft.metertype,
      state: resolvedState,
      discom: data.discom ? resolveDiscomCode(resolvedState, data.discom) || draft.discom : draft.discom,
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
        latitude: draft.latitude ?? undefined,
        longitude: draft.longitude ?? undefined,
      });

      const savedAssignments = getLeadAssignments();
      if (assignedAgentId) {
        savedAssignments[Number(leadId)] = Number(assignedAgentId);
      } else {
        delete savedAssignments[Number(leadId)];
      }
      saveLeadAssignments(savedAssignments);

      setLead(updated);
      setSavedSnapshot(draft);
      fetchedDraftRef.current = draft;
      clearDraft(draftKeys.leadEdit(leadId));
      setDraftRestoredAt(null);
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

  function handleStateSave() {
    if (!updatingLeadId) return;

    const nextStates = { ...customStates, [updatingLeadId]: selectedState };
    setCustomStates(nextStates);
    saveLeadCustomStates(nextStates);

    if (selectedState === orderState || selectedState === terminalState) {
      const val = parseFloat(dealValueInput) || 0;
      const nextValues = { ...dealValues, [updatingLeadId]: val };
      setDealValues(nextValues);
      saveLeadDealValues(nextValues);
    }

    setUpdatingLeadId(null);
  }

  if (loading) return <div className="leads-loading">Loading…</div>;

  const isAgentUser = user ? isAgent(user.roles) : false;
  // Agents and agent-workspace admins: no quote/reject/work orders/bill parsing.
  const agentModuleView = isAgentModuleUser(user);
  const backPath = isAgentUser ? "/app/agent/leads" : showAgentsExclusive ? "/app/epc/leads" : "/app/leads";

  if (accessError || loadError || !lead || !draft) {
    return (
      <div className="leads-page">
        <Link to={backPath} className="lead-detail-back">
          ← Back to leads
        </Link>
        <p className="leads-status error">{accessError || loadError || "Lead not found."}</p>
      </div>
    );
  }

  const actions = manualTransitions(lead.status);
  const isDirtySinceSave = savedSnapshot != null && JSON.stringify(draft) !== JSON.stringify(savedSnapshot);
  const showSaved = savedSnapshot != null && !isDirtySinceSave;
  const hasExistingDetails = Object.values(draft).some((v) => typeof v === "string" ? v.trim() !== "" : v !== null);

  // Reset before a re-uploaded bill's extraction is applied -- unlike
  // AddLeadForm's equivalent, name/mobile are deliberately left untouched:
  // they identify an existing lead, and handleExtracted above already never
  // overwrites them from a bill for the same reason, so clearing them here
  // would wipe an existing customer's identity with no way for the
  // extraction that follows to restore it.
  function handleResetDetailsBeforeExtract() {
    setDraft((d) =>
      d
        ? {
            ...d,
            address: "",
            type: "",
            email: "",
            sanctioned_load: "",
            metertype: "",
            state: "",
            discom: "",
            roof_area_sqft: "",
            ca_number: "",
            avg_monthly_bill: "",
            avg_monthly_units: "",
            requirement: "",
            latitude: null,
            longitude: null,
          }
        : d,
    );
  }

  return (
    <div className="leads-page">
      <Link to={backPath} className="lead-detail-back">
        ← Back to leads
      </Link>

      {draftRestoredAt != null && (
        <DraftRestoredBanner restoredAt={draftRestoredAt} onReset={handleResetDraft} />
      )}

      <div className="lead-detail-header">
        <h1 style={{ margin: 0 }}>
          {lead.name} <LeadStatusBadge status={lead.status} />
        </h1>
        <div className="lead-detail-actions">
          {agentModuleView ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13, color: "var(--app-text-muted)", fontWeight: 500 }}>Lead Stage:</span>
              <span className={`badge state-${customStates[Number(leadId)] || "NEW"}`}>
                {customStates[Number(leadId)] || "NEW"}
              </span>
            </div>
          ) : (
            <>
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
                  onClick={() => (a.target === "REJECTED" ? setRejectConfirmOpen(true) : handleTransition(a.target))}
                >
                  {a.label}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={rejectConfirmOpen}
        title="Reject this lead?"
        message="This marks the lead as rejected. This can't be undone."
        confirmLabel="Reject lead"
        confirming={transitioning}
        confirmingLabel="Rejecting…"
        onConfirm={() => {
          setRejectConfirmOpen(false);
          handleTransition("REJECTED");
        }}
        onCancel={() => setRejectConfirmOpen(false)}
      />

      <div className="lead-detail-layout">
      <div className="lead-detail-main">
      <div className="lead-detail-panel">
        {!agentModuleView && (
          <BillUploadWidget
            entityId={entityId}
            onExtracted={handleExtracted}
            hasExistingDetails={hasExistingDetails}
            onResetDetails={handleResetDetailsBeforeExtract}
          />
        )}

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
            <label htmlFor="detailEmail">Email</label>
            <input
              id="detailEmail"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </div>

          <div className="add-lead-field-row">
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

          {hasAgentsFeature && (
            <div className="add-lead-field" style={{ marginBottom: "16px" }}>
              <label htmlFor="detailAgent">Assigned Agent</label>
              <select
                id="detailAgent"
                value={assignedAgentId}
                onChange={(e) => setAssignedAgentId(e.target.value ? Number(e.target.value) : "")}
                style={{
                  fontFamily: "inherit",
                  fontSize: "14px",
                  padding: "9px 12px",
                  border: "1px solid var(--app-border)",
                  borderRadius: "8px",
                  background: "var(--app-surface)",
                  color: "var(--app-text)",
                  width: "100%",
                  boxSizing: "border-box"
                }}
              >
                <option value="">— Unassigned —</option>
                {agents.map((ag) => (
                  <option key={ag.user_id} value={ag.user_id}>
                    {ag.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="add-lead-field">
            <label htmlFor="detailAddress">Address</label>
            <textarea
              id="detailAddress"
              rows={2}
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            />
          </div>

          <div className="add-lead-field">
            <label>Map Location (Optional)</label>
            <LocationPicker 
              initialLat={draft.latitude} 
              initialLng={draft.longitude} 
              onLocationSelect={(lat, lng) => {
                setDraft({ ...draft, latitude: lat, longitude: lng });
              }} 
            />
            {draft.latitude !== null && draft.longitude !== null && (
              <div style={{ fontSize: "12px", color: "var(--app-text-muted)", marginTop: "4px" }}>
                Saved: {draft.latitude.toFixed(6)}, {draft.longitude.toFixed(6)}
              </div>
            )}
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
            <button type="submit" className="leads-btn primary" disabled={saving || showSaved}>
              {saving ? "Saving…" : showSaved ? "Saved" : "Save"}
            </button>
            <button type="button" className="leads-btn" onClick={() => navigate(backPath)}>
              Back to leads
            </button>
          </div>

          {status && <p className={`leads-status ${status.kind}`}>{status.message}</p>}
        </form>
      </div>
      </div>

      {!agentModuleView && (
        <div className="lead-detail-side">
          <LeadWorkOrders entityId={entityId} leadId={lead.lead_id} />
        </div>
      )}
      </div>

      {updatingLeadId && (
        <div className="epc-modal-backdrop">
          <div className="epc-modal" style={{ color: "var(--app-text)" }}>
            <h3>Update Lead State</h3>
            <p>You are moving the lead to stage: <strong>{selectedState}</strong></p>

            {(selectedState === orderState || selectedState === terminalState) && (
              <div className="epc-form-group">
                <label>Realized Deal Value (INR)</label>
                <input
                  type="number"
                  placeholder="Enter total contract value"
                  value={dealValueInput}
                  onChange={(e) => setDealValueInput(e.target.value)}
                  className="epc-input"
                />
                <span className="input-hint">Commission calculations are derived directly from this value.</span>
              </div>
            )}

            <div className="epc-modal-actions">
              <button className="entity-btn" onClick={() => setUpdatingLeadId(null)}>
                Cancel
              </button>
              <button className="entity-btn primary" onClick={handleStateSave}>
                Save Changes {selectedState === terminalState && "🔒"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
