import type { Components } from "../../../api/entityPreferences";

type Props = {
  draft: Components;
  onChange: (draft: Components) => void;
};

export default function ComponentsTab({ draft, onChange }: Props) {
  const items = draft.items;

  function handleAdd() {
    onChange({ items: [...items, { particular: "", tax_percent: 18 }] });
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
        <table className="compb-table">
          <thead>
            <tr>
              <th>Particulars</th>
              <th>Tax %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td className="compb-particular">
                  <input
                    type="text"
                    placeholder="e.g. Solar Panels"
                    value={item.particular}
                    onChange={(e) => handleParticularChange(i, e.target.value)}
                  />
                </td>
                <td className="compb-num">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={item.tax_percent}
                    onChange={(e) => handleTaxChange(i, e.target.value)}
                  />
                </td>
                <td>
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
