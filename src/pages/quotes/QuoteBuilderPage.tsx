import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { useTour } from "../../lib/TourContext";
import { getLead, type LeadDetail } from "../../api/leads";
import { listAmcPlans, formatAmcInclusion, type AmcPlan } from "../../api/amcPlans";
import { getEntityPreferences, DEFAULT_PAYMENT_SCHEDULE, type EntityPreferences } from "../../api/entityPreferences";
import { getEntity, type Entity } from "../../api/entity";
import {
  listQuotes,
  getQuote,
  createQuote,
  updateQuote,
  type QuoteDetail,
  type QuoteComponentRow,
} from "../../api/quotes";
import { ApiError } from "../../api/client";
import { computeQuote, subsidyForKw } from "../../lib/quoteCalculations";
import QuoteDocument, { type QuoteDocumentBranding } from "./QuoteDocument";
import { getDiscomName } from "../leads/discomOptions";
import LeadSiteImages from "../leads/LeadSiteImages";
import { listLeadSiteImages, type LeadSiteImage } from "../../api/leadSiteImages";
import CopyLinkButton from "../../components/CopyLinkButton";
import AccordionSection from "../../components/AccordionSection";
import DraftRestoredBanner from "../../components/DraftRestoredBanner";
import { useElapsedMs } from "../../hooks/useElapsedMs";
import { useDraftAutosave } from "../../hooks/useDraftAutosave";
import { draftKeys, readDraft, clearDraft } from "../../lib/drafts";
import "./QuoteBuilderPage.css";

const PANEL_TYPES = ["DCR", "Non-DCR"];

/** LHS form sections, in display order — collapsed into a single-open-at-a-
 * time accordion so a long form doesn't require endless scrolling to find a
 * field. Distinct from the RHS preview's `highlightSections` keys (pricing/
 * metrics/amc/loan/components), which flash whichever *preview* block just
 * changed rather than track which *form* section is expanded. */
type SectionKey =
  | "system"
  | "pricing"
  | "amc"
  | "amcPost5"
  | "loan"
  | "details"
  | "terms"
  | "components"
  | "siteImages";

// AccordionSection itself lives in src/components/AccordionSection.tsx --
// shared with AgreementBuilderPage.tsx.

// Placeholder row labels seeded by entity_preferences.py's DEFAULT_PREFERENCES —
// treated as "not yet filled in" so brand-new quotes fall back to the generic
// marketing copy in quoteDocumentCopy.ts instead of showing the literal
// placeholder text until a sales rep renames the row.
const PLACEHOLDER_PARTICULARS = ["panel make/model", "inverter make/model"];

/** Panel make / Inverter make are no longer separate quote fields — they're
 * read from the matching Default components row's particular text (edited
 * in the component-wise pricing table below), same way warranty/specification
 * are already keyword-matched off `components` in QuoteDocument.tsx. */
function findComponentParticular(components: QuoteComponentRow[], keywords: string[]): string {
  const row = components.find((r) => {
    const particular = (r.particular ?? "").toLowerCase();
    return keywords.some((k) => particular.includes(k));
  });
  const particular = row?.particular?.trim() ?? "";
  if (!particular || PLACEHOLDER_PARTICULARS.includes(particular.toLowerCase())) return "";
  return particular;
}

type FormState = {
  capacity: string;
  panelType: string;
  validityDays: string;
  pricePerWatt: string;
  taxRate: string;
  dailyYield: string;
  tariff: string;
  applySubsidy: boolean;
  subsidyAmount: string;
  amcId: string;
  amcDurationYears: string;
  amcMode: "included" | "chargeable";
  /** Up to 3 amc_id values, in selection order. Years 6-15 AMC is considered
   * "on" for this quote whenever at least one plan is selected here — there
   * is no separate enable checkbox. */
  amcPost5PlanIds: string[];
  loanAmount: string;
  loanRatePercent: string;
  loanTenureYears: string;
  notes: string;
  terms: string[];
  components: QuoteComponentRow[];
  componentsEnabled: boolean;
  componentsPricingEnabled: boolean;
};

const DEFAULT_FORM: FormState = {
  capacity: "5",
  panelType: "DCR",
  validityDays: "15",
  pricePerWatt: "50",
  taxRate: "8.9",
  dailyYield: "4.2",
  tariff: "9",
  applySubsidy: true,
  subsidyAmount: "",
  amcId: "",
  amcDurationYears: "",
  amcMode: "chargeable",
  amcPost5PlanIds: [],
  loanAmount: "",
  loanRatePercent: "",
  loanTenureYears: "",
  notes: "",
  terms: [],
  components: [],
  componentsEnabled: false,
  componentsPricingEnabled: true,
};

