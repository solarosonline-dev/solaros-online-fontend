import { useState, type FormEvent } from "react";
import { createLead, type CreateLeadInput, type ExtractedLeadData } from "../../api/leads";
import { ApiError } from "../../api/client";
import BillUploadWidget from "./BillUploadWidget";
import { METER_TYPES, LEAD_TYPES } from "./leadOptions";
import { STATES, getDiscomsForState } from "./discomOptions";
import { useElapsedMs } from "../../hooks/useElapsedMs";
import ConfirmDialog from "../../components/ConfirmDialog";

type FieldErrors = Partial<Record<keyof CreateLeadInput, string>>;

type Props = {
  entityId: number;
  onCreated: () => void;
  onCancel: () => void;
};

export default function AddLeadForm({ entityId, onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState("");
  const [email, setEmail] = useState("");
  const [sanctionedLoad, setSanctionedLoad] = useState("");
  const [metertype, setMetertype] = useState("");
  const [state, setState] = useState("");
  const [discom, setDiscom] = useState("");
  const [roofArea, setRoofArea] = useState("");
  const [caNumber, setCaNumber] = useState("");
  const [avgBill, setAvgBill] = useState("");
  const [avgUnits, setAvgUnits] = useState("");
  const [requirement, setRequirement] = useState("");

  // Wall-clock time spent on this form, from mount to submit — sent as
  // entry_duration_ms to power the admin "p50/p95 time to enter a lead"
  // metric. Safe here: this component is fully unmounted and remounted
  // each time the "Add lead" panel is opened (see LeadsPage), so the
  // hook's mount-time start point re-runs on every open.
  const getElapsedMs = useElapsedMs();

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const isDirty = [
    name,
    mobile,
    address,
    type,
    email,
    sanctionedLoad,
    metertype,
    state,
    discom,
    roofArea,
    caNumber,
    avgBill,
    avgUnits,
    requirement,
  ].some((v) => v.trim() !== "");

  function handleCancelClick() {
    if (isDirty) {
      setCancelConfirmOpen(true);
    } else {
      onCancel();
    }
  }
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const discomOptions = getDiscomsForState(state);

  function handleStateChange(newState: string) {
    setState(newState);
    // A discom picked under the old state may not exist under the new one
    // (or there may be no discoms at all until a state is chosen) — clear it
    // rather than leave a stale value silently attached to the lead.
    setDiscom("");
  }

  function handleExtracted(data: ExtractedLeadData) {
    if (data.name) setName(data.name);
    if (data.mobile) setMobile(data.mobile.replace(/\D/g, "").slice(-10));
    if (data.address) setAddress(data.address);
    if (data.email) setEmail(data.email);
    if (data.sanctioned_load != null) setSanctionedLoad(String(data.sanctioned_load));
    if (data.metertype) setMetertype(data.metertype);
    if (data.state) setState(data.state);
    if (data.discom) setDiscom(data.discom);
    if (data.ca_number) setCaNumber(data.ca_number);
    if (data.avg_monthly_bill) setAvgBill(data.avg_monthly_bill);
    if (data.avg_monthly_units != null) setAvgUnits(String(data.avg_monthly_units));
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = "Name is required.";
    const digitsOnlyMobile = mobile.replace(/\D/g, "");
    if (!mobile.trim()) errors.mobile = "Mobile is required.";
    else if (digitsOnlyMobile.length !== 10) errors.mobile = "Enter a valid 10-digit mobile number.";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
    if (sanctionedLoad && (isNaN(Number(sanctionedLoad)) || Number(sanctionedLoad) <= 0)) {
      errors.sanctioned_load = "Enter a valid number.";
    }
    if (roofArea && (isNaN(Number(roofArea)) || Number(roofArea) <= 0)) {
      errors.roof_area_sqft = "Enter a valid number.";
    }
    if (avgBill && (isNaN(Number(avgBill)) || Number(avgBill) <= 0)) {
      errors.avg_monthly_bill = "Enter a valid number.";
    }
    if (avgUnits && (isNaN(Number(avgUnits)) || Number(avgUnits) <= 0)) {
      errors.avg_monthly_units = "Enter a valid number.";
    }
    return errors;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await createLead(entityId, {
        name: name.trim(),
        mobile: mobile.replace(/\D/g, ""),
        address: address.trim() || undefined,
        type: type.trim() || undefined,
        email: email.trim() || undefined,
        sanctioned_load: sanctionedLoad ? Number(sanctionedLoad) : undefined,
        metertype: metertype || undefined,
        state: state || undefined,
        discom: discom.trim() || undefined,
        roof_area_sqft: roofArea ? Number(roofArea) : undefined,
        ca_number: caNumber.trim() || undefined,
        avg_monthly_bill: avgBill ? Number(avgBill) : undefined,
        avg_monthly_units: avgUnits ? Number(avgUnits) : undefined,
        requirement: requirement.trim() || undefined,
        entry_duration_ms: getElapsedMs(),
      });
      onCreated();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Could not create lead");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="add-lead-panel">
      <BillUploadWidget entityId={entityId} onExtracted={handleExtracted} />

      <form onSubmit={handleSubmit} noValidate>
        <div className="add-lead-field">
          <label htmlFor="leadName">Name</label>
          <input id="leadName" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          {fieldErrors.name && <p className="add-lead-field-error">{fieldErrors.name}</p>}
        </div>

        <div className="add-lead-field">
          <label htmlFor="leadMobile">Mobile</label>
          <input id="leadMobile" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          {fieldErrors.mobile && <p className="add-lead-field-error">{fieldErrors.mobile}</p>}
        </div>

        <div className="add-lead-field">
          <label htmlFor="leadAddress">Address</label>
          <textarea id="leadAddress" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        <div className="add-lead-field-row">
          <div className="add-lead-field">
            <label htmlFor="leadEmail">Email</label>
            <input id="leadEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {fieldErrors.email && <p className="add-lead-field-error">{fieldErrors.email}</p>}
          </div>
          <div className="add-lead-field">
            <label htmlFor="leadType">Type</label>
            <select id="leadType" value={type} onChange={(e) => setType(e.target.value)}>
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
            <label htmlFor="leadSanctionedLoad">Sanctioned load (kW)</label>
            <input
              id="leadSanctionedLoad"
              type="number"
              step="0.1"
              value={sanctionedLoad}
              onChange={(e) => setSanctionedLoad(e.target.value)}
            />
            {fieldErrors.sanctioned_load && <p className="add-lead-field-error">{fieldErrors.sanctioned_load}</p>}
          </div>
          <div className="add-lead-field">
            <label htmlFor="leadMeterType">Meter type</label>
            <select id="leadMeterType" value={metertype} onChange={(e) => setMetertype(e.target.value)}>
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
            <label htmlFor="leadState">State</label>
            <select
              id="leadState"
              value={state}
              onChange={(e) => handleStateChange(e.target.value)}
              title={STATES.find((s) => s.code === state)?.name}
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
            <label htmlFor="leadDiscom">Discom</label>
            <select
              id="leadDiscom"
              value={discom}
              onChange={(e) => setDiscom(e.target.value)}
              disabled={!state}
              title={discomOptions.find((d) => d.code === discom)?.name}
            >
              <option value="">—</option>
              {discomOptions.map((d) => (
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
            <label htmlFor="leadCaNumber">CA Number</label>
            <input
              id="leadCaNumber"
              type="text"
              placeholder="Customer Account Number (auto-filled)"
              value={caNumber}
              onChange={(e) => setCaNumber(e.target.value)}
            />
          </div>
          <div className="add-lead-field">
            <label htmlFor="leadAvgBill">Avg. Monthly Bill (₹)</label>
            <input
              id="leadAvgBill"
              type="number"
              placeholder="e.g. 5000 (auto-filled)"
              value={avgBill}
              onChange={(e) => setAvgBill(e.target.value)}
            />
            {fieldErrors.avg_monthly_bill && <p className="add-lead-field-error">{fieldErrors.avg_monthly_bill}</p>}
          </div>
        </div>

        <div className="add-lead-field-row">
          <div className="add-lead-field">
            <label htmlFor="leadAvgUnits">Avg. Monthly Units</label>
            <input
              id="leadAvgUnits"
              type="number"
              placeholder="e.g. 850 (auto-filled)"
              value={avgUnits}
              onChange={(e) => setAvgUnits(e.target.value)}
            />
            {fieldErrors.avg_monthly_units && <p className="add-lead-field-error">{fieldErrors.avg_monthly_units}</p>}
          </div>
          <div className="add-lead-field">
            <label htmlFor="leadRoofArea">Roof area (sq ft)</label>
            <input
              id="leadRoofArea"
              type="number"
              value={roofArea}
              onChange={(e) => setRoofArea(e.target.value)}
            />
            {fieldErrors.roof_area_sqft && <p className="add-lead-field-error">{fieldErrors.roof_area_sqft}</p>}
          </div>
        </div>

        <div className="add-lead-field">
          <label htmlFor="leadRequirement">Requirement</label>
          <textarea
            id="leadRequirement"
            rows={3}
            placeholder="Comments, preferences, or specific requirements from the customer"
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
          />
        </div>

        {submitError && (
          <p className="leads-status error" role="alert">
            {submitError}
          </p>
        )}

        <div className="add-lead-actions">
          <button type="submit" className="leads-btn primary" disabled={submitting}>
            {submitting ? "Adding…" : "Add lead"}
          </button>
          <button type="button" className="leads-btn" onClick={handleCancelClick}>
            Cancel
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Discard this lead?"
        message="You'll lose everything entered on this form. This can't be undone."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={onCancel}
        onCancel={() => setCancelConfirmOpen(false)}
      />
    </div>
  );
}
