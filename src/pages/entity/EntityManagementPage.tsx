import { useEffect, useState } from "react";
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
import BrandingTab from "./tabs/BrandingTab";
import TypographyTab from "./tabs/TypographyTab";
import DocumentsTab from "./tabs/DocumentsTab";
import PricingLanguageTab from "./tabs/PricingLanguageTab";
import ComponentsTab from "./tabs/ComponentsTab";
import PaymentScheduleTab from "./tabs/PaymentScheduleTab";
import AmcPlansPage from "../amc/AmcPlansPage";
import "./EntityManagementPage.css";

type Tab =
  | "business"
  | "branding"
  | "typography"
  | "documents"
  | "pricing"
  | "components"
  | "payment_schedule"
  | "amc";

const TABS: { key: Tab; label: string }[] = [
  { key: "business", label: "Business info" },
  { key: "branding", label: "Branding" },
  { key: "typography", label: "Typography" },
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

const RESETTABLE_CATEGORY: Partial<Record<Tab, PreferenceCategory>> = {
  branding: "branding",
  typography: "typography",
  documents: "document_customization",
  pricing: "pricing",
  components: "components",
  payment_schedule: "payment_schedule",
};

export default function EntityManagementPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;

  const [tab, setTab] = useState<Tab>("business");
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
      const updated = await resetPreferenceCategory(entityId, category);
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

      <div className="entity-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="entity-panel">
        {tab === "business" && (
          <BusinessInfoTab entity={entity} draft={businessDraft} onChange={setBusinessDraft} />
        )}
        {tab === "branding" && (
          <BrandingTab entityId={entityId} draft={prefs.branding} onChange={(branding) => setPrefs({ ...prefs, branding })} />
        )}
        {tab === "typography" && (
          <TypographyTab draft={prefs.typography} onChange={(typography) => setPrefs({ ...prefs, typography })} />
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
