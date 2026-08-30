import type { Components } from "../../../api/entityPreferences";

type Props = {
  draft: Components;
  onChange: (draft: Components) => void;
};

export default function ComponentsTab({ draft, onChange }: Props) {
  const items = draft.items;

  function handleAdd() {
    onChange({
      items: [...items, { particular: "", tax_percent: 18, warranty_years: null, specification: null }],
    });
  }

  function handleRemove(index: number) {
    onChange({ items: items.filter((_, i) => i !== index) });
  }

  function handleParticularChange(index: number, value: string) {
    onChange({
      items: items.map((item, i) => (i === index ? { ...item, particular: value } : item)),
    });
  }

  function handleTaxChange(index: number, value: string) {
    const tax_percent = value === "" ? 0 : Number(value);
    onChange({
      items: items.map((item, i) => (i === index ? { ...item, tax_percent } : item)),
    });
  }

  function handleWarrantyChange(index: number, value: string) {
    const warranty_years = value === "" ? null : Number(value);
    onChange({
      items: items.map((item, i) => (i === index ? { ...item, warranty_years } : item)),
    });
  }

  function handleSpecificationChange(index: number, value: string) {
    const specification = value === "" ? null : value;
    onChange({
      items: items.map((item, i) => (i === index ? { ...item, specification } : item)),
    });
  }

  return (
    <div className="entity-field" style={{ maxWidth: "100%" }}>
      <label>
        Default components{" "}
        {/* Example/help copy, not a field label — this component only receives `draft`/`onChange`
            props, no `entity`/`tax_label`, so "GST" here stays literal rather than guessing. */}
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
                {/* data-label feeds the mobile ::before rule in EntityManagementPage.css --
                    on narrow screens this row reflows into a bordered card (particulars on
                    top, tax/warranty/remove in a row, specification below) instead of a
                    horizontally-scrolling table, and the <thead> labels above are hidden
                    then, so each field needs its own inline label to stay identifiable. */}
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
}
