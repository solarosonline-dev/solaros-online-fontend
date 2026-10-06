import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { getMyKyc, submitMyKyc, type Kyc } from "../../api/marketplaceKyc";
import { useAuth } from "../../lib/AuthContext";
import "./VendorKycPage.css";

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCT_RE = /^[0-9]{9,18}$/;

const BANNER: Record<Kyc["status"], string> = {
  NOT_SUBMITTED: "Submit your tax and bank details so Solaros can verify you and pay you out.",
  SUBMITTED: "Submitted — waiting for Solaros to verify. You can still edit and resubmit.",
  VERIFIED: "Verified. These details are locked; contact support to change them.",
  REJECTED: "Rejected — fix the issue below and resubmit.",
};

export default function VendorKycPage() {
  const { user } = useAuth();
  const entityId = user?.entity_id ?? null;

  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [legalName, setLegalName] = useState("");
  const [pan, setPan] = useState("");
  const [acctName, setAcctName] = useState("");
  const [acctNumber, setAcctNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upi, setUpi] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function applyKyc(k: Kyc) {
    setKyc(k);
    setLegalName(k.legal_name ?? "");
    setPan(k.pan ?? "");
    setAcctName(k.bank_account_name ?? "");
    setIfsc(k.bank_ifsc ?? "");
    setUpi(k.upi_id ?? "");
    // The full account number is never sent back; the owner re-enters it on edit.
    setAcctNumber("");
  }

  useEffect(() => {
    if (entityId == null) return;
    getMyKyc(entityId)
      .then(applyKyc)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load KYC"));
  }, [entityId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (entityId == null) return;
    setError(null);
    const panN = pan.trim().toUpperCase();
    const ifscN = ifsc.trim().toUpperCase();
    const acctN = acctNumber.replace(/\s/g, "");
    if (!legalName.trim() || !acctName.trim()) return setError("Legal name and account holder name are required.");
    if (!PAN_RE.test(panN)) return setError("Enter a valid PAN (e.g. ABCDE1234F).");
    if (!ACCT_RE.test(acctN)) return setError("Account number must be 9–18 digits.");
    if (!IFSC_RE.test(ifscN)) return setError("Enter a valid IFSC (e.g. HDFC0001234).");

    setSaving(true);
    try {
      const saved = await submitMyKyc(entityId, {
        legal_name: legalName.trim(),
        pan: panN,
        bank_account_name: acctName.trim(),
        bank_account_number: acctN,
        bank_ifsc: ifscN,
        upi_id: upi.trim() || null,
      });
      applyKyc(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit KYC");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <p>{loadError}</p>;
  if (!kyc) return <p>Loading…</p>;
  const locked = kyc.status === "VERIFIED";

  return (
    <div className="vendor-kyc-page">
      <h1>KYC &amp; payouts</h1>
      <p className="vendor-kyc-intro">Solaros buys from you and pays you directly, so we need to verify who we are paying.</p>
      <div className={`vendor-kyc-banner ${kyc.status === "VERIFIED" ? "verified" : kyc.status === "REJECTED" ? "rejected" : ""}`}>
        {BANNER[kyc.status]}
        {kyc.status === "REJECTED" && kyc.reject_reason && <div>Reason: {kyc.reject_reason}</div>}
      </div>

      <form className="vendor-kyc-form" onSubmit={handleSubmit} noValidate>
        <div className="vendor-kyc-field full">
          <label htmlFor="kycLegal">Legal business name</label>
          <input id="kycLegal" value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={locked} />
        </div>
        <div className="vendor-kyc-field">
          <label htmlFor="kycPan">PAN</label>
          <input id="kycPan" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} maxLength={10} disabled={locked} />
        </div>
        <div className="vendor-kyc-field">
          <label htmlFor="kycUpi">UPI ID (optional)</label>
          <input id="kycUpi" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@bank" disabled={locked} />
        </div>
        <div className="vendor-kyc-field full">
          <label htmlFor="kycAcctName">Bank account holder name</label>
          <input id="kycAcctName" value={acctName} onChange={(e) => setAcctName(e.target.value)} disabled={locked} />
        </div>
        <div className="vendor-kyc-field">
          <label htmlFor="kycAcct">Account number</label>
          <input
            id="kycAcct"
            inputMode="numeric"
            value={acctNumber}
            onChange={(e) => setAcctNumber(e.target.value)}
            placeholder={kyc.bank_account_number_masked ?? ""}
            disabled={locked}
          />
          {kyc.bank_account_number_masked && !locked && (
            <span className="vendor-kyc-hint">Saved: {kyc.bank_account_number_masked}. Re-enter to resubmit.</span>
          )}
          {locked && <span className="vendor-kyc-hint">{kyc.bank_account_number_masked}</span>}
        </div>
        <div className="vendor-kyc-field">
          <label htmlFor="kycIfsc">IFSC</label>
          <input id="kycIfsc" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} maxLength={11} disabled={locked} />
        </div>
        {error && (
          <p className="vendor-kyc-error" role="alert">
            {error}
          </p>
        )}
        {!locked && (
          <div className="vendor-kyc-actions">
            <button type="submit" className="vendor-kyc-btn" disabled={saving}>
              {saving ? "Submitting…" : kyc.status === "NOT_SUBMITTED" ? "Submit for verification" : "Resubmit"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
