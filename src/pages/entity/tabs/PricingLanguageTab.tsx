import type { Pricing } from "../../../api/entityPreferences";

const LANGUAGES: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
  { value: "ta", label: "தமிழ்" },
  { value: "kn", label: "ಕನ್ನಡ" },
  { value: "te", label: "తెలుగు" },
  { value: "bn", label: "বাংলা" },
  { value: "mr", label: "मराठी" },
  { value: "gu", label: "ગુજરાતી" },
  { value: "ml", label: "മലയാളം" },
];

type Props = {
  pricing: Pricing;
  language: string;
  onChangePricing: (draft: Pricing) => void;
  onChangeLanguage: (language: string) => void;
};

export default function PricingLanguageTab({ pricing, language, onChangePricing, onChangeLanguage }: Props) {
  return (
    <div>
      <div className="entity-field">
        <label htmlFor="default_price_per_watt">Default price per watt (₹)</label>
        <input
          id="default_price_per_watt"
          type="number"
          min={0}
          step={0.5}
          value={pricing.default_price_per_watt}
          onChange={(e) => onChangePricing({ ...pricing, default_price_per_watt: parseFloat(e.target.value) || 0 })}
        />
      </div>

      <div className="entity-field">
        {/* Not wired to entity data (this component only receives `pricing`/
            `language` props, no `entity`/`tax_label`) — left as the literal
            "GST" rather than guessing a dynamic value. */}
        <label htmlFor="default_tax_rate">Default GST rate (%)</label>
        <input
          id="default_tax_rate"
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={pricing.default_tax_rate}
          onChange={(e) => onChangePricing({ ...pricing, default_tax_rate: parseFloat(e.target.value) || 0 })}
        />
        <span className="entity-field-help">Pre-filled as the GST rate on every new quote — sales reps can still edit it per quote.</span>
      </div>

      <div className="entity-field">
        <label htmlFor="language">Document language</label>
        <select id="language" value={language} onChange={(e) => onChangeLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <span className="entity-field-help">All new quotes and agreements will be generated in this language.</span>
      </div>
    </div>
  );
}
