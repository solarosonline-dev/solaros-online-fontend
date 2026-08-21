import { useRef, useState, type FormEvent } from "react";
import { createLead, type CreateLeadInput } from "../../api/leads";
import { ApiError } from "../../api/client";
import {
  extractBillFromFile,
  calculateAverageConsumption,
  calculateAverageUnits,
  suggestSystemSize,
  type ExtractedBillData,
} from "../../lib/billExtractor";

const METER_TYPES = ["Single", "3 Phase"];

type FieldErrors = Partial<Record<keyof CreateLeadInput, string>>;

type Props = {
  entityId: number;
  onCreated: () => void;
  onCancel: () => void;
};

export default function AddLeadForm({ entityId, onCreated, onCancel }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractSummary, setExtractSummary] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState("");
  const [email, setEmail] = useState("");
  const [sanctionedLoad, setSanctionedLoad] = useState("");
  const [metertype, setMetertype] = useState("");
  const [discom, setDiscom] = useState("");
  const [roofArea, setRoofArea] = useState("");

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtractError(null);
    setExtractSummary(null);
    setExtracting(true);
    try {
      const data: ExtractedBillData = await extractBillFromFile(file);

      if (data.customerName) setName(data.customerName);
      if (data.mobile) setMobile(data.mobile.replace(/\D/g, "").slice(-10));
      if (data.supplyAddress) setAddress(data.supplyAddress);
      if (data.email) setEmail(data.email);
      if (data.sanctionedLoad != null) setSanctionedLoad(String(data.sanctionedLoad));
      if (data.phase) setMetertype(data.phase);
      if (data.provider && data.provider !== "Unknown") setDiscom(data.provider);

      const avgBill = calculateAverageConsumption(data);
      const avgUnits = calculateAverageUnits(data);
      const suggestion = suggestSystemSize(data);
      const parts: string[] = [];
      if (suggestion) parts.push(`~${suggestion.recommendedKW} kW suggested system size`);
      if (avgBill) parts.push(`₹${avgBill}/mo avg bill`);
      if (avgUnits) parts.push(`${avgUnits} kWh/mo avg usage`);
      setExtractSummary(parts.length ? parts.join(" · ") : "Extracted what we could — please check the fields below.");
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Couldn't read this PDF — please fill the form manually.");
    } finally {
      setExtracting(false);
    }
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
        discom: discom.trim() || undefined,
        roof_area_sqft: roofArea ? Number(roofArea) : undefined,
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
      <div className="add-lead-upload">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />
        <button type="button" className="leads-btn" onClick={() => fileInputRef.current?.click()} disabled={extracting}>
          {extracting ? "Reading bill…" : "📄 Autofill from electricity bill (PDF)"}
        </button>
        <span className="add-lead-upload-status">optional — fills in the fields below</span>
        {extractError && <p className="add-lead-upload-status error">{extractError}</p>}
        {extractSummary && <div className="add-lead-summary">{extractSummary}</div>}
      </div>

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
            <input
              id="leadType"
              type="text"
              placeholder="e.g. Residential"
              value={type}
              onChange={(e) => setType(e.target.value)}
            />
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
            <label htmlFor="leadDiscom">Discom</label>
            <input id="leadDiscom" type="text" value={discom} onChange={(e) => setDiscom(e.target.value)} />
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

        {submitError && (
          <p className="leads-status error" role="alert">
            {submitError}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button type="submit" className="leads-btn primary" disabled={submitting}>
            {submitting ? "Adding…" : "Add lead"}
          </button>
          <button type="button" className="leads-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
