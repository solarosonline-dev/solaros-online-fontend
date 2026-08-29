import { useRef, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  getPublicAgreement,
  signPublicAgreement,
  uploadAgreementPdf,
  type PublicAgreementResponse,
} from "../../api/agreements";
import { getPublicEntityBranding, DEFAULT_PAYMENT_SCHEDULE, type PublicBranding } from "../../api/entityPreferences";
import { ApiError } from "../../api/client";
import { computeQuote } from "../../lib/quoteCalculations";
import { captureElementAsPdf } from "../../lib/capturePdf";
import AgreementDocument from "./AgreementDocument";
import type { QuoteDocumentBranding } from "../quotes/QuoteDocument";
import SignaturePad, { type SignaturePadHandle } from "../../components/SignaturePad";
import { getDiscomName } from "../leads/discomOptions";
import "../quotes/PublicQuotePage.css";

export default function PublicAgreementPage() {
  const { token } = useParams();

  const [data, setData] = useState<PublicAgreementResponse | null>(null);
  const [branding, setBranding] = useState<PublicBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [signerName, setSignerName] = useState("");
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const sigPadRef = useRef<SignaturePadHandle>(null);

  // Set right after a successful sign to trigger the PDF-capture effect
  // below, once the DOM has actually re-rendered in the signed state
  // (name/image/timestamp/IP all filled in) — capturing synchronously
  // inside handleSign would race the render.
  const [pdfCapturePending, setPdfCapturePending] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const docRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    getPublicAgreement(token)
      .then(async (res) => {
        setData(res);
        try {
          setBranding(await getPublicEntityBranding(res.entity_id));
        } catch {
          // Branding is cosmetic — a fetch failure here shouldn't block the agreement itself.
        }
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load this agreement"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSign() {
    if (!token) return;
    const dataUrl = sigPadRef.current?.toDataUrl();
    if (!signerName.trim() || !dataUrl) return;
    setSigning(true);
    setSignError(null);
    try {
      await signPublicAgreement(token, { signerName: signerName.trim(), signatureImage: dataUrl });
      // Refetch rather than patching local state — picks up signed_ip and
      // the server's own signed_at, which the client can't know on its own.
      setData(await getPublicAgreement(token));
      setPdfCapturePending(true);
    } catch (err) {
      setSignError(err instanceof ApiError ? err.message : "Could not sign this agreement — try again");
    } finally {
      setSigning(false);
    }
  }

  // Runs once the DOM has committed the signed state (name/image/timestamp/
  // IP all rendered) — captures that as a PDF and uploads it. Best-effort:
  // the agreement is already legally accepted regardless of whether this
  // succeeds, so a failure here is a quiet notice, not a blocking error.
  useEffect(() => {
    if (!pdfCapturePending || !token || !data || data.agreement.status !== "ACCEPTED") return;
    setPdfCapturePending(false);
    const container = docRef.current;
    if (!container) return;

    (async () => {
      try {
        const pdf = await captureElementAsPdf(container);
        await uploadAgreementPdf(token, pdf);
      } catch {
        setPdfNotice("Signed successfully — a PDF copy couldn't be saved automatically, but you can revisit this link anytime.");
      }
    })();
  }, [pdfCapturePending, token, data]);

  if (loading) {
    return (
      <div className="public-quote-shell">
        <div className="public-quote-status">Loading your agreement…</div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="public-quote-shell">
        <div className="public-quote-status">{loadError ?? "This agreement link is invalid or has expired."}</div>
      </div>
    );
  }

  const { agreement, quote, lead, entity_name, amc, amc_plans, amc_post5_plans } = data;
  const signed = agreement.status === "ACCEPTED";

  const computed = quote
    ? computeQuote({
        capacityKw: quote.capacity ?? 0,
        pricePerWatt: quote.price_per_watt ?? 0,
        taxRate: quote.tax_rate ?? 0,
        dailyYield: quote.daily_yield ?? 4.2,
        tariff: quote.tariff ?? 9,
        applySubsidy: quote.apply_subsidy ?? false,
        subsidyAmount: quote.subsidy_amount != null ? Number(quote.subsidy_amount) : null,
        segment: lead.type,
        amcRatePerKw: null,
        amcDurationYears: null,
      })
    : null;

  const documentBranding: QuoteDocumentBranding = {
    entityName: branding?.entity_name ?? entity_name,
    primaryColor: branding?.primary_color,
    logoUrl: branding?.logo_url,
    footerTag: branding?.footer_tag,
    gstno: branding?.gstno,
    address: branding?.address,
    businessPhone: branding?.business_phone,
    businessEmail: branding?.business_email,
    tax_label: branding?.tax_label,
    tax_id_label: branding?.tax_id_label,
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

  const signatureAction = agreement.status === "REJECTED" ? (
    <p>This agreement is no longer active.</p>
  ) : (
    <div className="agr-sign-form">
      <input
        className="agr-sign-name-input"
        type="text"
        placeholder="Your full name"
        value={signerName}
        onChange={(e) => setSignerName(e.target.value)}
        disabled={signing}
      />
      <SignaturePad ref={sigPadRef} onChange={setHasDrawnSignature} disabled={signing} />
      {signError && <p className="quote-accept-modal-error">{signError}</p>}
      <button
        className="public-quote-btn public-quote-btn--sign"
        onClick={handleSign}
        disabled={signing || !signerName.trim() || !hasDrawnSignature}
      >
        {signing ? "Signing…" : "Sign & accept"}
      </button>
    </div>
  );

  return (
    <div className="public-quote-shell">
      {pdfNotice && (
        <div className="public-quote-wrap no-print">
          <p className="quote-status-msg" style={{ color: "var(--app-text-muted)" }}>
            {pdfNotice}
          </p>
        </div>
      )}
      <div className="public-quote-wrap" ref={docRef}>
        {computed && quote ? (
          <AgreementDocument
            agreementNumber={agreement.agreement_number}
            createdAt={agreement.created_at}
            quoteNumber={quote.quote_number}
            capacityKw={quote.capacity ?? 0}
            panelMake={quote.panel_make}
            inverterMake={quote.inverter_make}
            components={quote.components ?? []}
            customerName={lead.name}
            customerAddress={lead.address}
            customerDiscom={getDiscomName(lead.discom)}
            customerMobile={lead.mobile}
            customerEmail={lead.email}
            segment={lead.type}
            pricePerWatt={quote.price_per_watt ?? 0}
            taxRate={quote.tax_rate ?? 0}
            computed={computed}
            amcFromQuote={quote.amc_id != null}
            amc={amc ? { name: amc.name, ratePerKw: amc.rate_per_kw != null ? Number(amc.rate_per_kw) : null, inclusion: amc.inclusion } : null}
            amcPlans={(amc_plans ?? []).map((p) => ({
              name: p.name,
              ratePerKw: p.rate_per_kw != null ? Number(p.rate_per_kw) : null,
              inclusion: p.inclusion,
            }))}
            amcDurationYears={agreement.amc_duration_years}
            amcMode={agreement.amc_mode ?? "chargeable"}
            amcPost5={{
              enabled: agreement.amc_post5_enabled ?? false,
              plans: (amc_post5_plans ?? []).map((p) => ({
                name: p.name,
                ratePerKw: p.rate_per_kw != null ? Number(p.rate_per_kw) : null,
                inclusion: p.inclusion,
              })),
            }}
            // Once signed, the backend returns the payment schedule that
            // was frozen at signing time (see settings_snapshot) directly
            // on the agreement response -- prefer that over the live
            // branding fetch so a signed agreement can't be shown a
            // since-edited schedule.
            paymentSchedule={data.payment_schedule ?? branding?.payment_schedule ?? DEFAULT_PAYMENT_SCHEDULE}
            terms={agreement.terms ?? []}
            branding={documentBranding}
            shareUrl={typeof window !== "undefined" ? window.location.href : null}
            signature={{
              signed,
              signerName: agreement.signer_name,
              signatureImage: agreement.signature_image,
              signedAt: agreement.signed_at,
              signedIp: agreement.signed_ip,
            }}
            signatureAction={signatureAction}
          />
        ) : (
          <div className="public-quote-status">This agreement has no linked quote to display.</div>
        )}
      </div>
    </div>
  );
}
