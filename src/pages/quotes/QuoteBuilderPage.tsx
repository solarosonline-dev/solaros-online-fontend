import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { getLead, type LeadDetail } from "../../api/leads";
import { listAmcPlans, type AmcPlan } from "../../api/amcPlans";
import { getEntityPreferences, DEFAULT_PAYMENT_SCHEDULE, type EntityPreferences } from "../../api/entityPreferences";
import { getEntity, type Entity } from "../../api/entity";
import {
  listQuotes,
  getQuote,
  createQuote,
  updateQuote,
  shareQuote,
  type QuoteDetail,
  type QuoteComponentRow,
} from "../../api/quotes";
import { ApiError } from "../../api/client";
import { computeQuote, subsidyForKw } from "../../lib/quoteCalculations";
import QuoteDocument, { type QuoteDocumentBranding } from "./QuoteDocument";
import { getDiscomName } from "../leads/discomOptions";
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
  amcMode: "included" | "chargeable";
  amcPost5Enabled: boolean;
  /** Up to 3 amc_id values, in selection order. */
  amcPost5PlanIds: string[];
  loanEnabled: boolean;
  loanAmount: string;
  loanRatePercent: string;
  loanTenureYears: string;
  notes: string;
  terms: string[];
  components: QuoteComponentRow[];
  componentsEnabled: boolean;
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
  amcMode: "chargeable",
  amcPost5Enabled: false,
  amcPost5PlanIds: [],
  loanEnabled: false,
  loanAmount: "",
  loanRatePercent: "",
  loanTenureYears: "",
  notes: "",
  terms: [],
  components: [],
  componentsEnabled: false,
};

