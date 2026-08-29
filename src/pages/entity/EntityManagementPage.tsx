import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { getEntity, updateEntity, type Entity } from "../../api/entity";
import {
  getEntityPreferences,
  updateEntityPreferences,
  resetPreferenceCategory,
  type EntityPreferences,
  type PreferenceCategory,
} from "../../api/entityPreferences";
import { ApiError } from "../../api/client";
import BusinessInfoTab, { type BusinessInfoDraft } from "./tabs/BusinessInfoTab";
import BrandingTypographyTab from "./tabs/BrandingTypographyTab";
import DocumentsTab from "./tabs/DocumentsTab";
import PricingLanguageTab from "./tabs/PricingLanguageTab";
import ComponentsTab from "./tabs/ComponentsTab";
import PaymentScheduleTab from "./tabs/PaymentScheduleTab";
import AmcPlansPage from "../amc/AmcPlansPage";
import "./EntityManagementPage.css";

type Tab =
  | "business"
  | "branding"
  | "documents"
  | "pricing"
  | "components"
  | "payment_schedule"
  | "amc";

const TABS: { key: Tab; label: string }[] = [
  { key: "business", label: "Business info" },
  { key: "branding", label: "Branding & Typography" },
  { key: "documents", label: "Documents" },
  { key: "pricing", label: "Pricing & language" },
  { key: "components", label: "Default components" },
  { key: "payment_schedule", label: "Payment schedule" },
  { key: "amc", label: "AMC Plans" },
];

// The AMC Plans tab manages its own CRUD/persistence per row (add/edit/
// deactivate all hit the API immediately) rather than the draft-then-Save
// pattern every other tab here uses, so it doesn't participate in the
// shared Save/Reset bar below.
const SELF_MANAGED_TABS: Tab[] = ["amc"];

// "branding" here covers the merged Branding & Typography tab -- resetting
// it resets both underlying categories (see handleReset), so this only
// needs to name one to make the Reset button render for that tab.
const RESETTABLE_CATEGORY: Partial<Record<Tab, PreferenceCategory>> = {
  branding: "branding",
  documents: "document_customization",
  pricing: "pricing",
  components: "components",
  payment_schedule: "payment_schedule",
};

function isTabKey(value: string | null): value is Tab {
  return TABS.some((t) => t.key === value);
}

