import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { getLead, type LeadDetail } from "../../api/leads";
import { listAmcPlans, type AmcPlan } from "../../api/amcPlans";
import { getEntityPreferences } from "../../api/entityPreferences";
import {
  listQuotes,
  getQuote,
  createQuote,
  updateQuote,
  shareQuote,
  type QuoteDetail,
} from "../../api/quotes";
import { ApiError } from "../../api/client";
import { computeQuote, formatINR, subsidyForKw } from "../../lib/quoteCalculations";
import "./QuoteBuilderPage.css";

const PANEL_TYPES = ["DCR", "Non-DCR"];

type FormState = {
  capacity: string;
  panelMake: string;
  inverterMake: string;
  panelType: string;
  validityDays: string;
  pricePerWatt: string;
  gstRate: string;
  dailyYield: string;
  tariff: string;
  applySubsidy: boolean;
  subsidyAmount: string;
  amcId: string;
  amcDurationYears: string;
  notes: string;
  terms: string[];
};

const DEFAULT_FORM: FormState = {
  capacity: "5",
  panelMake: "",
  inverterMake: "",
  panelType: "DCR",
  validityDays: "15",
  pricePerWatt: "50",
  gstRate: "13.8",
  dailyYield: "4.2",
  tariff: "9",
  applySubsidy: true,
  subsidyAmount: "",
  amcId: "",
  amcDurationYears: "",
  notes: "",
  terms: [],
};

