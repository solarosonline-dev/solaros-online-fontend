import { useState, useEffect } from "react";
import type { Components } from "../../../api/entityPreferences";

type Props = {
  draft: Components;
  onChange: (draft: Components) => void;
};

const STANDARD_COMPONENTS = [
  { name: "Solar Panels", tax: 5, placeholderSpec: "e.g. Mono PERC, Half-Cut 550Wp" },
  { name: "Inverter", tax: 5, placeholderSpec: "e.g. On-Grid String Inverter with WiFi" },
  { name: "ACDB Box", tax: 18, placeholderSpec: "e.g. IP65 rated ACDB box, surge protection" },
  { name: "AC Cable", tax: 18, placeholderSpec: "e.g. 4 Core XLPE armoured cable" },
  { name: "DCDB Box", tax: 18, placeholderSpec: "e.g. IP65 rated DCDB box, fuses, surge protection" },
  { name: "DC Cable", tax: 18, placeholderSpec: "e.g. 4 sqmm solar DC cable" },
  { name: "Lightning Arrestor (LA)", tax: 18, placeholderSpec: "e.g. Solid copper lightning arrestor rod with base" },
  { name: "Earthing Rods", tax: 18, placeholderSpec: "e.g. Copper bonded rods, chemical compound" },
  { name: "Earthing Cable/GI Strip", tax: 18, placeholderSpec: "e.g. GI earthing strip, earthing cables" },
  { name: "Structure", tax: 18, placeholderSpec: "e.g. Hot Dip Galvanized (HDG) / Aluminium elevated structure" },
  { name: "I&C Cost", tax: 18, placeholderSpec: "e.g. Installation & commissioning standard labor & testing" },
];

