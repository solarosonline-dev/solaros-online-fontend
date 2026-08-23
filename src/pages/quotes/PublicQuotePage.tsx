import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  acceptQuoteWithoutOtp,
  getPublicQuote,
  requestQuoteOtp,
  verifyQuoteOtp,
  type PublicQuoteResponse,
} from "../../api/quotes";
import { getPublicEntityBranding, type PublicBranding } from "../../api/entityPreferences";
import { ApiError } from "../../api/client";
import { computeQuote } from "../../lib/quoteCalculations";
import QuoteDocument, { type QuoteDocumentBranding } from "./QuoteDocument";
import { getDiscomName } from "../leads/discomOptions";
import Modal from "../../components/Modal";
import "./PublicQuotePage.css";

type AcceptStep = "confirm" | "otp";

const RESEND_COOLDOWN_SECONDS = 45;

export default function PublicQuotePage() {
  const { token } = useParams();

  const [data, setData] = useState<PublicQuoteResponse | null>(null);
  const [branding, setBranding] = useState<PublicBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [justAccepted, setJustAccepted] = useState(false);

  // Accept-quote modal: step 1 confirms terms/AMC-pricing agreement and
  // sends an OTP to the lead's email; step 2 verifies that code before the
  // quote actually flips to ACCEPTED.
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<AcceptStep>("confirm");
  const [agreed, setAgreed] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (!token) return;
    getPublicQuote(token)
      .then(async (res) => {
        setData(res);
        try {
          setBranding(await getPublicEntityBranding(res.entity_id));
        } catch {
          // Branding is cosmetic — a fetch failure here shouldn't block the quote itself.
        }
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load this quote"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  function openAcceptModal() {
    setStep("confirm");
    setAgreed(false);
    setOtp("");
    setOtpError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (requesting || verifying) return;
    setModalOpen(false);
  }

  // EPC-admin escape hatch (entity preference `skip_quote_otp`) — set when
  // the transactional email provider is down, so customers aren't blocked
  // from accepting just because no OTP can be delivered. When on, "Send
  // code" instead accepts directly on consent alone; the backend re-checks
  // this same flag, so it can't be bypassed by a stale/cached branding fetch.
  const skipOtp = branding?.skip_quote_otp ?? false;

  async function handleSendCode() {
    if (!token) return;
    setRequesting(true);
    setOtpError(null);
    try {
      if (skipOtp) {
        await acceptQuoteWithoutOtp(token);
        setJustAccepted(true);
        setModalOpen(false);
        return;
      }
      const res = await requestQuoteOtp(token);
      setMaskedEmail(res.masked_email);
      setOtp("");
      setStep("otp");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : "Could not send the code — try again");
    } finally {
      setRequesting(false);
    }
  }

  async function handleVerify() {
    if (!token) return;
    setVerifying(true);
    setOtpError(null);
    try {
      await verifyQuoteOtp(token, otp);
      setJustAccepted(true);
      setModalOpen(false);
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : "Could not verify the code — try again");
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <div className="public-quote-shell">
        <div className="public-quote-status">Loading your quote…</div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="public-quote-shell">
        <div className="public-quote-status">{loadError ?? "This quote link is invalid or has expired."}</div>
      </div>
    );
  }

  const { quote, lead, entity_name, amc, amc_post5_plans } = data;
  const accepted = justAccepted || quote.status === "ACCEPTED";

  const computed = computeQuote({
    capacityKw: quote.capacity ?? 0,
    pricePerWatt: quote.price_per_watt ?? 0,
    gstRate: quote.gst_rate ?? 0,
    dailyYield: quote.daily_yield ?? 4.2,
    tariff: quote.tariff ?? 9,
    applySubsidy: quote.apply_subsidy ?? false,
    subsidyAmount: quote.subsidy_amount != null ? Number(quote.subsidy_amount) : null,
    segment: lead.type,
    amcRatePerKw: amc?.rate_per_kw != null ? Number(amc.rate_per_kw) : null,
    amcDurationYears: quote.amc_duration_years,
  });

  const documentBranding: QuoteDocumentBranding = {
    entityName: branding?.entity_name ?? entity_name,
    primaryColor: branding?.primary_color,
    logoUrl: branding?.logo_url,
    tagline: branding?.company_tagline,
    footerTag: branding?.footer_tag,
    gstno: branding?.gstno,
    address: branding?.address,
    businessPhone: branding?.business_phone,
    businessEmail: branding?.business_email,
    typography: branding
      ? {
          h1: branding.h1_font_size,
          h2: branding.h2_font_size,
          h3: branding.h3_font_size,
          body: branding.body_font_size,
          small: branding.small_font_size,
        }
      : undefined,
  };

  const signatureAction = accepted ? (
    <div className="public-quote-accepted">
      <div className="icon">✅</div>
      <p>You've accepted this quote. Our team will be in touch shortly.</p>
    </div>
  ) : quote.status === "REJECTED" ? (
    <p>This quote is no longer active.</p>
  ) : (
    <button className="public-quote-btn public-quote-btn--sign" onClick={openAcceptModal}>
      Accept this quote
    </button>
  );

  return (
    <div className="public-quote-shell">
      <div className="public-quote-wrap">
        <QuoteDocument
          quoteId={quote.quote_id}
          createdAt={quote.created_at}
          validityDays={quote.validity_days}
          capacityKw={quote.capacity ?? 0}
          panelMake={quote.panel_make}
          inverterMake={quote.inverter_make}
          panelType={quote.panel_type}
          notes={quote.notes}
          terms={quote.terms ?? []}
          components={quote.components_enabled ? quote.components ?? [] : []}
          customerName={lead.name}
          customerAddress={lead.address}
          customerDiscom={getDiscomName(lead.discom)}
          customerMobile={lead.mobile}
          customerEmail={lead.email}
          segment={lead.type}
          pricePerWatt={quote.price_per_watt ?? 0}
          gstRate={quote.gst_rate ?? 0}
          tariff={quote.tariff ?? 9}
          computed={computed}
          amc={amc ? { name: amc.name, ratePerKw: amc.rate_per_kw != null ? Number(amc.rate_per_kw) : null, inclusion: amc.inclusion } : null}
          amcDurationYears={quote.amc_duration_years}
          amcMode={quote.amc_mode ?? "chargeable"}
          amcPost5={{
            enabled: quote.amc_post5_enabled ?? false,
            plans: (amc_post5_plans ?? []).map((p) => ({
              name: p.name,
              ratePerKw: p.rate_per_kw != null ? Number(p.rate_per_kw) : null,
              inclusion: p.inclusion,
            })),
          }}
          loan={{
            enabled: quote.loan_enabled ?? false,
            amount: quote.loan_amount != null ? Number(quote.loan_amount) : null,
            ratePercent: quote.loan_rate_percent != null ? Number(quote.loan_rate_percent) : null,
            tenureYears: quote.loan_tenure_years,
          }}
          branding={documentBranding}
          shareUrl={typeof window !== "undefined" ? window.location.href : null}
          signatureAction={signatureAction}
        />
      </div>

      <Modal open={modalOpen} onClose={closeModal} dismissible={!requesting && !verifying} aria-label="Accept this quote">
        {step === "confirm" ? (
          <div className="quote-accept-modal">
            <h3>Accept this quote</h3>
            <p className="quote-accept-modal-note">
              {skipOtp
                ? "Please confirm you agree to the Terms & Conditions and the AMC pricing shown in this quote."
                : "Please confirm you agree to the Terms & Conditions and the AMC pricing shown in this quote. We'll then email a 6-digit code to your registered email to confirm it's really you."}
            </p>
            <label className="quote-accept-modal-checkbox">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I agree to the Terms &amp; Conditions and the AMC pricing shown in this quote.</span>
            </label>
            {otpError && <p className="quote-accept-modal-error">{otpError}</p>}
            <div className="quote-accept-modal-actions">
              <button className="quote-accept-modal-btn quote-accept-modal-btn--ghost" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="quote-accept-modal-btn quote-accept-modal-btn--primary"
                onClick={handleSendCode}
                disabled={!agreed || requesting}
              >
                {skipOtp
                  ? requesting
                    ? "Accepting…"
                    : "Accept quote"
                  : requesting
                    ? "Sending…"
                    : "Send code"}
              </button>
            </div>
          </div>
        ) : (
          <div className="quote-accept-modal">
            <h3>Enter the code</h3>
            <p className="quote-accept-modal-note">
              We sent a 6-digit code to <strong>{maskedEmail}</strong>. Enter it below to accept this quote.
            </p>
            <input
              className="quote-accept-modal-otp-input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              autoFocus
            />
            {otpError && <p className="quote-accept-modal-error">{otpError}</p>}
            <div className="quote-accept-modal-actions">
              <button className="quote-accept-modal-btn quote-accept-modal-btn--ghost" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="quote-accept-modal-btn quote-accept-modal-btn--primary"
                onClick={handleVerify}
                disabled={otp.length !== 6 || verifying}
              >
                {verifying ? "Verifying…" : "Verify & accept"}
              </button>
            </div>
            <button
              className="quote-accept-modal-resend"
              onClick={handleSendCode}
              disabled={resendCooldown > 0 || requesting}
            >
              {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : requesting ? "Sending…" : "Resend code"}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