export default function QuoteBuilderPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const { leadId } = useParams();

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [amcPlans, setAmcPlans] = useState<AmcPlan[]>([]);
  const [existingQuote, setExistingQuote] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [newTerm, setNewTerm] = useState("");
  const [subsidyTouched, setSubsidyTouched] = useState(false);

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
      listAmcPlans(entityId, { is_active: true }),
      listQuotes(entityId, Number(leadId)),
    ])
      .then(async ([leadRes, amcRes, quotesRes]) => {
        setLead(leadRes);
        setAmcPlans(amcRes.items);

        if (quotesRes.items.length > 0) {
          const quote = await getQuote(entityId, Number(leadId), quotesRes.items[0].quote_id);
          setExistingQuote(quote);
          setForm({
            capacity: quote.capacity != null ? String(quote.capacity) : "",
            panelMake: quote.panel_make ?? "",
            inverterMake: quote.inverter_make ?? "",
            panelType: quote.panel_type ?? "DCR",
            validityDays: quote.validity_days != null ? String(quote.validity_days) : "15",
            pricePerWatt: quote.price_per_watt != null ? String(quote.price_per_watt) : "",
            gstRate: quote.gst_rate != null ? String(quote.gst_rate) : "13.8",
            dailyYield: quote.daily_yield != null ? String(quote.daily_yield) : "4.2",
            tariff: quote.tariff != null ? String(quote.tariff) : "9",
            applySubsidy: quote.apply_subsidy ?? true,
            subsidyAmount: quote.subsidy_amount ?? "",
            amcId: quote.amc_id != null ? String(quote.amc_id) : "",
            amcDurationYears: quote.amc_duration_years != null ? String(quote.amc_duration_years) : "",
            notes: quote.notes ?? "",
            terms: quote.terms ?? [],
          });
          setSubsidyTouched(true);
        } else {
          const prefs = await getEntityPreferences(entityId);
          const capacity = leadRes.sanctioned_load != null ? leadRes.sanctioned_load : Number(DEFAULT_FORM.capacity);
          setForm({
            ...DEFAULT_FORM,
            capacity: String(capacity),
            pricePerWatt: String(prefs.pricing.default_price_per_watt ?? DEFAULT_FORM.pricePerWatt),
            subsidyAmount: String(subsidyForKw(capacity, leadRes.type)),
            // Quote notes are folded into terms (not kept as separate free text) so they're
            // individually addable/removable the same way as the rest of the terms list.
            terms: [
              ...prefs.document_customization.custom_terms_and_conditions,
              ...prefs.document_customization.quote_notes,
            ],
          });
          setSubsidyTouched(false);
        }
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [entityId, leadId]);

  const selectedAmcPlan = useMemo(
    () => amcPlans.find((p) => String(p.amc_id) === form.amcId) ?? null,
    [amcPlans, form.amcId],
  );

  // Keep the suggested subsidy amount in sync with capacity/segment until the
  // admin explicitly edits it — matches the preview, which falls back to the
  // same ladder when the field is left blank.
  useEffect(() => {
    if (subsidyTouched || !lead) return;
    const suggested = subsidyForKw(Number(form.capacity) || 0, lead.type);
    setForm((f) => (f.subsidyAmount === String(suggested) ? f : { ...f, subsidyAmount: String(suggested) }));
  }, [form.capacity, lead, subsidyTouched]);

  const computed = useMemo(() => {
    return computeQuote({
      capacityKw: Number(form.capacity) || 0,
      pricePerWatt: Number(form.pricePerWatt) || 0,
      gstRate: Number(form.gstRate) || 0,
      dailyYield: Number(form.dailyYield) || 4.2,
      tariff: Number(form.tariff) || 9,
      applySubsidy: form.applySubsidy,
      subsidyAmount: form.subsidyAmount ? Number(form.subsidyAmount) : null,
      segment: lead?.type ?? null,
      amcRatePerKw: selectedAmcPlan?.rate_per_kw != null ? Number(selectedAmcPlan.rate_per_kw) : null,
      amcDurationYears: form.amcDurationYears ? Number(form.amcDurationYears) : null,
    });
  }, [form, lead, selectedAmcPlan]);

  const locked = existingQuote != null && existingQuote.status !== "GENERATED";

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
      total_amount: computed.netInvestment,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      panel_make: form.panelMake.trim() || undefined,
      inverter_make: form.inverterMake.trim() || undefined,
      panel_type: form.panelType || undefined,
      validity_days: form.validityDays ? Number(form.validityDays) : undefined,
      price_per_watt: form.pricePerWatt ? Number(form.pricePerWatt) : undefined,
      gst_rate: form.gstRate ? Number(form.gstRate) : undefined,
      daily_yield: form.dailyYield ? Number(form.dailyYield) : undefined,
      tariff: form.tariff ? Number(form.tariff) : undefined,
      apply_subsidy: form.applySubsidy,
      subsidy_amount: form.subsidyAmount ? Number(form.subsidyAmount) : undefined,
      amc_id: form.amcId ? Number(form.amcId) : undefined,
      amc_duration_years: form.amcDurationYears ? Number(form.amcDurationYears) : undefined,
      notes: form.notes.trim() || undefined,
      terms: form.terms,
    };

    try {
      if (existingQuote) {
        const updated = await updateQuote(entityId, Number(leadId), existingQuote.quote_id, payload);
        setExistingQuote(updated);
      } else {
        const created = await createQuote(entityId, Number(leadId), payload);
        const full = await getQuote(entityId, Number(leadId), created.quote_id);
        setExistingQuote(full);
      }
      setStatus({ kind: "success", message: "Saved." });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  // POST .../share is idempotent — it returns the same stable URL on every
  // call once the quote's first share link exists — so we can fetch it
  // eagerly as soon as a quote exists, instead of waiting for a button click.
  useEffect(() => {
    if (!leadId || !existingQuote) return;
    setSharing(true);
    setShareUrl(null);
    shareQuote(entityId, Number(leadId), existingQuote.quote_id)
      .then((res) => setShareUrl(res.share_url))
      .catch((err) => setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Could not load share link" }))
      .finally(() => setSharing(false));
  }, [entityId, leadId, existingQuote?.quote_id]);

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
          Quote for {lead.name}{" "}
          {existingQuote && <span className="quote-status-badge">{existingQuote.status}</span>}
        </h1>
      </div>

      <div className="quote-builder-grid">
        <div className="quote-form-panel">
          <form onSubmit={handleSubmit} noValidate>
            <p className="quote-section-label">System</p>
            <div className="quote-field-row">
              <div className="quote-field">
                <label htmlFor="qCapacity">Capacity (kW)</label>
                <input
                  id="qCapacity"
                  type="number"
                  step="0.1"
                  disabled={locked}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                />
              </div>
              <div className="quote-field">
                <label htmlFor="qPanelType">Panel type</label>
                <select
                  id="qPanelType"
                  disabled={locked}
                  value={form.panelType}
                  onChange={(e) => setForm({ ...form, panelType: e.target.value })}
                >
                  {PANEL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="quote-field-row">
              <div className="quote-field">
                <label htmlFor="qPanelMake">Panel make</label>
                <input
                  id="qPanelMake"
                  type="text"
                  disabled={locked}
                  value={form.panelMake}
                  onChange={(e) => setForm({ ...form, panelMake: e.target.value })}
                />
              </div>
              <div className="quote-field">
                <label htmlFor="qInverterMake">Inverter make</label>
                <input
                  id="qInverterMake"
                  type="text"
                  disabled={locked}
                  value={form.inverterMake}
                  onChange={(e) => setForm({ ...form, inverterMake: e.target.value })}
                />
              </div>
            </div>

            <div className="quote-field">
              <label htmlFor="qDailyYield">Daily yield (kWh/kW/day)</label>
              <input
                id="qDailyYield"
                type="number"
                step="0.1"
                disabled={locked}
                value={form.dailyYield}
                onChange={(e) => setForm({ ...form, dailyYield: e.target.value })}
              />
            </div>

            <p className="quote-section-label">Pricing</p>
            <div className="quote-field-row">
              <div className="quote-field">
                <label htmlFor="qPricePerWatt">Price per watt (₹)</label>
                <input
                  id="qPricePerWatt"
                  type="number"
                  step="0.5"
                  disabled={locked}
                  value={form.pricePerWatt}
                  onChange={(e) => setForm({ ...form, pricePerWatt: e.target.value })}
                />
              </div>
              <div className="quote-field">
                <label htmlFor="qGstRate">GST rate (%)</label>
                <input
                  id="qGstRate"
                  type="number"
                  step="0.1"
                  disabled={locked}
                  value={form.gstRate}
                  onChange={(e) => setForm({ ...form, gstRate: e.target.value })}
                />
              </div>
            </div>

            <div className="quote-field">
              <label htmlFor="qTariff">Grid tariff (₹/unit)</label>
              <input
                id="qTariff"
                type="number"
                step="0.1"
                disabled={locked}
                value={form.tariff}
                onChange={(e) => setForm({ ...form, tariff: e.target.value })}
              />
            </div>

            <div className="quote-checkbox-row">
              <input
                id="qApplySubsidy"
                type="checkbox"
                disabled={locked}
                checked={form.applySubsidy}
                onChange={(e) => setForm({ ...form, applySubsidy: e.target.checked })}
              />
              <label htmlFor="qApplySubsidy">Apply subsidy</label>
            </div>

            {form.applySubsidy && (
              <div className="quote-field">
                <label htmlFor="qSubsidyAmount">
                  Subsidy amount (₹) <span style={{ fontWeight: 400, color: "var(--app-text-muted)" }}>(prefilled from the PM Surya Ghar ladder for residential — edit to override)</span>
                </label>
                <input
                  id="qSubsidyAmount"
                  type="number"
                  disabled={locked}
                  value={form.subsidyAmount}
                  onChange={(e) => {
                    setSubsidyTouched(true);
                    setForm({ ...form, subsidyAmount: e.target.value });
                  }}
                />
              </div>
            )}

            <p className="quote-section-label">AMC</p>
            <div className="quote-field-row">
              <div className="quote-field">
                <label htmlFor="qAmcId">AMC plan</label>
                <select
                  id="qAmcId"
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
                <label htmlFor="qAmcDuration">Duration (years)</label>
                <input
                  id="qAmcDuration"
                  type="number"
                  disabled={locked || !form.amcId}
                  value={form.amcDurationYears}
                  onChange={(e) => setForm({ ...form, amcDurationYears: e.target.value })}
                />
              </div>
            </div>

            <p className="quote-section-label">Quote details</p>
            <div className="quote-field">
              <label htmlFor="qValidityDays">Validity (days)</label>
              <input
                id="qValidityDays"
                type="number"
                disabled={locked}
                value={form.validityDays}
                onChange={(e) => setForm({ ...form, validityDays: e.target.value })}
              />
            </div>

            <div className="quote-field">
              <label htmlFor="qNotes">Notes</label>
              <textarea
                id="qNotes"
                rows={3}
                disabled={locked}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            <div className="quote-field">
              <label htmlFor="qTermInput">Terms &amp; conditions</label>
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
                    id="qTermInput"
                    type="text"
                    placeholder="e.g. Quote valid for the stated validity period"
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
                  {saving ? "Saving…" : existingQuote ? "Save changes" : "Generate quote"}
                </button>
                {status && <span className={`quote-status-msg ${status.kind}`}>{status.message}</span>}
              </div>
            )}
            {locked && <p className="quote-status-msg">This quote is {existingQuote?.status.toLowerCase()} and can no longer be edited.</p>}
          </form>

          {existingQuote && (
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
              <tr>
                <td>Advance (30%)</td>
                <td>{formatINR(computed.payAdvance)}</td>
              </tr>
              <tr>
                <td>On dispatch (60%)</td>
                <td>{formatINR(computed.payDispatch)}</td>
              </tr>
              <tr>
                <td>On commissioning</td>
                <td>{formatINR(computed.payCommission)}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ fontSize: 13, color: "var(--app-text-muted)", marginBottom: form.terms.length > 0 ? 20 : 0 }}>
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
        </div>
      </div>
    </div>
  );
}