export default function ComponentsTab({ draft, onChange }: Props) {
  const items = draft.items;
  const isMobile = document.body.classList.contains("mobile-view");
  const [currentStep, setCurrentStep] = useState(0);

  // Pad or align loaded items to match the 11 standard steps for mobile view
  useEffect(() => {
    if (isMobile && items.length < 11) {
      const padded = [...items];
      for (let i = padded.length; i < 11; i++) {
        padded.push({
          particular: STANDARD_COMPONENTS[i].name,
          tax_percent: STANDARD_COMPONENTS[i].tax,
          warranty_years: null,
          specification: null,
        });
      }
      onChange({ items: padded });
    }
  }, [isMobile, items.length, onChange]);

  function handleFieldChange(index: number, field: "particular" | "specification" | "tax_percent" | "warranty_years", value: any) {
    onChange({
      items: items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    });
  }

  // Desktop Handlers
  function handleAdd() {
    onChange({
      items: [...items, { particular: "", tax_percent: 18, warranty_years: null, specification: null }],
    });
  }

  function handleRemove(index: number) {
    onChange({ items: items.filter((_, i) => i !== index) });
  }

  if (isMobile) {
    const item = items[currentStep] || {
      particular: "",
      tax_percent: 18,
      warranty_years: null,
      specification: null,
    };

    const stepName = item.particular || "New Custom Component";
    const defaultPlaceholder = "e.g. technical specifications & parameter metrics";

    const handleAddStepMobile = () => {
      const newItems = [...items, { particular: "", tax_percent: 18, warranty_years: null, specification: null }];
      onChange({ items: newItems });
      setCurrentStep(newItems.length - 1);
    };

    const handleRemoveStepMobile = (index: number) => {
      if (items.length <= 1) return;
      const newItems = items.filter((_, i) => i !== index);
      onChange({ items: newItems });
      setCurrentStep(Math.max(0, index - 1));
    };

    return (
      <div className="mobile-components-stepper">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <div className="stepper-count-badge">Component {currentStep + 1} of {items.length}</div>
          <div style={{ display: "flex", gap: "8px" }}>
            {items.length > 1 && (
              <button
                type="button"
                className="user-card-delete-icon"
                onClick={() => handleRemoveStepMobile(currentStep)}
                style={{ position: "static", background: "none", border: "none", color: "var(--app-danger)" }}
                title="Remove component step"
              >
                🗑️
              </button>
            )}
            <button
              type="button"
              className="mobile-btn-add-primary"
              onClick={handleAddStepMobile}
              style={{ fontSize: "11px", padding: "6px 12px" }}
            >
              ➕ Add Step
            </button>
          </div>
        </div>

        <div className="mobile-stepper-info-box">
          <h3>{stepName} Specifications</h3>
          <p className="step-description">Configure the default pricing row and warranty details for this component step.</p>
        </div>

        {/* Tactile Form Card */}
        <div className="mobile-step-card animate-slide" style={{ padding: "16px", marginTop: "10px" }}>
          <div className="mobile-form-field">
            <label>Particular Name</label>
            <input
              type="text"
              value={item.particular}
              onChange={(e) => handleFieldChange(currentStep, "particular", e.target.value)}
              placeholder="e.g. Panel Structure, DC Cable"
            />
          </div>

          <div className="mobile-form-row">
            <div className="mobile-form-field">
              <label>GST Tax Rate (%)</label>
              <select
                value={item.tax_percent}
                onChange={(e) => handleFieldChange(currentStep, "tax_percent", Number(e.target.value))}
              >
                <option value={0}>0% - Exempt</option>
                <option value={5}>5% - Renewable concession</option>
                <option value={12}>12% - Tech goods</option>
                <option value={18}>18% - Standard supply</option>
                <option value={28}>28% - Luxury rate</option>
              </select>
            </div>

            <div className="mobile-form-field">
              <label>Warranty (yrs)</label>
              <input
                type="number"
                min={0}
                placeholder="e.g. 5"
                value={item.warranty_years ?? ""}
                onChange={(e) => handleFieldChange(currentStep, "warranty_years", e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
          </div>

          <div className="mobile-form-field">
            <label>Technical Specification Remarks</label>
            <textarea
              rows={2}
              value={item.specification ?? ""}
              onChange={(e) => handleFieldChange(currentStep, "specification", e.target.value === "" ? null : e.target.value)}
              placeholder={STANDARD_COMPONENTS[currentStep]?.placeholderSpec ?? defaultPlaceholder}
              style={{ fontSize: "13px !important", padding: "10px 12px", height: "auto" }}
            />
          </div>
        </div>

        {/* Stepper Navigation buttons */}
        <div className="mobile-stepper-controls" style={{ position: "relative", bottom: "0", marginTop: "16px", padding: 0 }}>
          {currentStep > 0 && (
            <button type="button" className="stepper-btn prev-btn" onClick={() => setCurrentStep((c) => c - 1)}>
              ⬅️ Back
            </button>
          )}
          {currentStep < items.length - 1 ? (
            <button type="button" className="stepper-btn next-btn" onClick={() => setCurrentStep((c) => c + 1)}>
              Next Step ➡️
            </button>
          ) : (
            <div style={{ flex: 1, textAlign: "center", padding: "12px", background: "#f0fdf4", color: "#166534", borderRadius: "10px", fontSize: "13px", fontWeight: 700 }}>
              🎉 All steps completed! Use the bottom Save bar to persist changes.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="entity-field" style={{ maxWidth: "100%" }}>
      <label>
        Default components{" "}
        <span className="entity-field-help">
          Shared with customers as the starting component-wise pricing rows on new quotes — qty/price are
          filled in per quote. Solar panels &amp; inverter default to 5% GST, other components to 18%.
        </span>
      </label>

      <div className="compb-table-wrap">
        <table className="compb-table compb-table--catalog">
          <thead>
            <tr>
              <th>Particulars</th>
              <th>Tax %</th>
              <th>Warranty (yrs)</th>
              <th>Specification</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td className="compb-particular" data-label="Particulars">
                  <input
                    type="text"
                    placeholder="e.g. Solar Panels"
                    value={item.particular}
                    onChange={(e) => handleParticularChange(i, e.target.value)}
                  />
                </td>
                <td className="compb-tax" data-label="Tax %">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={item.tax_percent}
                    onChange={(e) => handleTaxChange(i, e.target.value)}
                  />
                </td>
                <td className="compb-warranty" data-label="Warranty (yrs)">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={item.warranty_years ?? ""}
                    onChange={(e) => handleWarrantyChange(i, e.target.value)}
                  />
                </td>
                <td className="compb-spec" data-label="Specification">
                  <input
                    type="text"
                    placeholder="e.g. IP65 · WiFi monitoring built-in"
                    value={item.specification ?? ""}
                    onChange={(e) => handleSpecificationChange(i, e.target.value)}
                  />
                </td>
                <td className="compb-actions">
                  <button type="button" className="compb-remove-btn" onClick={() => handleRemove(i)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="entity-btn" onClick={handleAdd}>
        + Add component
      </button>
    </div>
  );

  // Helper bindings for the legacy desktop views
  function handleParticularChange(index: number, value: string) {
    handleFieldChange(index, "particular", value);
  }

  function handleTaxChange(index: number, value: string) {
    handleFieldChange(index, "tax_percent", value === "" ? 0 : Number(value));
  }

  function handleWarrantyChange(index: number, value: string) {
    handleFieldChange(index, "warranty_years", value === "" ? null : Number(value));
  }

  function handleSpecificationChange(index: number, value: string) {
    handleFieldChange(index, "specification", value === "" ? null : value);
  }
}
