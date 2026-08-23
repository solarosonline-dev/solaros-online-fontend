import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { getLead, type LeadDetail } from "../../api/leads";
import { listQuotes, getQuote, type QuoteDetail } from "../../api/quotes";
import { listAmcPlans, type AmcPlan } from "../../api/amcPlans";
import { getEntityPreferences, DEFAULT_PAYMENT_SCHEDULE, type PaymentScheduleRow } from "../../api/entityPreferences";
import {
  listAgreements,
  getAgreement,
  createAgreement,
  updateAgreement,
  shareAgreement,
  type AgreementDetail,
} from "../../api/agreements";
import { ApiError } from "../../api/client";
import { computeQuote, formatINR, roundToTen } from "../../lib/quoteCalculations";
import "../quotes/QuoteBuilderPage.css";

type FormState = {
  amcId: string;
  amcDurationYears: string;
  terms: string[];
};

export default function AgreementBuilderPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const { leadId } = useParams();

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [amcPlans, setAmcPlans] = useState<AmcPlan[]>([]);
  const [existingAgreement, setExistingAgreement] = useState<AgreementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({ amcId: "", amcDurationYears: "", terms: [] });
  const [paymentSchedule, setPaymentSchedule] = useState<PaymentScheduleRow[]>(DEFAULT_PAYMENT_SCHEDULE);
  const [newTerm, setNewTerm] = useState("");

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    setLoadError(null);

    Promise.all([
      getLead(entityId, Number(leadId)),
      listQuotes(entityId, Number(leadId)),
      listAmcPlans(entityId, { is_active: true }),
      listAgreements(entityId, Number(leadId)),
    ])
      .then(async ([leadRes, quotesRes, amcRes, agreementsRes]) => {
        setLead(leadRes);
        setAmcPlans(amcRes.items);

        if (quotesRes.items.length === 0) {
          setLoadError("No quote found for this lead yet — generate and accept a quote first.");
          return;
        }
        const quoteRes = await getQuote(entityId, Number(leadId), quotesRes.items[0].quote_id);
        setQuote(quoteRes);

        const prefs = await getEntityPreferences(entityId);
        setPaymentSchedule(prefs.payment_schedule.rows);

        if (agreementsRes.items.length > 0) {
          const agreement = await getAgreement(entityId, Number(leadId), agreementsRes.items[0].agreement_id);
          setExistingAgreement(agreement);
          setForm({
            amcId: agreement.amc_id != null ? String(agreement.amc_id) : "",
            amcDurationYears: agreement.amc_duration_years != null ? String(agreement.amc_duration_years) : "",
            terms: agreement.terms ?? [],
          });
        } else {
          setForm({
            amcId: quoteRes.amc_id != null ? String(quoteRes.amc_id) : "",
            amcDurationYears: quoteRes.amc_duration_years != null ? String(quoteRes.amc_duration_years) : "",
            // Same pattern as quotes: entity's document defaults are folded into
            // the editable terms list, not kept as separate free text.
            terms: [
              ...prefs.document_customization.custom_terms_and_conditions,
              ...prefs.document_customization.agreement_notes,
            ],
          });
        }
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [entityId, leadId]);

  // POST .../share is idempotent (stable even after acceptance), so load it
  // eagerly as soon as an agreement exists — same pattern as the quote builder.
  useEffect(() => {
    if (!leadId || !existingAgreement) return;
    setSharing(true);
    setShareUrl(null);
    shareAgreement(entityId, Number(leadId), existingAgreement.agreement_id)
      .then((res) => setShareUrl(res.share_url))
      .catch((err) => setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Could not load share link" }))
      .finally(() => setSharing(false));
  }, [entityId, leadId, existingAgreement?.agreement_id]);

  const selectedAmcPlan = useMemo(
    () => amcPlans.find((p) => String(p.amc_id) === form.amcId) ?? null,
    [amcPlans, form.amcId],
  );

  const computed = useMemo(() => {
    if (!quote) return null;
    return computeQuote({
      capacityKw: quote.capacity ?? 0,
      pricePerWatt: quote.price_per_watt ?? 0,
      gstRate: quote.gst_rate ?? 0,
      dailyYield: quote.daily_yield ?? 4.2,
      tariff: quote.tariff ?? 9,
      applySubsidy: quote.apply_subsidy ?? false,
      subsidyAmount: quote.subsidy_amount != null ? Number(quote.subsidy_amount) : null,
      segment: lead?.type ?? null,
      amcRatePerKw: selectedAmcPlan?.rate_per_kw != null ? Number(selectedAmcPlan.rate_per_kw) : null,
      amcDurationYears: form.amcDurationYears ? Number(form.amcDurationYears) : null,
    });
  }, [quote, lead, form.amcDurationYears, selectedAmcPlan]);

  // Same derivation as QuoteDocument's payment-schedule section: each row's
  // amount is its configured percent of the total cost, rounded to the
  // nearest ₹10, except the last row which absorbs the rounding remainder
  // so the rows foot exactly to the total.
  const paymentRows = useMemo(() => {
    if (!computed) return [];
    let runningTotal = 0;
    return paymentSchedule.map((row, i) => {
      const isLast = i === paymentSchedule.length - 1;
      const amount = isLast ? computed.totalCost - runningTotal : roundToTen(computed.totalCost * (row.percent / 100));
      runningTotal += amount;
      return { ...row, amount };
    });
  }, [computed, paymentSchedule]);

  const locked = existingAgreement != null && existingAgreement.status !== "NEW";

  function handleAddTerm() {
    const trimmed = newTerm.trim();
    if (!trimmed) return;
    setForm({ ...form, terms: [...form.terms, trimmed] });
    setNewTerm("");
  }

  function handleTermKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTerm();
    }
  }

  function handleRemoveTerm(index: number) {
    setForm({ ...form, terms: form.terms.filter((_, i) => i !== index) });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!leadId) return;
    setStatus(null);
    setSaving(true);

    const payload = {
      amc_id: form.amcId ? Number(form.amcId) : undefined,
      amc_duration_years: form.amcDurationYears ? Number(form.amcDurationYears) : undefined,
      terms: form.terms,
    };

    try {
      if (existingAgreement) {
        const updated = await updateAgreement(entityId, Number(leadId), existingAgreement.agreement_id, payload);
        setExistingAgreement(updated);
      } else {
        const created = await createAgreement(entityId, Number(leadId), payload);
        const full = await getAgreement(entityId, Number(leadId), created.agreement_id);
        setExistingAgreement(full);
      }
      setStatus({ kind: "success", message: "Saved." });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="quote-loading">Loading…</div>;
  if (loadError || !lead) {
    return (
      <div className="quote-builder">
        <Link to={`/app/leads/${leadId}`} className="quote-builder-back">
          ← Back to lead
        </Link>
        <p className="quote-status-msg error">{loadError ?? "Lead not found."}</p>
      </div>
    );
  }

  return (
    <div className="quote-builder">
      <Link to={`/app/leads/${leadId}`} className="quote-builder-back">
        ← Back to lead
      </Link>

      <div className="quote-builder-header">
        <h1>
          Agreement for {lead.name}{" "}
          {existingAgreement && <span className="quote-status-badge">{existingAgreement.status}</span>}
        </h1>
      </div>

      <div className="quote-builder-grid">
        <div className="quote-form-panel">
          <p className="quote-section-label" style={{ marginTop: 0 }}>
            From quote
          </p>
          <div className="quote-field-row">
            <div className="quote-field">
              <label>Capacity (kW)</label>
              <input type="text" disabled value={quote?.capacity ?? ""} />
            </div>
            <div className="quote-field">
              <label>Panel type</label>
              <input type="text" disabled value={quote?.panel_type ?? ""} />
            </div>
          </div>
          <div className="quote-field-row">
            <div className="quote-field">
              <label>Panel make</label>
              <input type="text" disabled value={quote?.panel_make ?? ""} />
            </div>
            <div className="quote-field">
              <label>Inverter make</label>
              <input type="text" disabled value={quote?.inverter_make ?? ""} />
            </div>
          </div>
          <div className="quote-field-row">
            <div className="quote-field">
              <label>Price per watt (₹)</label>
              <input type="text" disabled value={quote?.price_per_watt ?? ""} />
            </div>
            <div className="quote-field">
              <label>Net investment</label>
              <input type="text" disabled value={computed ? formatINR(computed.netInvestment) : ""} />
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <p className="quote-section-label">AMC</p>
            <div className="quote-field-row">
              <div className="quote-field">
                <label htmlFor="aAmcId">AMC plan</label>
                <select
                  id="aAmcId"
                  disabled={locked}
                  value={form.amcId}
                  onChange={(e) => {
                    const amcId = e.target.value;
                    setForm({
                      ...form,
                      amcId,
                      amcDurationYears: amcId && !form.amcDurationYears ? "1" : form.amcDurationYears,
                    });
                  }}
                >
                  <option value="">None</option>
                  {amcPlans.map((p) => (
                    <option key={p.amc_id} value={p.amc_id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="quote-field">
                <label htmlFor="aAmcDuration">Duration (years)</label>
                <input
                  id="aAmcDuration"
                  type="number"
                  disabled={locked || !form.amcId}
                  value={form.amcDurationYears}
                  onChange={(e) => setForm({ ...form, amcDurationYears: e.target.value })}
                />
              </div>
            </div>

            <div className="quote-field">
              <label htmlFor="aTermInput">Terms &amp; conditions</label>
              {form.terms.length > 0 && (
                <ul className="quote-terms-list">
                  {form.terms.map((term, i) => (
                    <li key={i}>
                      <span>{term}</span>
                      {!locked && (
                        <button type="button" className="quote-terms-remove" onClick={() => handleRemoveTerm(i)}>
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!locked && (
                <div className="quote-terms-add-row">
                  <input
                    id="aTermInput"
                    type="text"
                    placeholder="e.g. Ownership transfers on final payment"
                    value={newTerm}
                    onChange={(e) => setNewTerm(e.target.value)}
                    onKeyDown={handleTermKeyDown}
                  />
                  <button type="button" className="quote-btn" onClick={handleAddTerm}>
                    + Add
                  </button>
                </div>
              )}
            </div>

            {!locked && (
              <div className="quote-status-bar">
                <button type="submit" className="quote-btn primary" disabled={saving}>
                  {saving ? "Saving…" : existingAgreement ? "Save changes" : "Generate agreement"}
                </button>
                {status && <span className={`quote-status-msg ${status.kind}`}>{status.message}</span>}
              </div>
            )}
            {locked && (
              <p className="quote-status-msg">
                This agreement is {existingAgreement?.status.toLowerCase()} and can no longer be edited.
              </p>
            )}
          </form>

          {existingAgreement && (
            <div className="quote-share-box" style={{ marginTop: 16 }}>
              {sharing ? (
                "Loading share link…"
              ) : shareUrl ? (
                <a href={shareUrl} target="_blank" rel="noreferrer">
                  {shareUrl}
                </a>
              ) : (
                "Could not load share link."
              )}
            </div>
          )}
        </div>

        <div className="quote-preview-panel">
          <p className="quote-section-label" style={{ marginTop: 0 }}>
            Live preview
          </p>

          {!computed ? (
            <p className="quote-status-msg">No quote data available.</p>
          ) : (
            <>
              <div className="quote-preview-metrics">
                <div className="quote-preview-metric">
                  <div className="value">{formatINR(computed.netInvestment)}</div>
                  <div className="label">Net investment</div>
                </div>
                <div className="quote-preview-metric">
                  <div className="value">{formatINR(computed.monthlySaving)}</div>
                  <div className="label">Monthly savings</div>
                </div>
                <div className="quote-preview-metric">
                  <div className="value">{computed.paybackYrs.toFixed(1)} yrs</div>
                  <div className="label">Payback period</div>
                </div>
                <div className="quote-preview-metric">
                  <div className="value">{Math.round(computed.monthlyKwh)} kWh</div>
                  <div className="label">Monthly generation</div>
                </div>
              </div>

              <table className="quote-breakdown-table">
                <tbody>
                  <tr>
                    <td>Base cost</td>
                    <td>{formatINR(computed.baseCost)}</td>
                  </tr>
                  <tr>
                    <td>GST</td>
                    <td>{formatINR(computed.gstAmount)}</td>
                  </tr>
                  <tr>
                    <td>Total cost</td>
                    <td>{formatINR(computed.totalCost)}</td>
                  </tr>
                  <tr>
                    <td>Subsidy</td>
                    <td>-{formatINR(computed.subsidy)}</td>
                  </tr>
                  <tr className="total">
                    <td>Net investment</td>
                    <td>{formatINR(computed.netInvestment)}</td>
                  </tr>
                </tbody>
              </table>

              {selectedAmcPlan && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 13, color: "var(--app-text-muted)", marginBottom: 6 }}>
                    {selectedAmcPlan.name}
                    {computed.amcTotalCost != null &&
                      ` — ${formatINR(computed.amcTotalCost)} total over ${form.amcDurationYears} year(s)`}
                  </p>
                  {selectedAmcPlan.inclusion.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--app-text-muted)" }}>
                      {selectedAmcPlan.inclusion.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <p className="quote-section-label">Payment schedule</p>
              <table className="quote-payment-table">
                <thead>
                  <tr>
                    <th>Milestone</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((row, i) => (
                    <tr key={i}>
                      <td>
                        {row.label} ({row.percent}%)
                      </td>
                      <td>{formatINR(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p
                style={{
                  fontSize: 13,
                  color: "var(--app-text-muted)",
                  marginBottom: form.terms.length > 0 ? 20 : 0,
                }}
              >
                {computed.co2Tons.toFixed(1)} tons CO₂ avoided/year · {Math.round(computed.trees)} tree-equivalent ·{" "}
                {formatINR(computed.lifetimeNet)} lifetime net savings (25 yr)
              </p>

              {form.terms.length > 0 && (
                <>
                  <p className="quote-section-label">Terms &amp; conditions</p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--app-text-muted)" }}>
                    {form.terms.map((term, i) => (
                      <li key={i}>{term}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