export default function QuoteBuilderPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const { leadId } = useParams();
  const { setNeedsAmcSetup } = useTour();

  // Wall-clock time spent on this page, from mount to submit — sent as
  // generation_duration_ms (create only, see handleSubmit below) to power
  // the admin "p50/p95 time to generate a quote" metric. Safe here: this
  // page mounts fresh per route navigation to /app/leads/:leadId/quote.
  const getElapsedMs = useElapsedMs();

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [amcPlans, setAmcPlans] = useState<AmcPlan[]>([]);
  const [existingQuote, setExistingQuote] = useState<QuoteDetail | null>(null);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [preferences, setPreferences] = useState<EntityPreferences | null>(null);
  const [siteImages, setSiteImages] = useState<LeadSiteImage[]>([]);
  const [siteImagesLoading, setSiteImagesLoading] = useState(true);
  const [siteImagesLoadError, setSiteImagesLoadError] = useState<string | null>(null);
  // In-progress (not yet saved) site-image order/selection, so the preview
  // updates as the admin drags/adds/removes -- null means "no unsaved
  // edits, use siteImages as-is". Reset to null whenever the site-images
  // accordion section closes, since LeadSiteImages unmounts then and
  // discards any unsaved staging along with it.
  const [siteImagesPreview, setSiteImagesPreview] = useState<
    { imageId: number; url: string; fileName: string }[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [newTerm, setNewTerm] = useState("");
  const [subsidyTouched, setSubsidyTouched] = useState(false);
  const [loanAmountTouched, setLoanAmountTouched] = useState(false);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  // Snapshot of `form` as of the last successful save -- compared against
  // the live form (see isDirtySinceSave below) so Save can flip to a
  // disabled "Saved" and back without wiring an onChange handler onto
  // every one of this form's many fields individually.
  const [savedSnapshot, setSavedSnapshot] = useState<FormState | null>(null);
  const [draftRestoredAt, setDraftRestoredAt] = useState<number | null>(null);
  // The form value as fetched/defaulted, before any local draft was applied
  // on top of it -- lets "Reset" on the draft-restored banner discard the
  // draft and fall back to this instead of re-fetching.
  const fetchedFormRef = useRef<FormState | null>(null);

  // Nudge the "Entity Settings" nav link (see AppLayout.tsx/TourContext.tsx)
  // once we know the entity has zero AMC plans defined -- an admin building a
  // quote needs to know where to go set one up rather than discovering the
  // AMC dropdown is empty with no explanation. Cleared on unmount (leaving
  // this page, or re-running once amcPlans changes) so the highlight never
  // outlives the condition it was reporting.
  useEffect(() => {
    if (loading) return;
    setNeedsAmcSetup(amcPlans.every((p) => !p.is_active));
    return () => setNeedsAmcSetup(false);
  }, [loading, amcPlans, setNeedsAmcSetup]);

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    setLoadError(null);
    setSavedSnapshot(null);
    setDraftRestoredAt(null);

    Promise.all([
      getLead(entityId, Number(leadId)),
      listAmcPlans(entityId, {}),
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
          const fetchedForm: FormState = {
            capacity: quote.capacity != null ? String(quote.capacity) : "",
            panelType: quote.panel_type ?? "DCR",
            validityDays: quote.validity_days != null ? String(quote.validity_days) : "15",
            pricePerWatt: quote.price_per_watt != null ? String(quote.price_per_watt) : "",
            taxRate:
              quote.tax_rate != null
                ? String(quote.tax_rate)
                : String(prefsRes.pricing.default_tax_rate ?? DEFAULT_FORM.taxRate),
            dailyYield: quote.daily_yield != null ? String(quote.daily_yield) : "4.2",
            tariff: quote.tariff != null ? String(quote.tariff) : "9",
            applySubsidy: quote.apply_subsidy ?? true,
            subsidyAmount: quote.subsidy_amount ?? "",
            amcId: quote.amc_id != null ? String(quote.amc_id) : "",
            amcDurationYears: quote.amc_duration_years != null ? String(quote.amc_duration_years) : "",
            amcMode: quote.amc_mode ?? "chargeable",
            amcPost5PlanIds: (quote.amc_post5_plan_ids ?? []).map(String),
            loanAmount: quote.loan_amount ?? "",
            loanRatePercent: quote.loan_rate_percent ?? "",
            loanTenureYears: quote.loan_tenure_years != null ? String(quote.loan_tenure_years) : "",
            notes: quote.notes ?? "",
            terms: quote.terms ?? [],
            components: quote.components ?? [],
            componentsEnabled: quote.components_enabled ?? false,
            componentsPricingEnabled: quote.components_pricing_enabled ?? true,
          };
          fetchedFormRef.current = fetchedForm;
          // Only offer a draft restore while the quote is still editable --
          // a locked (non-GENERATED) quote can't be autosaved into either,
          // so any leftover draft for it is moot.
          const stored =
            quote.status === "GENERATED" ? readDraft<FormState>(draftKeys.quoteEdit(quote.quote_id)) : null;
          if (stored) {
            setForm(stored.data);
            setDraftRestoredAt(stored.timestamp);
          } else {
            setForm(fetchedForm);
          }
          setSubsidyTouched(true);
          // A saved quote already has an explicit (or explicitly blank)
          // loan_amount -- treat it as touched so the total-cost auto-default
          // effect below doesn't clobber it on load.
          setLoanAmountTouched(true);
        } else {
          const capacity = leadRes.sanctioned_load != null ? leadRes.sanctioned_load : Number(DEFAULT_FORM.capacity);
          const fetchedForm: FormState = {
            ...DEFAULT_FORM,
            capacity: String(capacity),
            pricePerWatt: String(prefsRes.pricing.default_price_per_watt ?? DEFAULT_FORM.pricePerWatt),
            taxRate: String(prefsRes.pricing.default_tax_rate ?? DEFAULT_FORM.taxRate),
            subsidyAmount: String(subsidyForKw(capacity, leadRes.type)),
            // Quote notes are folded into terms (not kept as separate free text) so they're
            // individually addable/removable the same way as the rest of the terms list.
            terms: [...prefsRes.document_customization.quote_notes],
            components: prefsRes.components.items.map((item) => ({
              particular: item.particular,
              qty: null,
              price: null,
              tax_percent: item.tax_percent,
              warranty_years: item.warranty_years,
              specification: item.specification,
            })),
            componentsEnabled: false,
            componentsPricingEnabled: true,
          };
          fetchedFormRef.current = fetchedForm;
          const stored = readDraft<FormState>(draftKeys.quoteNew(leadId));
          if (stored) {
            setForm(stored.data);
            setDraftRestoredAt(stored.timestamp);
          } else {
            setForm(fetchedForm);
          }
          setSubsidyTouched(false);
          setLoanAmountTouched(false);
        }
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [entityId, leadId]);

  // Fetched independently of the main load above (and of which accordion
  // section happens to be open) -- the live preview needs these regardless,
  // see LeadSiteImages.tsx's comment on why it's a fully controlled
  // component rather than fetching its own data on mount.
  useEffect(() => {
    if (!leadId) return;
    setSiteImagesLoading(true);
    setSiteImagesLoadError(null);
    listLeadSiteImages(entityId, Number(leadId))
      .then((res) => setSiteImages(res.items))
      .catch((err) => setSiteImagesLoadError(err instanceof ApiError ? err.message : "Failed to load site design images"))
      .finally(() => setSiteImagesLoading(false));
  }, [entityId, leadId]);

  const derivedPanelMake = useMemo(() => findComponentParticular(form.components, ["panel"]), [form.components]);
  const derivedInverterMake = useMemo(
    () => findComponentParticular(form.components, ["inverter"]),
    [form.components],
  );

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

  // `amcPlans` includes deactivated plans so an already-selected one (e.g. on
  // a saved quote) still resolves above instead of silently disappearing --
  // see selectedAmcPlan/selectedPost5Plans. But the pickers below shouldn't
  // let anyone select a *new* deactivated plan, so they list only active
  // plans plus whichever ones are already selected on this quote (so the
  // current selection still shows up as a labeled option instead of going
  // blank).
  const amcYear1to5Options = useMemo(
    () => amcPlans.filter((p) => p.is_active || String(p.amc_id) === form.amcId),
    [amcPlans, form.amcId],
  );
  const amcPost5Options = useMemo(
    () => amcPlans.filter((p) => p.is_active || form.amcPost5PlanIds.includes(String(p.amc_id))),
    [amcPlans, form.amcPost5PlanIds],
  );

  // Once a quote is ACCEPTED, the AMC/payment-schedule settings shown in the
  // preview must be the ones frozen at acceptance time (settings_snapshot),
  // not whatever's currently live in the AMC catalog/Entity Preferences --
  // otherwise this admin-side preview would disagree with what the customer
  // already reviewed/signed. Not-yet-accepted quotes keep the live join
  // above (selectedAmcPlan/selectedPost5Plans), unchanged.
  const acceptedSnapshot = existingQuote?.status === "ACCEPTED" ? existingQuote.settings_snapshot : null;

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

  // Keep the suggested subsidy amount in sync with capacity/segment until the
  // admin explicitly edits it — matches the preview, which falls back to the
  // same ladder when the field is left blank.
  useEffect(() => {
    if (subsidyTouched || !lead) return;
    const suggested = subsidyForKw(Number(form.capacity) || 0, lead.type);
    setForm((f) => (f.subsidyAmount === String(suggested) ? f : { ...f, subsidyAmount: String(suggested) }));
  }, [form.capacity, lead, subsidyTouched]);

  // RHS "just changed" highlight — flashes the affected preview section for
  // ~1.2s whenever its underlying LHS fields change, skipping the initial
  // mount so the preview doesn't flash on first load.
  const [highlightSections, setHighlightSections] = useState<{
    pricing?: boolean;
    metrics?: boolean;
    amc?: boolean;
    loan?: boolean;
    components?: boolean;
    siteImages?: boolean;
  }>({});

  // Single-open-at-a-time accordion for the LHS form — see AccordionSection.
  // Defaults to the first section so the form isn't fully collapsed on load.
  const [openSection, setOpenSection] = useState<SectionKey | null>("system");
  function toggleSection(id: SectionKey) {
    setOpenSection((cur) => (cur === id ? null : id));
  }

  useEffect(() => {
    if (openSection !== "siteImages") setSiteImagesPreview(null);
  }, [openSection]);

  function useSectionFlash(
    section: "pricing" | "metrics" | "amc" | "loan" | "components" | "siteImages",
    deps: unknown[],
  ) {
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

  useSectionFlash("pricing", [
    form.capacity,
    form.pricePerWatt,
    form.taxRate,
    form.tariff,
    form.dailyYield,
    form.applySubsidy,
    form.subsidyAmount,
  ]);
  useSectionFlash("metrics", [
    form.capacity,
    form.pricePerWatt,
    form.taxRate,
    form.tariff,
    form.dailyYield,
    form.applySubsidy,
    form.subsidyAmount,
  ]);
  useSectionFlash("amc", [
    form.amcId,
    form.amcMode,
    form.amcDurationYears,
    form.amcPost5PlanIds,
  ]);
  useSectionFlash("loan", [form.loanAmount, form.loanRatePercent, form.loanTenureYears]);
  useSectionFlash("components", [form.components, form.componentsEnabled, form.componentsPricingEnabled]);
  // Depends on siteImagesPreview too (not just the persisted siteImages) so
  // dragging to reorder -- which only updates the live preview, not
  // siteImages, until Save -- still flashes/scrolls the right-hand preview.
  useSectionFlash("siteImages", [siteImages, siteImagesPreview]);

  // No standalone enable checkboxes for these two sections — years 6-15 AMC
  // is "on" once at least one plan is picked, and loan financing is "on"
  // once every required field (amount/rate/tenure) has a value, so the RHS
  // preview appears as soon as the admin finishes filling the section in.
  const amcPost5Enabled = form.amcPost5PlanIds.length > 0;
  const loanEnabled = Boolean(form.loanAmount) && Boolean(form.loanRatePercent) && Boolean(form.loanTenureYears);

  const computed = useMemo(() => {
    return computeQuote({
      capacityKw: Number(form.capacity) || 0,
      pricePerWatt: Number(form.pricePerWatt) || 0,
      taxRate: Number(form.taxRate) || 0,
      dailyYield: Number(form.dailyYield) || 4.2,
      tariff: Number(form.tariff) || 9,
      applySubsidy: form.applySubsidy,
      subsidyAmount: form.subsidyAmount ? Number(form.subsidyAmount) : null,
      segment: lead?.type ?? null,
      amcRatePerKw: selectedAmcPlan?.rate_per_kw != null ? Number(selectedAmcPlan.rate_per_kw) : null,
      amcDurationYears: form.amcDurationYears ? Number(form.amcDurationYears) : null,
    });
  }, [form, lead, selectedAmcPlan]);

  // Keep the loan amount defaulted to the quote's total cost until the admin
  // explicitly edits it -- same "suggested until touched" pattern as the
  // subsidy amount above.
  useEffect(() => {
    if (loanAmountTouched) return;
    const suggested = computed.totalCost || 0;
    setForm((f) => (f.loanAmount === String(suggested) ? f : { ...f, loanAmount: String(suggested) }));
  }, [computed.totalCost, loanAmountTouched]);

  const locked = existingQuote != null && existingQuote.status !== "GENERATED";
  const isDirtySinceSave = savedSnapshot != null && JSON.stringify(form) !== JSON.stringify(savedSnapshot);
  const showSaved = savedSnapshot != null && !isDirtySinceSave;

  const draftKey = leadId
    ? existingQuote
      ? draftKeys.quoteEdit(existingQuote.quote_id)
      : draftKeys.quoteNew(leadId)
    : null;
  // Only autosave once `form` has actually diverged from what was
  // fetched/defaulted -- otherwise merely opening this page would seed an
  // unchanged draft that gets spuriously "restored" on the next visit, with
  // nothing the user actually needs to recover.
  const isDirtySinceLoad =
    fetchedFormRef.current != null && JSON.stringify(form) !== JSON.stringify(fetchedFormRef.current);
  useDraftAutosave(draftKey, form, !loading && !locked && isDirtySinceLoad);

  function handleResetDraft() {
    if (draftKey) clearDraft(draftKey);
    setDraftRestoredAt(null);
    if (fetchedFormRef.current) setForm(fetchedFormRef.current);
  }

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
      components: [
        ...form.components,
        { particular: "", qty: null, price: null, tax_percent: 18, warranty_years: null, specification: null },
      ],
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
      panel_make: derivedPanelMake || undefined,
      inverter_make: derivedInverterMake || undefined,
      panel_type: form.panelType || undefined,
      validity_days: form.validityDays ? Number(form.validityDays) : undefined,
      price_per_watt: form.pricePerWatt ? Number(form.pricePerWatt) : undefined,
      tax_rate: form.taxRate ? Number(form.taxRate) : undefined,
      daily_yield: form.dailyYield ? Number(form.dailyYield) : undefined,
      tariff: form.tariff ? Number(form.tariff) : undefined,
      apply_subsidy: form.applySubsidy,
      subsidy_amount: form.subsidyAmount ? Number(form.subsidyAmount) : undefined,
      amc_id: form.amcId ? Number(form.amcId) : undefined,
      amc_duration_years: form.amcDurationYears ? Number(form.amcDurationYears) : undefined,
      amc_mode: form.amcId ? form.amcMode : undefined,
      amc_post5_enabled: amcPost5Enabled,
      amc_post5_plan_ids: form.amcPost5PlanIds.map(Number),
      loan_enabled: loanEnabled,
      loan_amount: form.loanAmount ? Number(form.loanAmount) : undefined,
      loan_rate_percent: form.loanRatePercent ? Number(form.loanRatePercent) : undefined,
      loan_tenure_years: form.loanTenureYears ? Number(form.loanTenureYears) : undefined,
      self_funding_amount: form.loanAmount
        ? Math.max(0, computed.totalCost - Number(form.loanAmount))
        : undefined,
      notes: form.notes.trim() || undefined,
      terms: form.terms,
      components: form.components,
      components_enabled: form.componentsEnabled,
      components_pricing_enabled: form.componentsPricingEnabled,
    };

    // Captured before the API call, since existingQuote (and therefore
    // draftKey) flips from the "new" key to the "edit" key once this save
    // succeeds -- the draft that needs clearing is the one under the key
    // that was active while the user was typing, not the new one.
    const keyBeforeSave = draftKey;

    try {
      if (existingQuote) {
        const updated = await updateQuote(entityId, Number(leadId), existingQuote.quote_id, payload);
        setExistingQuote(updated);
      } else {
        const created = await createQuote(entityId, Number(leadId), {
          ...payload,
          generation_duration_ms: getElapsedMs(),
        });
        const full = await getQuote(entityId, Number(leadId), created.quote_id);
        setExistingQuote(full);
      }
      setSavedSnapshot(form);
      fetchedFormRef.current = form;
      if (keyBeforeSave) clearDraft(keyBeforeSave);
      setDraftRestoredAt(null);
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
            Quote for {lead.name}{" "}
            {existingQuote && <span className="quote-status-badge">{existingQuote.status}</span>}
          </h1>
          {existingQuote && <p className="quote-builder-reference">{existingQuote.quote_number}</p>}
        </div>
      </div>

      {draftRestoredAt != null && (
        <DraftRestoredBanner restoredAt={draftRestoredAt} onReset={handleResetDraft} />
      )}

      {!loading && amcPlans.every((p) => !p.is_active) && (
        <p className="quote-builder-alert no-print">
          No active AMC plans are defined for this entity yet.{" "}
          <Link to="/app/entity?tab=amc&tour=1">Add one in Entity Settings</Link> before including AMC in this quote.
        </p>
      )}

      <div className="quote-builder-grid">
        <div className="quote-form-panel no-print">
          <form onSubmit={handleSubmit} noValidate>
            <AccordionSection id="system" title="System" open={openSection === "system"} onToggle={toggleSection}>
            <div className="quote-field-row">
              <div className="quote-field">
                <label htmlFor="qCapacity">Capacity (kW)</label>
                <input
                  id="qCapacity"
                  type="number"
                  step="0.1"
                  min={0}
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
            <p className="quote-status-msg" style={{ marginTop: -6, marginBottom: 12, color: "var(--app-text-muted)" }}>
              Panel make &amp; Inverter make now come from the Default components table below — rename the
              "Panel make/model" / "Inverter make/model" rows' Particulars to set them for this quote.
            </p>

            <div className="quote-field">
              <label htmlFor="qDailyYield">Daily yield (kWh/kW/day)</label>
              <input
                id="qDailyYield"
                type="number"
                step="0.1"
                min={0}
                disabled={locked}
                value={form.dailyYield}
                onChange={(e) => setForm({ ...form, dailyYield: e.target.value })}
              />
            </div>
            </AccordionSection>

            <AccordionSection id="pricing" title="Pricing" open={openSection === "pricing"} onToggle={toggleSection}>
            <div className="quote-field-row quote-field-row--3">
              <div className="quote-field">
                <label htmlFor="qPricePerWatt">Price per watt (₹)</label>
                <input
                  id="qPricePerWatt"
                  type="number"
                  step="0.5"
                  min={0}
                  disabled={locked}
                  value={form.pricePerWatt}
                  onChange={(e) => setForm({ ...form, pricePerWatt: e.target.value })}
                />
              </div>
              <div className="quote-field">
                <label htmlFor="qGstRate">{entity?.tax_label ?? "GST"} rate (%)</label>
                <input
                  id="qGstRate"
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  disabled={locked}
                  value={form.taxRate}
                  onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                />
              </div>
              <div className="quote-field">
                <label htmlFor="qTariff">Grid tariff (₹/unit)</label>
                <input
                  id="qTariff"
                  type="number"
                  step="0.1"
                  min={0}
                  disabled={locked}
                  value={form.tariff}
                  onChange={(e) => setForm({ ...form, tariff: e.target.value })}
                />
              </div>
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
                  min={0}
                  disabled={locked}
                  value={form.subsidyAmount}
                  onChange={(e) => {
                    setSubsidyTouched(true);
                    setForm({ ...form, subsidyAmount: e.target.value });
                  }}
                />
              </div>
            )}
            </AccordionSection>

            <AccordionSection id="amc" title="AMC" open={openSection === "amc"} onToggle={toggleSection}>
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
                  {amcYear1to5Options.map((p) => (
                    <option key={p.amc_id} value={p.amc_id}>
                      {p.name}
                      {!p.is_active ? " (Deactivated)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="quote-field">
                <label htmlFor="qAmcDuration">Duration (years)</label>
                <input
                  id="qAmcDuration"
                  type="number"
                  min={0}
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
            </AccordionSection>

            <AccordionSection
              id="amcPost5"
              title="AMC — years 6-15 (next 10 years)"
              open={openSection === "amcPost5"}
              onToggle={toggleSection}
            >
            <div className="quote-field">
              <label>Select up to 3 plans from the AMC catalog</label>
              <div className="quote-checkbox-list">
                {amcPost5Options.map((p) => {
                  const idStr = String(p.amc_id);
                  const checked = form.amcPost5PlanIds.includes(idStr);
                  const atLimit = form.amcPost5PlanIds.length >= 3;
                  return (
                    <div
                      className={`quote-checkbox-row${!checked && atLimit ? " quote-checkbox-row--disabled" : ""}`}
                      key={p.amc_id}
                    >
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
                      <label htmlFor={`qAmcPost5Plan-${p.amc_id}`}>
                        {p.name}
                        {!p.is_active ? " (Deactivated)" : ""}
                      </label>
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
                {form.amcPost5PlanIds.length >= 3 ? " — maximum reached" : ""} — these render as columns alongside
                the years 1-5 AMC on the quote. Selecting a plan here automatically shows this section on the quote.
              </p>
            </div>
            </AccordionSection>

            <AccordionSection id="loan" title="Loan financing" open={openSection === "loan"} onToggle={toggleSection}>
            <p className="quote-field-hint">
              Fill in all three fields below to show loan financing on this quote — there's no separate toggle.
            </p>
            <div className="quote-field-row quote-field-row--3">
              <div className="quote-field">
                <label htmlFor="qLoanAmount">Loan amount (₹)</label>
                <input
                  id="qLoanAmount"
                  type="number"
                  min={0}
                  disabled={locked}
                  value={form.loanAmount}
                  onChange={(e) => {
                    setLoanAmountTouched(true);
                    setForm({ ...form, loanAmount: e.target.value });
                  }}
                />
              </div>
              <div className="quote-field">
                <label htmlFor="qLoanRate">Interest rate (% p.a.)</label>
                <input
                  id="qLoanRate"
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  disabled={locked}
                  value={form.loanRatePercent}
                  onChange={(e) => setForm({ ...form, loanRatePercent: e.target.value })}
                />
              </div>
              <div className="quote-field">
                <label htmlFor="qLoanTenure">Tenure (years)</label>
                <input
                  id="qLoanTenure"
                  type="number"
                  min={0}
                  disabled={locked}
                  value={form.loanTenureYears}
                  onChange={(e) => setForm({ ...form, loanTenureYears: e.target.value })}
                />
              </div>
            </div>
            {loanEnabled && (
              <p className="quote-status-msg" style={{ color: "var(--app-text-muted)" }}>
                Self-funding: ₹
                {Math.max(0, (computed.totalCost || 0) - (Number(form.loanAmount) || 0)).toLocaleString(
                  "en-IN",
                )}{" "}
                (total cost minus loan amount)
              </p>
            )}
            </AccordionSection>

            <AccordionSection id="details" title="Quote validity & notes" open={openSection === "details"} onToggle={toggleSection}>
            <div className="quote-field">
              <label htmlFor="qValidityDays">Validity (days)</label>
              <input
                id="qValidityDays"
                type="number"
                min={0}
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
            </AccordionSection>

            <AccordionSection id="terms" title="Terms & conditions" open={openSection === "terms"} onToggle={toggleSection}>
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
            </AccordionSection>

            <AccordionSection
              id="components"
              title="Component-wise pricing"
              open={openSection === "components"}
              onToggle={toggleSection}
            >
            <div className="quote-checkbox-row">
              <input
                id="qComponentsEnabled"
                type="checkbox"
                disabled={locked}
                checked={form.componentsEnabled}
                onChange={(e) => setForm({ ...form, componentsEnabled: e.target.checked })}
              />
              <label htmlFor="qComponentsEnabled">Show component-wise details</label>
            </div>
            <div className="quote-checkbox-row">
              <input
                id="qComponentsPricingEnabled"
                type="checkbox"
                disabled={locked || !form.componentsEnabled}
                checked={form.componentsPricingEnabled}
                onChange={(e) => setForm({ ...form, componentsPricingEnabled: e.target.checked })}
              />
              <label htmlFor="qComponentsPricingEnabled">Enable pricing</label>
            </div>
            <p className="quote-field-hint">
              With pricing off, the quote shows only particulars and warranty — Qty, Price, Tax, and Total stay hidden.
            </p>

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
                        <th>Warranty (yrs)</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.components.map((row, i) => (
                        <tr key={i}>
                          {/* data-label feeds the mobile ::before rule in QuoteBuilderPage.css --
                              on narrow screens this row reflows into a 2-line card (particulars +
                              qty on top, price/tax/warranty below) instead of a horizontally
                              scrolling table, and the <thead> labels above are hidden then, so
                              each field needs its own inline label to stay identifiable. */}
                          <td className="compb-particular" data-label="Particulars">
                            <input
                              type="text"
                              disabled={locked}
                              value={row.particular}
                              onChange={(e) => handleComponentFieldChange(i, "particular", e.target.value)}
                            />
                          </td>
                          <td className="compb-qty" data-label="Qty">
                            <input
                              type="number"
                              min={0}
                              disabled={locked}
                              value={row.qty ?? ""}
                              onChange={(e) => handleComponentFieldChange(i, "qty", e.target.value)}
                            />
                          </td>
                          <td className="compb-price" data-label="Price">
                            <input
                              type="number"
                              min={0}
                              disabled={locked}
                              value={row.price ?? ""}
                              onChange={(e) => handleComponentFieldChange(i, "price", e.target.value)}
                            />
                          </td>
                          <td className="compb-tax" data-label="Tax %">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              disabled={locked}
                              value={row.tax_percent ?? ""}
                              onChange={(e) => handleComponentFieldChange(i, "tax_percent", e.target.value)}
                            />
                          </td>
                          <td className="compb-num" data-label="Warranty">
                            <input
                              type="number"
                              min={0}
                              disabled={locked}
                              value={row.warranty_years ?? ""}
                              onChange={(e) => handleComponentFieldChange(i, "warranty_years", e.target.value)}
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
                          <td colSpan={3} style={{ textAlign: "right" }}>
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
            </AccordionSection>

            <AccordionSection
              id="siteImages"
              title="Site design images"
              open={openSection === "siteImages"}
              onToggle={toggleSection}
            >
              {leadId && (
                <LeadSiteImages
                  entityId={entityId}
                  leadId={Number(leadId)}
                  images={siteImages}
                  loading={siteImagesLoading}
                  loadError={siteImagesLoadError}
                  onImagesChange={setSiteImages}
                  onPreviewChange={setSiteImagesPreview}
                />
              )}
            </AccordionSection>

            {!locked && (
              <div className="quote-status-bar">
                <button type="submit" className="quote-btn primary" disabled={saving || showSaved}>
                  {saving ? "Saving…" : showSaved ? "Saved" : existingQuote ? "Save changes" : "Generate quote"}
                </button>
                {existingQuote?.share_url && (
                  <CopyLinkButton url={existingQuote.share_url} disabled={isDirtySinceLoad} />
                )}
                {status && <span className={`quote-status-msg ${status.kind}`}>{status.message}</span>}
              </div>
            )}
            {locked && <p className="quote-status-msg">This quote is {existingQuote?.status.toLowerCase()} and can no longer be edited.</p>}
          </form>

        </div>

        <div className="quote-preview-panel">
          <QuoteDocument
            quoteNumber={existingQuote?.quote_number ?? null}
            createdAt={existingQuote?.created_at ?? null}
            validityDays={form.validityDays ? Number(form.validityDays) : null}
            capacityKw={Number(form.capacity) || 0}
            panelMake={derivedPanelMake || null}
            inverterMake={derivedInverterMake || null}
            panelType={form.panelType || null}
            notes={form.notes || null}
            terms={form.terms}
            components={form.components}
            showComponentDetails={form.componentsEnabled}
            showComponentPricing={form.componentsEnabled && form.componentsPricingEnabled}
            customerName={lead.name}
            customerAddress={lead.address}
            customerDiscom={getDiscomName(lead.discom)}
            customerMobile={lead.mobile}
            customerEmail={lead.email}
            segment={lead.type}
            pricePerWatt={Number(form.pricePerWatt) || 0}
            taxRate={Number(form.taxRate) || 0}
            tariff={Number(form.tariff) || 9}
            computed={computed}
            amc={
              acceptedSnapshot
                ? acceptedSnapshot.amc
                  ? {
                      name: acceptedSnapshot.amc.name,
                      ratePerKw: acceptedSnapshot.amc.rate_per_kw != null ? Number(acceptedSnapshot.amc.rate_per_kw) : null,
                      inclusion: acceptedSnapshot.amc.inclusion.map(formatAmcInclusion),
                    }
                  : null
                : selectedAmcPlan
                  ? {
                      name: selectedAmcPlan.name,
                      ratePerKw: selectedAmcPlan.rate_per_kw != null ? Number(selectedAmcPlan.rate_per_kw) : null,
                      inclusion: selectedAmcPlan.inclusion.map(formatAmcInclusion),
                    }
                  : null
            }
            amcDurationYears={form.amcDurationYears ? Number(form.amcDurationYears) : null}
            amcMode={form.amcMode}
            amcPost5={{
              enabled: amcPost5Enabled,
              plans: (acceptedSnapshot ? acceptedSnapshot.amc_post5_plans : selectedPost5Plans).map((p) => ({
                name: p.name,
                ratePerKw: p.rate_per_kw != null ? Number(p.rate_per_kw) : null,
                inclusion: p.inclusion.map(formatAmcInclusion),
              })),
            }}
            loan={{
              enabled: loanEnabled,
              amount: form.loanAmount ? Number(form.loanAmount) : null,
              ratePercent: form.loanRatePercent ? Number(form.loanRatePercent) : null,
              tenureYears: form.loanTenureYears ? Number(form.loanTenureYears) : null,
            }}
            paymentSchedule={
              acceptedSnapshot?.payment_schedule ?? preferences?.payment_schedule.rows ?? DEFAULT_PAYMENT_SCHEDULE
            }
            branding={documentBranding}
            shareUrl={existingQuote?.share_url ?? null}
            siteImages={
              siteImagesPreview ??
              siteImages
                .filter((img) => img.url != null)
                .map((img) => ({ imageId: img.image_id, url: img.url as string, fileName: img.file_name }))
            }
            highlightSections={highlightSections}
          />
        </div>
      </div>
    </div>
  );
}