export default function QuoteBuilderPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const { leadId } = useParams();

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [amcPlans, setAmcPlans] = useState<AmcPlan[]>([]);
  const [existingQuote, setExistingQuote] = useState<QuoteDetail | null>(null);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [preferences, setPreferences] = useState<EntityPreferences | null>(null);
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
      getEntity(entityId),
      getEntityPreferences(entityId),
    ])
      .then(async ([leadRes, amcRes, quotesRes, entityRes, prefsRes]) => {
        setLead(leadRes);
        setAmcPlans(amcRes.items);
        setEntity(entityRes);
        setPreferences(prefsRes);

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
            amcMode: quote.amc_mode ?? "chargeable",
            amcPost5Enabled: quote.amc_post5_enabled ?? false,
            amcPost5PlanIds: (quote.amc_post5_plan_ids ?? []).map(String),
            loanEnabled: quote.loan_enabled ?? false,
            loanAmount: quote.loan_amount ?? "",
            loanRatePercent: quote.loan_rate_percent ?? "",
            loanTenureYears: quote.loan_tenure_years != null ? String(quote.loan_tenure_years) : "",
            notes: quote.notes ?? "",
            terms: quote.terms ?? [],
            components: quote.components ?? [],
            componentsEnabled: quote.components_enabled ?? false,
          });
          setSubsidyTouched(true);
        } else {
          const capacity = leadRes.sanctioned_load != null ? leadRes.sanctioned_load : Number(DEFAULT_FORM.capacity);
          setForm({
            ...DEFAULT_FORM,
            capacity: String(capacity),
            pricePerWatt: String(prefsRes.pricing.default_price_per_watt ?? DEFAULT_FORM.pricePerWatt),
            subsidyAmount: String(subsidyForKw(capacity, leadRes.type)),
            // Quote notes are folded into terms (not kept as separate free text) so they're
            // individually addable/removable the same way as the rest of the terms list.
            terms: [
              ...prefsRes.document_customization.custom_terms_and_conditions,
              ...prefsRes.document_customization.quote_notes,
            ],
            components: prefsRes.components.items.map((item) => ({
              particular: item.particular,
              qty: null,
              price: null,
              tax_percent: item.tax_percent,
            })),
            componentsEnabled: false,
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

  const selectedPost5Plans = useMemo(
    () =>
      form.amcPost5PlanIds
        .map((id) => amcPlans.find((p) => String(p.amc_id) === id) ?? null)
        .filter((p): p is AmcPlan => p != null),
    [amcPlans, form.amcPost5PlanIds],
  );

  const documentBranding: QuoteDocumentBranding = useMemo(
    () => ({
      entityName: entity?.name ?? "SolarOS",
      primaryColor: preferences?.branding.primary_color,
      logoUrl: preferences?.branding.logo_url,
      tagline: preferences?.branding.company_tagline,
      footerTag: preferences?.branding.footer_tag,
      gstno: entity?.gstno,
      address: entity?.address,
      businessPhone: entity?.business_phone,
      businessEmail: entity?.business_email,
      typography: preferences
        ? {
            h1: preferences.typography.h1_font_size,
            h2: preferences.typography.h2_font_size,
            h3: preferences.typography.h3_font_size,
            body: preferences.typography.body_font_size,
            small: preferences.typography.small_font_size,
          }
        : undefined,
    }),
    [entity, preferences],
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

  function handleAddComponentRow() {
    setForm({
      ...form,
      components: [...form.components, { particular: "", qty: null, price: null, tax_percent: 18 }],
    });
  }

  function handleRemoveComponentRow(index: number) {
    setForm({ ...form, components: form.components.filter((_, i) => i !== index) });
  }

  function handleComponentFieldChange(
    index: number,
    field: keyof QuoteComponentRow,
    value: string,
  ) {
    setForm({
      ...form,
      components: form.components.map((row, i) => {
        if (i !== index) return row;
        if (field === "particular") return { ...row, particular: value };
        return { ...row, [field]: value === "" ? null : Number(value) };
      }),
    });
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
      amc_mode: form.amcId ? form.amcMode : undefined,
      amc_post5_enabled: form.amcPost5Enabled,
      amc_post5_plan_ids: form.amcPost5PlanIds.map(Number),
      loan_enabled: form.loanEnabled,
      loan_amount: form.loanAmount ? Number(form.loanAmount) : undefined,
      loan_rate_percent: form.loanRatePercent ? Number(form.loanRatePercent) : undefined,
      loan_tenure_years: form.loanTenureYears ? Number(form.loanTenureYears) : undefined,
      notes: form.notes.trim() || undefined,
      terms: form.terms,
      components: form.components,
      components_enabled: form.componentsEnabled,
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
      <Link to={`/app/leads/${leadId}`} className="quote-builder-back no-print">
        ← Back to lead
      </Link>

      <div className="quote-builder-header no-print">
        <h1>
          Quote for {lead.name}{" "}
          {existingQuote && <span className="quote-status-badge">{existingQuote.status}</span>}
        </h1>
      </div>

      <div className="quote-builder-grid">
        <div className="quote-form-panel no-print">
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
            {form.amcId && (
              <div className="quote-field">
                <label htmlFor="qAmcMode">Pricing</label>
                <select
                  id="qAmcMode"
                  disabled={locked}
                  value={form.amcMode}
                  onChange={(e) => setForm({ ...form, amcMode: e.target.value as "included" | "chargeable" })}
                >
                  <option value="chargeable">Chargeable — customer pays</option>
                  <option value="included">Included — bundled free of cost</option>
                </select>
              </div>
            )}

            <p className="quote-section-label">AMC — years 6-15 (next 10 years)</p>
            <div className="quote-checkbox-row">
              <input
                id="qAmcPost5Enabled"
                type="checkbox"
                disabled={locked}
                checked={form.amcPost5Enabled}
                onChange={(e) => setForm({ ...form, amcPost5Enabled: e.target.checked })}
              />
              <label htmlFor="qAmcPost5Enabled">Offer AMC plans for years 6-15</label>
            </div>
            {form.amcPost5Enabled && (
              <div className="quote-field">
                <label>Select up to 3 plans from the AMC catalog</label>
                <div className="quote-checkbox-list">
                  {amcPlans.map((p) => {
                    const idStr = String(p.amc_id);
                    const checked = form.amcPost5PlanIds.includes(idStr);
                    const atLimit = form.amcPost5PlanIds.length >= 3;
                    return (
                      <div className="quote-checkbox-row" key={p.amc_id}>
                        <input
                          id={`qAmcPost5Plan-${p.amc_id}`}
                          type="checkbox"
                          disabled={locked || (!checked && atLimit)}
                          checked={checked}
                          onChange={(e) => {
                            setForm({
                              ...form,
                              amcPost5PlanIds: e.target.checked
                                ? [...form.amcPost5PlanIds, idStr]
                                : form.amcPost5PlanIds.filter((id) => id !== idStr),
                            });
                          }}
                        />
                        <label htmlFor={`qAmcPost5Plan-${p.amc_id}`}>{p.name}</label>
                      </div>
                    );
                  })}
                </div>
                <p className="quote-field-hint">
                  {form.amcPost5PlanIds.length}/3 selected — these render as columns alongside the years 1-5 AMC on the quote.
                </p>
              </div>
            )}

            <p className="quote-section-label">Loan financing</p>
            <div className="quote-checkbox-row">
              <input
                id="qLoanEnabled"
                type="checkbox"
                disabled={locked}
                checked={form.loanEnabled}
                onChange={(e) => setForm({ ...form, loanEnabled: e.target.checked })}
              />
              <label htmlFor="qLoanEnabled">Show loan financing on this quote</label>
            </div>
            {form.loanEnabled && (
              <>
                <div className="quote-field-row">
                  <div className="quote-field">
                    <label htmlFor="qLoanAmount">Loan amount (₹)</label>
                    <input
                      id="qLoanAmount"
                      type="number"
                      disabled={locked}
                      value={form.loanAmount}
                      onChange={(e) => setForm({ ...form, loanAmount: e.target.value })}
                    />
                  </div>
                  <div className="quote-field">
                    <label htmlFor="qLoanRate">Interest rate (% p.a.)</label>
                    <input
                      id="qLoanRate"
                      type="number"
                      step="0.1"
                      disabled={locked}
                      value={form.loanRatePercent}
                      onChange={(e) => setForm({ ...form, loanRatePercent: e.target.value })}
                    />
                  </div>
                </div>
                <div className="quote-field">
                  <label htmlFor="qLoanTenure">Tenure (years)</label>
                  <input
                    id="qLoanTenure"
                    type="number"
                    disabled={locked}
                    value={form.loanTenureYears}
                    onChange={(e) => setForm({ ...form, loanTenureYears: e.target.value })}
                  />
                </div>
                <p className="quote-status-msg" style={{ color: "var(--app-text-muted)" }}>
                  Self-funding: ₹
                  {Math.max(0, (computed.netInvestment || 0) - (Number(form.loanAmount) || 0)).toLocaleString(
                    "en-IN",
                  )}{" "}
                  (net investment minus loan amount)
                </p>
              </>
            )}

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

            <p className="quote-section-label">Component-wise pricing</p>
            <div className="quote-checkbox-row">
              <input
                id="qComponentsEnabled"
                type="checkbox"
                disabled={locked}
                checked={form.componentsEnabled}
                onChange={(e) => setForm({ ...form, componentsEnabled: e.target.checked })}
              />
              <label htmlFor="qComponentsEnabled">Show component-wise pricing on this quote</label>
            </div>

            {form.componentsEnabled && (
              <div className="quote-field" style={{ maxWidth: "100%" }}>
                <div className="compb-table-wrap">
                  <table className="compb-table">
                    <thead>
                      <tr>
                        <th>Particulars</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Tax %</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.components.map((row, i) => (
                        <tr key={i}>
                          <td className="compb-particular">
                            <input
                              type="text"
                              disabled={locked}
                              value={row.particular}
                              onChange={(e) => handleComponentFieldChange(i, "particular", e.target.value)}
                            />
                          </td>
                          <td className="compb-qty">
                            <input
                              type="text"
                              inputMode="decimal"
                              disabled={locked}
                              value={row.qty ?? ""}
                              onChange={(e) => handleComponentFieldChange(i, "qty", e.target.value)}
                            />
                          </td>
                          <td className="compb-price">
                            <input
                              type="text"
                              inputMode="decimal"
                              disabled={locked}
                              value={row.price ?? ""}
                              onChange={(e) => handleComponentFieldChange(i, "price", e.target.value)}
                            />
                          </td>
                          <td className="compb-tax">
                            <input
                              type="text"
                              inputMode="decimal"
                              disabled={locked}
                              value={row.tax_percent ?? ""}
                              onChange={(e) => handleComponentFieldChange(i, "tax_percent", e.target.value)}
                            />
                          </td>
                          <td className="compb-actions">
                            {!locked && (
                              <button
                                type="button"
                                className="compb-remove-btn"
                                onClick={() => handleRemoveComponentRow(i)}
                              >
                                ×
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {form.components.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan={3} style={{ textAlign: "right" }}>
                            <strong>Grand total</strong>
                          </td>
                          <td colSpan={2} style={{ textAlign: "right" }}>
                            <strong>
                              ₹
                              {form.components
                                .reduce((sum, r) => {
                                  const subtotal = (r.qty ?? 0) * (r.price ?? 0);
                                  return sum + subtotal + subtotal * ((r.tax_percent ?? 0) / 100);
                                }, 0)
                                .toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </strong>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                {!locked && (
                  <button type="button" className="quote-btn" onClick={handleAddComponentRow}>
                    + Add row
                  </button>
                )}
                <p className="quote-status-msg" style={{ marginTop: 8, color: "var(--app-text-muted)" }}>
                  Enter qty, price and tax for each line item — these are entered independently, not derived
                  from Price per Watt.
                </p>
              </div>
            )}

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
          <QuoteDocument
            quoteId={existingQuote?.quote_id ?? null}
            createdAt={existingQuote?.created_at ?? null}
            validityDays={form.validityDays ? Number(form.validityDays) : null}
            capacityKw={Number(form.capacity) || 0}
            panelMake={form.panelMake || null}
            inverterMake={form.inverterMake || null}
            panelType={form.panelType || null}
            notes={form.notes || null}
            terms={form.terms}
            components={form.componentsEnabled ? form.components : []}
            customerName={lead.name}
            customerAddress={lead.address}
            customerDiscom={getDiscomName(lead.discom)}
            customerMobile={lead.mobile}
            customerEmail={lead.email}
            segment={lead.type}
            pricePerWatt={Number(form.pricePerWatt) || 0}
            gstRate={Number(form.gstRate) || 0}
            tariff={Number(form.tariff) || 9}
            computed={computed}
            amc={
              selectedAmcPlan
                ? {
                    name: selectedAmcPlan.name,
                    ratePerKw: selectedAmcPlan.rate_per_kw != null ? Number(selectedAmcPlan.rate_per_kw) : null,
                    inclusion: selectedAmcPlan.inclusion,
                  }
                : null
            }
            amcDurationYears={form.amcDurationYears ? Number(form.amcDurationYears) : null}
            amcMode={form.amcMode}
            amcPost5={{
              enabled: form.amcPost5Enabled,
              plans: selectedPost5Plans.map((p) => ({
                name: p.name,
                ratePerKw: p.rate_per_kw != null ? Number(p.rate_per_kw) : null,
                inclusion: p.inclusion,
              })),
            }}
            loan={{
              enabled: form.loanEnabled,
              amount: form.loanAmount ? Number(form.loanAmount) : null,
              ratePercent: form.loanRatePercent ? Number(form.loanRatePercent) : null,
              tenureYears: form.loanTenureYears ? Number(form.loanTenureYears) : null,
            }}
            paymentSchedule={preferences?.payment_schedule.rows ?? DEFAULT_PAYMENT_SCHEDULE}
            branding={documentBranding}
            shareUrl={shareUrl}
          />
        </div>
      </div>
    </div>
  );
}
