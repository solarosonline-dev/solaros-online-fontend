import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { getLead, type LeadDetail } from "../../api/leads";
import { getQuote, listQuotes, type QuoteDetail } from "../../api/quotes";
import { listAmcPlans, type AmcPlan } from "../../api/amcPlans";
import { getEntity, type Entity } from "../../api/entity";
import { getEntityPreferences, DEFAULT_PAYMENT_SCHEDULE, type EntityPreferences } from "../../api/entityPreferences";
import {
  listAgreements,
  getAgreement,
  createAgreement,
  updateAgreement,
  shareAgreement,
  getAgreementPdfUrl,
  type AgreementDetail,
  type AgreementSettingsSnapshot,
} from "../../api/agreements";
import { ApiError } from "../../api/client";
import { computeQuote } from "../../lib/quoteCalculations";
import AgreementDocument from "./AgreementDocument";
import type { QuoteDocumentBranding } from "../quotes/QuoteDocument";
import { getDiscomName } from "../leads/discomOptions";
import CopyLinkButton from "../../components/CopyLinkButton";
import { useElapsedMs } from "../../hooks/useElapsedMs";
import "../quotes/QuoteBuilderPage.css";

type FormState = {
  /** Single years 1-5 plan — only used when amcMode is "included". */
  amcId: string;
  /** Years 1-5 multi-select, up to 3 — only used when amcMode is
   * "chargeable" (the customer is paying either way, so — like years
   * 6-15 — they can be offered a few tiers instead of just one). */
  amcPlanIds: string[];
  amcDurationYears: string;
  amcMode: "included" | "chargeable";
  amcPost5Enabled: boolean;
  /** Up to 3 amc_id values, in selection order. */
  amcPost5PlanIds: string[];
  terms: string[];
};

const DEFAULT_FORM: FormState = {
  amcId: "",
  amcPlanIds: [],
  amcDurationYears: "",
  amcMode: "chargeable",
  amcPost5Enabled: false,
  amcPost5PlanIds: [],
  terms: [],
};

