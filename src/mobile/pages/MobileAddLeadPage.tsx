import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { createLead, leadsAccess, type CreateLeadInput, type ExtractedLeadData } from "../../api/leads";
import { getDiscomsForState, resolveStateCode, resolveDiscomCode, STATES } from "../../pages/leads/discomOptions";
import { METER_TYPES, LEAD_TYPES } from "../../pages/leads/leadOptions";
import { ApiError } from "../../api/client";
import LocationPicker from "../../components/map/LocationPicker";
import BillUploadWidget from "../../pages/leads/BillUploadWidget";
import "./MobileAddLeadPage.css";

type FieldErrors = Partial<Record<keyof CreateLeadInput | "name" | "mobile" | "email" | "sanctioned_load" | "roof_area_sqft" | "avg_monthly_bill" | "avg_monthly_units", string>>;

export default function MobileAddLeadPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  // Form Fields State
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState("");
  const [assignedAgentId, setAssignedAgentId] = useState<number | "">("");

  const [state, setState] = useState("");
  const [discom, setDiscom] = useState("");
  const [caNumber, setCaNumber] = useState("");
  const [sanctionedLoad, setSanctionedLoad] = useState("");
  const [metertype, setMetertype] = useState("");
  const [avgBill, setAvgBill] = useState("");
  const [avgUnits, setAvgUnits] = useState("");

  const [address, setAddress] = useState("");
  const [roofArea, setRoofArea] = useState("");
  const [requirement, setRequirement] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const discomOptions = getDiscomsForState(state);

  const resetFields = () => {
    setName("");
    setMobile("");
    setEmail("");
    setType("");
    setAssignedAgentId("");
    setState("");
    setDiscom("");
    setCaNumber("");
    setSanctionedLoad("");
    setMetertype("");
    setAvgBill("");
    setAvgUnits("");
    setAddress("");
    setRoofArea("");
    setRequirement("");
    setLatitude(null);
    setLongitude(null);
  };

  const handleExtracted = (data: ExtractedLeadData) => {
    if (data.name) setName(data.name);
    if (data.mobile) setMobile(data.mobile.replace(/\D/g, "").slice(-10));
    if (data.address) setAddress(data.address);
    if (data.email) setEmail(data.email);
    if (data.sanctioned_load != null) setSanctionedLoad(String(data.sanctioned_load));
    if (data.metertype) setMetertype(data.metertype);
    const resolvedState = data.state ? resolveStateCode(data.state) || state : state;
    if (data.state) setState(resolvedState);
    if (data.discom) setDiscom(resolveDiscomCode(resolvedState, data.discom) || discom);
    if (data.ca_number) setCaNumber(data.ca_number);
    if (data.avg_monthly_bill) setAvgBill(data.avg_monthly_bill);
    if (data.avg_monthly_units != null) setAvgUnits(String(data.avg_monthly_units));
    
    // Jump user directly to Step 2 to see and verify billing extraction
    setStep(2);
  };

  const validateStep = (currentStep: number): boolean => {
    const errors: FieldErrors = {};
    setFieldErrors({});

    if (currentStep === 1) {
      if (!name.trim()) errors.name = "Client name is required.";
      const digitsOnlyMobile = mobile.replace(/\D/g, "");
      if (!mobile.trim()) errors.mobile = "Mobile number is required.";
      else if (digitsOnlyMobile.length !== 10) {
        errors.mobile = "Mobile must be a valid 10-digit number.";
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = "Enter a valid email address.";
      }
    }

    if (currentStep === 2) {
      if (sanctionedLoad && (isNaN(Number(sanctionedLoad)) || Number(sanctionedLoad) <= 0)) {
        errors.sanctioned_load = "Enter a valid sanctioned load.";
      }
      if (avgBill && (isNaN(Number(avgBill)) || Number(avgBill) <= 0)) {
        errors.avg_monthly_bill = "Enter a valid bill amount.";
      }
      if (avgUnits && (isNaN(Number(avgUnits)) || Number(avgUnits) <= 0)) {
        errors.avg_monthly_units = "Enter valid average units.";
      }
    }

    if (currentStep === 3) {
      if (roofArea && (isNaN(Number(roofArea)) || Number(roofArea) <= 0)) {
        errors.roof_area_sqft = "Enter a valid roof area.";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setStep((prev) => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(3)) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      await createLead(entityId, {
        name: name.trim(),
        mobile: mobile.replace(/\D/g, ""),
        address: address.trim() || undefined,
        type: type || undefined,
        email: email.trim() || undefined,
        sanctioned_load: sanctionedLoad ? Number(sanctionedLoad) : undefined,
        metertype: metertype || undefined,
        state: state || undefined,
        discom: discom || undefined,
        roof_area_sqft: roofArea ? Number(roofArea) : undefined,
        ca_number: caNumber.trim() || undefined,
        avg_monthly_bill: avgBill ? Number(avgBill) : undefined,
        avg_monthly_units: avgUnits ? Number(avgUnits) : undefined,
        requirement: requirement.trim() || undefined,
        entry_duration_ms: 10000, // standard desktop fallback
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        agent_user_id: assignedAgentId ? Number(assignedAgentId) : undefined,
      }, leadsAccess(user));

      navigate("/app/leads");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Could not create lead");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mobile-add-lead-page">
      {/* Header Stepper Header */}
      <div className="mobile-stepper-header">
        <button type="button" className="stepper-cancel-btn" onClick={() => navigate("/app/leads")}>
          ❌ Cancel
        </button>
        <div className="stepper-progress-text">
          Step {step} of 4: {step === 1 ? "Client Profile" : step === 2 ? "Billing & Meter" : step === 3 ? "Roof & Site" : "Summary"}
        </div>
      </div>

      {/* Progress Indicators Bar */}
      <div className="mobile-stepper-bar">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`stepper-bar-segment ${s <= step ? "active" : ""}`} />
        ))}
      </div>

      <form onSubmit={handleSubmit} noValidate className="mobile-stepper-form">
        
        {/* STEP 1: CLIENT PROFILE */}
        {step === 1 && (
          <div className="mobile-step-card animate-slide">
            <h3>Contact Credentials</h3>
            <p className="step-description">Enter the customer's primary contact coordinates.</p>

            <div className="mobile-form-field">
              <label>Client Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anil Kumar" />
              {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
            </div>

            <div className="mobile-form-field">
              <label>Mobile Number *</label>
              <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10-digit phone number" />
              {fieldErrors.mobile && <span className="field-error">{fieldErrors.mobile}</span>}
            </div>

            <div className="mobile-form-field">
              <label>Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. client@gmail.com" />
              {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
            </div>

            <div className="mobile-form-field">
              <label>Installation Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Select Installation Type</option>
                {LEAD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* STEP 2: BILLING & METER */}
        {step === 2 && (
          <div className="mobile-step-card animate-slide">
            <h3>Electricity Connection</h3>
            <p className="step-description">Enter grid information or upload a bill to extract details.</p>

            {/* Float Bill upload component */}
            <div className="mobile-bill-upload-box">
              <BillUploadWidget
                entityId={entityId}
                onExtracted={handleExtracted}
                hasExistingDetails={name !== ""}
                onResetDetails={resetFields}
              />
            </div>

            <div className="mobile-form-field">
              <label>State Code</label>
              <select value={state} onChange={(e) => { setState(e.target.value); setDiscom(""); }}>
                <option value="">Select State</option>
                {STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.code} - {s.name}</option>
                ))}
              </select>
            </div>

            <div className="mobile-form-field">
              <label>Discom Utility Provider</label>
              <select value={discom} onChange={(e) => setDiscom(e.target.value)} disabled={!state}>
                <option value="">Select Discom</option>
                {discomOptions.map((d) => (
                  <option key={d.code} value={d.code}>{d.code} - {d.name}</option>
                ))}
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="mobile-form-field">
              <label>CA Account Number</label>
              <input type="text" value={caNumber} onChange={(e) => setCaNumber(e.target.value)} placeholder="Account identifier" />
            </div>

            <div className="mobile-form-row">
              <div className="mobile-form-field">
                <label>Avg. Monthly Bill (₹)</label>
                <input type="number" value={avgBill} onChange={(e) => setAvgBill(e.target.value)} placeholder="e.g. 4500" />
                {fieldErrors.avg_monthly_bill && <span className="field-error">{fieldErrors.avg_monthly_bill}</span>}
              </div>
              <div className="mobile-form-field">
                <label>Avg. Monthly Units</label>
                <input type="number" value={avgUnits} onChange={(e) => setAvgUnits(e.target.value)} placeholder="e.g. 520" />
                {fieldErrors.avg_monthly_units && <span className="field-error">{fieldErrors.avg_monthly_units}</span>}
              </div>
            </div>

            <div className="mobile-form-row">
              <div className="mobile-form-field">
                <label>Sanctioned Load (kW)</label>
                <input type="number" value={sanctionedLoad} onChange={(e) => setSanctionedLoad(e.target.value)} placeholder="e.g. 5" />
                {fieldErrors.sanctioned_load && <span className="field-error">{fieldErrors.sanctioned_load}</span>}
              </div>
              <div className="mobile-form-field">
                <label>Meter Configuration</label>
                <select value={metertype} onChange={(e) => setMetertype(e.target.value)}>
                  <option value="">Select meter</option>
                  {METER_TYPES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: ROOF & SITE */}
        {step === 3 && (
          <div className="mobile-step-card animate-slide">
            <h3>Rooftop & Location Details</h3>
            <p className="step-description">Enter structural metadata and drop a pin on the site coordinates.</p>

            <div className="mobile-form-field">
              <label>Site Address</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Exact site location" />
            </div>

            <div className="mobile-form-field">
              <label>Available Roof Area (sq. ft.)</label>
              <input type="number" value={roofArea} onChange={(e) => setRoofArea(e.target.value)} placeholder="Available roof shade-free size" />
              {fieldErrors.roof_area_sqft && <span className="field-error">{fieldErrors.roof_area_sqft}</span>}
            </div>

            <div className="mobile-form-field">
              <label>Map Location Coordinates (Optional)</label>
              <div className="mobile-location-picker-wrap">
                <LocationPicker
                  initialLat={latitude}
                  initialLng={longitude}
                  onLocationSelect={(lat, lng) => {
                    setLatitude(lat);
                    setLongitude(lng);
                  }}
                />
              </div>
              {latitude !== null && longitude !== null && (
                <div className="mobile-coordinates-alert">
                  📍 Verified Coordinates: {latitude.toFixed(5)}, {longitude.toFixed(5)}
                </div>
              )}
            </div>

            <div className="mobile-form-field">
              <label>Additional Requirements</label>
              <textarea value={requirement} onChange={(e) => setRequirement(e.target.value)} rows={2} placeholder="Customer specific remarks..." />
            </div>
          </div>
        )}

        {/* STEP 4: SUMMARY & SUBMISSION */}
        {step === 4 && (
          <div className="mobile-step-card animate-slide">
            <h3>Register New Lead</h3>
            <p className="step-description">Verify the entered information below before submission.</p>

            <div className="mobile-stepper-summary-box">
              <div className="summary-section">
                <h4>Client Info</h4>
                <p><strong>Name:</strong> {name}</p>
                <p><strong>Phone:</strong> {mobile}</p>
                {email && <p><strong>Email:</strong> {email}</p>}
                {type && <p><strong>Type:</strong> {type}</p>}
              </div>

              <div className="summary-section">
                <h4>Grid Info</h4>
                <p><strong>Utility:</strong> {state} - {discom || "Not Picked"}</p>
                {avgBill && <p><strong>Avg. Bill:</strong> ₹{avgBill} / month</p>}
                {sanctionedLoad && <p><strong>Load:</strong> {sanctionedLoad} kW</p>}
              </div>

              <div className="summary-section">
                <h4>Roof & Location</h4>
                {roofArea && <p><strong>Area:</strong> {roofArea} sq ft</p>}
                {address && <p><strong>Address:</strong> {address}</p>}
                {latitude && <p><strong>Coordinates:</strong> {latitude.toFixed(4)}, {longitude?.toFixed(4)}</p>}
              </div>
            </div>

            {submitError && <div className="mobile-stepper-submit-error">⚠️ {submitError}</div>}

            <button type="submit" className="mobile-stepper-submit-btn" disabled={submitting}>
              {submitting ? "Submitting Lead details..." : "🚀 Finalize and Create Lead"}
            </button>
          </div>
        )}

        {/* Persistent Bottom Stepper Control Navigation */}
        <div className="mobile-stepper-controls">
          {step > 1 && (
            <button type="button" className="stepper-btn prev-btn" onClick={handleBack}>
              ⬅️ Back
            </button>
          )}
          {step < 4 ? (
            <button type="button" className="stepper-btn next-btn" onClick={handleNext}>
              Continue ➡️
            </button>
          ) : null}
        </div>

      </form>
    </div>
  );
}
