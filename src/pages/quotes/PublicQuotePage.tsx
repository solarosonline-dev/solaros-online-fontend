import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getPublicQuote, acceptPublicQuote, type PublicQuoteResponse } from "../../api/quotes";
import { getPublicEntityBranding, type PublicBranding } from "../../api/entityPreferences";
import { ApiError } from "../../api/client";
import { computeQuote } from "../../lib/quoteCalculations";
import QuoteDocument, { type QuoteDocumentBranding } from "./QuoteDocument";
import { getDiscomName } from "../leads/discomOptions";
import "./PublicQuotePage.css";

export default function PublicQuotePage() {
  const { token } = useParams();

  const [data, setData] = useState<PublicQuoteResponse | null>(null);
  const [branding, setBranding] = useState<PublicBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);

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

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      await acceptPublicQuote(token);
      setJustAccepted(true);
    } catch (err) {
      setAcceptError(err instanceof ApiError ? err.message : "Could not accept this quote");
    } finally {
      setAccepting(false);
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
    <>
      <button className="public-quote-btn public-quote-btn--sign" onClick={handleAccept} disabled={accepting}>
        {accepting ? "Accepting…" : "Accept this quote"}
      </button>
      {acceptError && <p style={{ color: "var(--app-danger)", marginTop: 10, fontSize: 13 }}>{acceptError}</p>}
    </>
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
    </div>
  );
}
