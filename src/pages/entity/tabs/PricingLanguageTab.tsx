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
  skipQuoteOtp: boolean;
  onChangePricing: (draft: Pricing) => void;
  onChangeLanguage: (language: string) => void;
  onChangeSkipQuoteOtp: (skipQuoteOtp: boolean) => void;
};

export default function PricingLanguageTab({
  pricing,
  language,
  skipQuoteOtp,
  onChangePricing,
  onChangeLanguage,
  onChangeSkipQuoteOtp,
}: Props) {
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
          onChange={(e) => onChangePricing({ default_price_per_watt: parseFloat(e.target.value) || 0 })}
        />
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

      <div className="entity-field">
        <label htmlFor="skip_quote_otp">
          <input
            id="skip_quote_otp"
            type="checkbox"
            checked={skipQuoteOtp}
            onChange={(e) => onChangeSkipQuoteOtp(e.target.checked)}
          />{" "}
          Skip email OTP for quote acceptance
        </label>
        <span className="entity-field-help">
          When enabled, customers accepting a quote only need to check the terms/AMC consent box — no code is
          emailed. Turn this on temporarily if your email delivery is down; otherwise leave it off, since OTP
          verification protects against a forwarded quote link being accepted by someone other than the customer.
        </span>
      </div>
    </div>
  );
}