export default function AgreementBuilderPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const { leadId } = useParams();

  // Wall-clock time spent on this page, from mount to submit — sent as
  // generation_duration_ms (create only, see handleSubmit below) to power
  // the admin "p50/p95 time to generate an agreement" metric. Safe here:
  // this page mounts fresh per route navigation to
  // /app/leads/:leadId/agreement.
  const getElapsedMs = useElapsedMs();

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [amcPlans, setAmcPlans] = useState<AmcPlan[]>([]);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [preferences, setPreferences] = useState<EntityPreferences | null>(null);
  const [existingAgreement, setExistingAgreement] = useState<AgreementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [newTerm, setNewTerm] = useState("");

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    setLoadError(null);

    Promise.all([
      getLead(entityId, Number(leadId)),
      listQuotes(entityId, Number(leadId)),
      listAmcPlans(entityId, { is_active: true }),
      listAgreements(entityId, Number(leadId)),
      getEntity(entityId),
    ])
      .then(async ([leadRes, quotesRes, amcRes, agreementsRes, entityRes]) => {
        setLead(leadRes);
        setAmcPlans(amcRes.items);
        setEntity(entityRes);

        if (quotesRes.items.length === 0) {
          setLoadError("No quote found for this lead yet — generate and accept a quote first.");
          return;
        }
        const quoteRes = await getQuote(entityId, Number(leadId), quotesRes.items[0].quote_id);
        setQuote(quoteRes);

        const prefs = await getEntityPreferences(entityId);
        setPreferences(prefs);

        if (agreementsRes.items.length > 0) {
          const agreement = await getAgreement(entityId, Number(leadId), agreementsRes.items[0].agreement_id);
          setExistingAgreement(agreement);
          setForm({
            amcId: agreement.amc_id != null ? String(agreement.amc_id) : "",
            amcPlanIds: (agreement.amc_plan_ids ?? []).map(String),
            amcDurationYears: agreement.amc_duration_years != null ? String(agreement.amc_duration_years) : "",
            amcMode: agreement.amc_mode ?? "chargeable",
            amcPost5Enabled: agreement.amc_post5_enabled ?? false,
            amcPost5PlanIds: (agreement.amc_post5_plan_ids ?? []).map(String),
            terms: agreement.terms ?? [],
          });
        } else {
          // AMC is only offered from the agreement when the quote didn't
          // already carry one (see quoteHasAmc below) — nothing to default
          // it from in that case, so it starts blank either way.
          setForm({
            ...DEFAULT_FORM,
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

  // Once a quote already carries AMC, it's already committed there — the
  // agreement doesn't let the admin pick a fresh one, it just displays what
  // the quote already agreed to (see quoteAmcPlan/quotePost5Plans below).
  const quoteHasAmc = quote?.amc_id != null;

  // Accepts either a live AmcPlan or a frozen SnapshotAmcPlan (from
  // settings_snapshot) -- both share this same shape, just typed
  // differently by their respective API modules.
  const mapAmcPlan = (p: { name: string; rate_per_kw: string | null; inclusion: AmcPlan["inclusion"] }) => ({
    name: p.name,
    ratePerKw: p.rate_per_kw != null ? Number(p.rate_per_kw) : null,
    inclusion: p.inclusion,
  });

  const quoteAmcPlan = useMemo(
    () => (quote?.amc_id != null ? (amcPlans.find((p) => p.amc_id === quote.amc_id) ?? null) : null),
    [amcPlans, quote],
  );

  const quotePost5Plans = useMemo(
    () =>
      (quote?.amc_post5_plan_ids ?? [])
        .map((id) => amcPlans.find((p) => p.amc_id === id) ?? null)
        .filter((p): p is AmcPlan => p != null),
    [amcPlans, quote],
  );

  const selectedAmcPlan = useMemo(
    () => amcPlans.find((p) => String(p.amc_id) === form.amcId) ?? null,
    [amcPlans, form.amcId],
  );

  const selectedAmcPlans = useMemo(
    () =>
      form.amcPlanIds
        .map((id) => amcPlans.find((p) => String(p.amc_id) === id) ?? null)
        .filter((p): p is AmcPlan => p != null),
    [amcPlans, form.amcPlanIds],
  );

  const selectedPost5Plans = useMemo(
    () =>
      form.amcPost5PlanIds
        .map((id) => amcPlans.find((p) => String(p.amc_id) === id) ?? null)
        .filter((p): p is AmcPlan => p != null),
    [amcPlans, form.amcPost5PlanIds],
  );

  // Once an agreement is ACCEPTED (signed), the AMC/payment-schedule
  // settings shown in the preview must be the ones frozen at signing time
  // (settings_snapshot), not whatever's currently live in the AMC
  // catalog/Entity Preferences -- otherwise this admin-side preview would
  // disagree with what the customer already reviewed/signed. Not-yet-signed
  // agreements keep the live joins above, unchanged.
  const acceptedSnapshot: AgreementSettingsSnapshot | null =
    existingAgreement?.status === "ACCEPTED" ? existingAgreement.settings_snapshot : null;

  const computed = useMemo(() => {
    if (!quote) return null;
    return computeQuote({
      capacityKw: quote.capacity ?? 0,
      pricePerWatt: quote.price_per_watt ?? 0,
      taxRate: quote.tax_rate ?? 0,
      dailyYield: quote.daily_yield ?? 4.2,
      tariff: quote.tariff ?? 9,
      applySubsidy: quote.apply_subsidy ?? false,
      subsidyAmount: quote.subsidy_amount != null ? Number(quote.subsidy_amount) : null,
      segment: lead?.type ?? null,
      amcRatePerKw: null,
      amcDurationYears: null,
    });
  }, [quote, lead]);

  const documentBranding: QuoteDocumentBranding = useMemo(
    () => ({
      entityName: entity?.name ?? "SolarOS",
      primaryColor: preferences?.branding.primary_color,
      logoUrl: preferences?.branding.logo_url,
      footerTag: preferences?.branding.footer_tag,
      gstno: entity?.gstno,
      address: entity?.address,
      businessPhone: entity?.business_phone,
      businessEmail: entity?.business_email,
      currency: entity?.currency,
      tax_label: entity?.tax_label,
      tax_id_label: entity?.tax_id_label,
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

  const locked = existingAgreement != null && existingAgreement.status !== "NEW";

  // RHS "just changed" highlight — flashes the affected preview section for
  // ~1.2s whenever its underlying LHS fields change, skipping the initial
  // mount so the preview doesn't flash on first load. Same pattern as
  // QuoteBuilderPage.
  const [highlightSections, setHighlightSections] = useState<{ amc?: boolean; terms?: boolean }>({});

  function useSectionFlash(section: "amc" | "terms", deps: unknown[]) {
    const mountedRef = useRef(false);
    useEffect(() => {
      if (!mountedRef.current) {
        mountedRef.current = true;
        return;
      }
      setHighlightSections((h) => ({ ...h, [section]: true }));
      const timer = setTimeout(() => {
        setHighlightSections((h) => ({ ...h, [section]: false }));
      }, 1200);
      return () => clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
  }

  useSectionFlash("amc", [
    form.amcId,
    form.amcPlanIds,
    form.amcDurationYears,
    form.amcMode,
    form.amcPost5Enabled,
    form.amcPost5PlanIds,
  ]);
  useSectionFlash("terms", [form.terms]);

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

  // Fetched on demand rather than eagerly (like the share link) — presigned
  // URLs expire, so there's no reason to mint one before the admin actually
  // wants to view the PDF. Opens the tab synchronously on click (before the
  // await) and only then points it at the fetched URL — some browsers'
  // popup blockers reject window.open once it's past the click's own
  // synchronous call stack.
  async function handleViewPdf() {
    if (!leadId || !existingAgreement) return;
    setPdfError(null);
    setLoadingPdf(true);
    const tab = window.open("", "_blank", "noreferrer");
    try {
      const { pdf_url } = await getAgreementPdfUrl(entityId, Number(leadId), existingAgreement.agreement_id);
      if (tab) tab.location.href = pdf_url;
    } catch (err) {
      tab?.close();
      setPdfError(err instanceof ApiError ? err.message : "Could not load the signed PDF");
    } finally {
      setLoadingPdf(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!leadId) return;
    setStatus(null);
    setSaving(true);

    const amcIncluded = form.amcMode === "included";
    const payload = {
      amc_id: !quoteHasAmc && amcIncluded && form.amcId ? Number(form.amcId) : undefined,
      amc_plan_ids: !quoteHasAmc && !amcIncluded ? form.amcPlanIds.map(Number) : undefined,
      amc_duration_years: !quoteHasAmc && form.amcDurationYears ? Number(form.amcDurationYears) : undefined,
      amc_mode: !quoteHasAmc ? form.amcMode : undefined,
      amc_post5_enabled: !quoteHasAmc ? form.amcPost5Enabled : undefined,
      amc_post5_plan_ids: !quoteHasAmc ? form.amcPost5PlanIds.map(Number) : undefined,
      terms: form.terms,
    };

    try {
      if (existingAgreement) {
        const updated = await updateAgreement(entityId, Number(leadId), existingAgreement.agreement_id, payload);
        setExistingAgreement(updated);
      } else {
        const created = await createAgreement(entityId, Number(leadId), {
          ...payload,
          generation_duration_ms: getElapsedMs(),
        });
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
      <Link to={`/app/leads/${leadId}`} className="quote-builder-back no-print">
        ← Back to lead
      </Link>

      <div className="quote-builder-header no-print">
        <div>
          <h1>
            Agreement for {lead.name}{" "}
            {existingAgreement && <span className="quote-status-badge">{existingAgreement.status}</span>}
          </h1>
          {existingAgreement && <p className="quote-builder-reference">{existingAgreement.agreement_number}</p>}
        </div>
      </div>

      <div className="quote-builder-grid">
        <div className="quote-form-panel no-print">
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
              <input type="text" disabled value={computed ? computed.netInvestment.toLocaleString("en-IN") : ""} />
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <p className="quote-section-label">AMC</p>
            {!quoteHasAmc && (
              <p className="quote-field-hint" style={{ marginTop: -8, marginBottom: 12 }}>
                Offered as a recommended add-on since this quote had no AMC.
              </p>
            )}
            {quoteHasAmc ? (
              <p className="quote-status-msg" style={{ color: "var(--app-text-muted)" }}>
                This quote already includes AMC — it carries over to the agreement as already agreed, shown in the
                preview, and isn't editable here.
              </p>
            ) : (
              <>
                <div className="quote-field-row">
                  <div className="quote-field">
                    <label htmlFor="aAmcMode">Pricing</label>
                    <select
                      id="aAmcMode"
                      disabled={locked}
                      value={form.amcMode}
                      onChange={(e) => setForm({ ...form, amcMode: e.target.value as "included" | "chargeable" })}
                    >
                      <option value="chargeable">Chargeable — customer pays</option>
                      <option value="included">Included — bundled free of cost</option>
                    </select>
                  </div>
                  <div className="quote-field">
                    <label htmlFor="aAmcDuration">Duration (years)</label>
                    <input
                      id="aAmcDuration"
                      type="number"
                      disabled={locked}
                      value={form.amcDurationYears}
                      onChange={(e) => setForm({ ...form, amcDurationYears: e.target.value })}
                    />
                  </div>
                </div>

                {form.amcMode === "included" ? (
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
                    <p className="quote-field-hint">
                      Bundled free of cost — a single plan, since it's a freebie.
                    </p>
                  </div>
                ) : (
                  <div className="quote-field">
                    <label>Select up to 3 plans from the AMC catalog</label>
                    <div className="quote-checkbox-list">
                      {amcPlans.map((p) => {
                        const idStr = String(p.amc_id);
                        const checked = form.amcPlanIds.includes(idStr);
                        const atLimit = form.amcPlanIds.length >= 3;
                        return (
                          <div
                            className={`quote-checkbox-row${!checked && atLimit ? " quote-checkbox-row--disabled" : ""}`}
                            key={p.amc_id}
                          >
                            <input
                              id={`aAmcPlan-${p.amc_id}`}
                              type="checkbox"
                              disabled={locked || (!checked && atLimit)}
                              checked={checked}
                              onChange={(e) => {
                                const amcPlanIds = e.target.checked
                                  ? [...form.amcPlanIds, idStr]
                                  : form.amcPlanIds.filter((id) => id !== idStr);
                                setForm({
                                  ...form,
                                  amcPlanIds,
                                  amcDurationYears: amcPlanIds.length && !form.amcDurationYears ? "1" : form.amcDurationYears,
                                });
                              }}
                            />
                            <label htmlFor={`aAmcPlan-${p.amc_id}`}>{p.name}</label>
                          </div>
                        );
                      })}
                    </div>
                    <p
                      className={`quote-field-hint${form.amcPlanIds.length >= 3 ? " quote-field-hint--warning" : ""}`}
                    >
                      {form.amcPlanIds.length}/3 selected
                      {form.amcPlanIds.length >= 3 ? " — maximum reached" : ""} — the customer sees these as options
                      to choose between, since they're paying either way.
                    </p>
                  </div>
                )}

                <p className="quote-section-label">AMC — years 6-15 (next 10 years)</p>
                <div className="quote-checkbox-row">
                  <input
                    id="aAmcPost5Enabled"
                    type="checkbox"
                    disabled={locked}
                    checked={form.amcPost5Enabled}
                    onChange={(e) => setForm({ ...form, amcPost5Enabled: e.target.checked })}
                  />
                  <label htmlFor="aAmcPost5Enabled">Offer AMC plans for years 6-15</label>
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
                          <div
                            className={`quote-checkbox-row${!checked && atLimit ? " quote-checkbox-row--disabled" : ""}`}
                            key={p.amc_id}
                          >
                            <input
                              id={`aAmcPost5Plan-${p.amc_id}`}
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
                            <label htmlFor={`aAmcPost5Plan-${p.amc_id}`}>{p.name}</label>
                          </div>
                        );
                      })}
                    </div>
                    <p
                      className={`quote-field-hint${
                        form.amcPost5PlanIds.length >= 3 ? " quote-field-hint--warning" : ""
                      }`}
                    >
                      {form.amcPost5PlanIds.length}/3 selected
                      {form.amcPost5PlanIds.length >= 3 ? " — maximum reached" : ""} — these render as columns
                      alongside the years 1-5 AMC on the agreement.
                    </p>
                  </div>
                )}
              </>
            )}

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
                <>
                  <a className="quote-share-box-link" href={shareUrl} target="_blank" rel="noreferrer">
                    {shareUrl}
                  </a>
                  <CopyLinkButton url={shareUrl} />
                </>
              ) : (
                "Could not load share link."
              )}
            </div>
          )}

          {existingAgreement?.pdf_key && (
            <div style={{ marginTop: 12 }}>
              <button type="button" className="quote-btn" onClick={handleViewPdf} disabled={loadingPdf}>
                {loadingPdf ? "Loading…" : "📄 View signed PDF"}
              </button>
              {pdfError && (
                <p className="quote-status-msg error" style={{ marginTop: 6 }}>
                  {pdfError}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="quote-preview-panel">
          {!computed || !quote ? (
            <p className="quote-status-msg">No quote data available.</p>
          ) : (
            <AgreementDocument
              agreementNumber={existingAgreement?.agreement_number ?? null}
              createdAt={existingAgreement?.created_at ?? null}
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
              amcFromQuote={quoteHasAmc}
              amc={
                acceptedSnapshot
                  ? acceptedSnapshot.amc
                    ? mapAmcPlan(acceptedSnapshot.amc)
                    : null
                  : quoteHasAmc
                    ? quoteAmcPlan
                      ? mapAmcPlan(quoteAmcPlan)
                      : null
                    : selectedAmcPlan
                      ? mapAmcPlan(selectedAmcPlan)
                      : null
              }
              amcPlans={
                acceptedSnapshot
                  ? acceptedSnapshot.amc_plans.map(mapAmcPlan)
                  : quoteHasAmc
                    ? []
                    : selectedAmcPlans.map(mapAmcPlan)
              }
              amcDurationYears={
                quoteHasAmc ? (quote.amc_duration_years ?? null) : form.amcDurationYears ? Number(form.amcDurationYears) : null
              }
              amcMode={quoteHasAmc ? (quote.amc_mode ?? "chargeable") : form.amcMode}
              amcPost5={{
                enabled: quoteHasAmc ? (quote.amc_post5_enabled ?? false) : form.amcPost5Enabled,
                plans: (acceptedSnapshot ? acceptedSnapshot.amc_post5_plans : quoteHasAmc ? quotePost5Plans : selectedPost5Plans).map(
                  mapAmcPlan,
                ),
              }}
              paymentSchedule={acceptedSnapshot?.payment_schedule ?? preferences?.payment_schedule.rows ?? DEFAULT_PAYMENT_SCHEDULE}
              terms={form.terms}
              branding={documentBranding}
              shareUrl={shareUrl}
              signature={{
                signed: existingAgreement?.status === "ACCEPTED",
                signerName: existingAgreement?.signer_name,
                signatureImage: existingAgreement?.signature_image,
                signedAt: existingAgreement?.signed_at,
                signedIp: existingAgreement?.signed_ip,
              }}
              highlightSections={highlightSections}
            />
          )}
        </div>
      </div>
    </div>
  );
}