export default function EntityManagementPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;

  // Supports deep-linking straight to a tab (e.g. `?tab=amc`) -- used by the
  // "no AMC plans defined" guided-tour prompt (see QuoteBuilderPage.tsx /
  // AppLayout.tsx) to land the admin directly on AMC Plans. `?tour=1`
  // alongside it additionally pulses that tab button once, so it's obvious
  // which one the tour meant, without leaving a highlight lingering forever.
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(isTabKey(initialTab) ? initialTab : "business");
  const [tourPulseTab, setTourPulseTab] = useState<Tab | null>(
    searchParams.get("tour") === "1" && isTabKey(initialTab) ? initialTab : null,
  );
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [prefs, setPrefs] = useState<EntityPreferences | null>(null);
  const [businessDraft, setBusinessDraft] = useState<BusinessInfoDraft>({
    name: "",
    address: "",
    business_phone: "",
    business_email: "",
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  // Auto-clear the tour pulse after a few seconds even if the admin never
  // clicks a tab (e.g. they just start reading the already-selected AMC
  // panel) -- a highlight that never goes away stops meaning anything.
  useEffect(() => {
    if (!tourPulseTab) return;
    const t = setTimeout(() => setTourPulseTab(null), 4000);
    return () => clearTimeout(t);
  }, [tourPulseTab]);

  function load() {
    setLoading(true);
    setLoadError(null);
    Promise.all([getEntity(entityId), getEntityPreferences(entityId)])
      .then(([entityRes, prefsRes]) => {
        setEntity(entityRes);
        setPrefs(prefsRes);
        setBusinessDraft({
          name: entityRes.name,
          address: entityRes.address,
          business_phone: entityRes.business_phone ?? "",
          business_email: entityRes.business_email ?? "",
        });
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId]);

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      if (tab === "business") {
        const updated = await updateEntity(entityId, businessDraft);
        setEntity(updated);
      } else if (prefs) {
        const {
          branding,
          typography,
          document_customization,
          pricing,
          components,
          payment_schedule,
          language,
          skip_quote_otp,
        } = prefs;
        const updated = await updateEntityPreferences(entityId, {
          branding,
          typography,
          document_customization,
          pricing,
          components,
          payment_schedule,
          language,
          skip_quote_otp,
        });
        setPrefs(updated);
      }
      setStatus({ kind: "success", message: "Saved." });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    const category = RESETTABLE_CATEGORY[tab];
    if (!category) return;
    setSaving(true);
    setStatus(null);
    try {
      // The merged Branding & Typography tab edits two separate preference
      // categories at once -- reset both so "Reset to defaults" here isn't
      // silently a no-op for whichever half it doesn't name.
      let updated = await resetPreferenceCategory(entityId, category);
      if (tab === "branding") {
        updated = await resetPreferenceCategory(entityId, "typography");
      }
      setPrefs(updated);
      setStatus({ kind: "success", message: "Reset to defaults." });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Reset failed" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="entity-loading">Loading…</div>;
  }

  if (loadError || !entity || !prefs) {
    return <p className="entity-status error">{loadError ?? "Failed to load entity."}</p>;
  }

  return (
    <div className="entity-mgmt">
      <h1>Entity settings</h1>

      <div className="entity-tabs-bar">
        <button
          type="button"
          className="entity-tabs-toggle"
          aria-expanded={tabMenuOpen}
          aria-label="Toggle settings sections"
          onClick={() => setTabMenuOpen((open) => !open)}
        >
          <span className="entity-tabs-toggle-label">{TABS.find((t) => t.key === tab)?.label}</span>
          <span className="entity-tabs-toggle-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        <div className={`entity-tabs ${tabMenuOpen ? "open" : ""}`}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={[tab === t.key ? "active" : "", tourPulseTab === t.key ? "tour-pulse" : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                setTab(t.key);
                setTabMenuOpen(false);
                setTourPulseTab(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="entity-panel">
        {tab === "business" && (
          <BusinessInfoTab entity={entity} draft={businessDraft} onChange={setBusinessDraft} />
        )}
        {tab === "branding" && (
          <BrandingTypographyTab
            entityId={entityId}
            entity={entity}
            brandingDraft={prefs.branding}
            typographyDraft={prefs.typography}
            onChangeBranding={(branding) => setPrefs({ ...prefs, branding })}
            onChangeTypography={(typography) => setPrefs({ ...prefs, typography })}
            paymentScheduleRows={prefs.payment_schedule.rows}
            componentDefaults={prefs.components.items}
            defaultPricePerWatt={prefs.pricing.default_price_per_watt}
            defaultTaxRate={prefs.pricing.default_tax_rate}
          />
        )}
        {tab === "documents" && (
          <DocumentsTab
            draft={prefs.document_customization}
            onChange={(document_customization) => setPrefs({ ...prefs, document_customization })}
          />
        )}
        {tab === "pricing" && (
          <PricingLanguageTab
            pricing={prefs.pricing}
            language={prefs.language}
            skipQuoteOtp={prefs.skip_quote_otp}
            onChangePricing={(pricing) => setPrefs({ ...prefs, pricing })}
            onChangeLanguage={(language) => setPrefs({ ...prefs, language })}
            onChangeSkipQuoteOtp={(skip_quote_otp) => setPrefs({ ...prefs, skip_quote_otp })}
          />
        )}
        {tab === "components" && (
          <ComponentsTab
            draft={prefs.components}
            onChange={(components) => setPrefs({ ...prefs, components })}
          />
        )}
        {tab === "payment_schedule" && (
          <PaymentScheduleTab
            draft={prefs.payment_schedule}
            onChange={(payment_schedule) => setPrefs({ ...prefs, payment_schedule })}
          />
        )}
        {tab === "amc" && <AmcPlansPage />}
      </div>

      {!SELF_MANAGED_TABS.includes(tab) && (
        <div className="entity-save-bar">
          <button className="entity-btn primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          {RESETTABLE_CATEGORY[tab] && (
            <button className="entity-btn" onClick={handleReset} disabled={saving}>
              Reset to defaults
            </button>
          )}
          {status && <span className={`entity-status ${status.kind}`}>{status.message}</span>}
        </div>
      )}
    </div>
  );
}
