import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getPublicQuote, acceptPublicQuote, type PublicQuoteResponse } from "../../api/quotes";
import { ApiError } from "../../api/client";
import { computeQuote, formatINR } from "../../lib/quoteCalculations";
import "./PublicQuotePage.css";

export default function PublicQuotePage() {
  const { token } = useParams();

  const [data, setData] = useState<PublicQuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);

  useEffect(() => {
    if (!token) return;
    getPublicQuote(token)
      .then(setData)
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

  const { quote, lead, entity_name } = data;
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
    amcRatePerKw: null,
    amcDurationYears: quote.amc_duration_years,
  });

  return (
    <div className="public-quote-shell">
      <div className="public-quote-card">
        <div className="public-quote-header">
          <h1>{entity_name}</h1>
          <p>Solar quote for {lead.name}</p>
        </div>

        <div className="public-quote-metrics">
          <div className="public-quote-metric">
            <div className="value">{quote.capacity} kW</div>
            <div className="label">System size</div>
          </div>
          <div className="public-quote-metric">
            <div className="value">{formatINR(computed.monthlySaving)}</div>
            <div className="label">Monthly savings</div>
          </div>
          <div className="public-quote-metric">
            <div className="value">{computed.paybackYrs.toFixed(1)} yrs</div>
            <div className="label">Payback period</div>
          </div>
          <div className="public-quote-metric">
            <div className="value">{Math.round(computed.trees)}</div>
            <div className="label">Tree-equivalent CO₂ offset</div>
          </div>
        </div>

        <table className="public-quote-table">
          <tbody>
            <tr>
              <td>Total system cost</td>
              <td>{formatINR(computed.totalCost)}</td>
            </tr>
            {computed.subsidy > 0 && (
              <tr>
                <td>Subsidy</td>
                <td>-{formatINR(computed.subsidy)}</td>
              </tr>
            )}
            <tr className="total">
              <td>Net investment</td>
              <td>{formatINR(computed.netInvestment)}</td>
            </tr>
          </tbody>
        </table>

        {(quote.panel_make || quote.inverter_make) && (
          <>
            <p className="public-quote-section-title">Equipment</p>
            <p style={{ fontSize: 14 }}>
              {quote.panel_make && <>Panels: {quote.panel_make} ({quote.panel_type})<br /></>}
              {quote.inverter_make && <>Inverter: {quote.inverter_make}</>}
            </p>
          </>
        )}

        {quote.notes && (
          <>
            <p className="public-quote-section-title">Notes</p>
            <p style={{ fontSize: 14 }}>{quote.notes}</p>
          </>
        )}

        {quote.terms && quote.terms.length > 0 && (
          <>
            <p className="public-quote-section-title">Terms &amp; conditions</p>
            <ul className="public-quote-terms">
              {quote.terms.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </>
        )}

        {quote.validity_days != null && (
          <p style={{ fontSize: 12, color: "var(--app-text-muted)", marginTop: 16 }}>
            Valid for {quote.validity_days} days from the date issued.
          </p>
        )}

        <div className="public-quote-actions">
          {accepted ? (
            <div className="public-quote-accepted">
              <div className="icon">✅</div>
              <p>You've accepted this quote. Our team will be in touch shortly.</p>
            </div>
          ) : quote.status === "REJECTED" ? (
            <p>This quote is no longer active.</p>
          ) : (
            <>
              <button className="public-quote-btn" onClick={handleAccept} disabled={accepting}>
                {accepting ? "Accepting…" : "Accept this quote"}
              </button>
              {acceptError && (
                <p style={{ color: "var(--app-danger)", marginTop: 10, fontSize: 13 }}>{acceptError}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
