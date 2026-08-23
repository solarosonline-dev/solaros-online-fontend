import type { PaymentSchedule } from "../../../api/entityPreferences";

type Props = {
  draft: PaymentSchedule;
  onChange: (draft: PaymentSchedule) => void;
};

export default function PaymentScheduleTab({ draft, onChange }: Props) {
  const rows = draft.rows;
  const totalPercent = rows.reduce((sum, row) => sum + (row.percent || 0), 0);

  function handleAdd() {
    onChange({ rows: [...rows, { label: "", percent: 0, description: "" }] });
  }

  function handleRemove(index: number) {
    onChange({ rows: rows.filter((_, i) => i !== index) });
  }

  function handleFieldChange(index: number, field: "label" | "description", value: string) {
    onChange({
      rows: rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    });
  }

  function handlePercentChange(index: number, value: string) {
    const percent = value === "" ? 0 : Number(value);
    onChange({
      rows: rows.map((row, i) => (i === index ? { ...row, percent } : row)),
    });
  }

  return (
    <div className="entity-field" style={{ maxWidth: "100%" }}>
      <label>
        Payment schedule{" "}
        <span className="entity-field-help">
          Milestones shown on the quote document's "Payment schedule" section — each row's rupee amount is
          calculated from its percentage of the total project cost. Percentages should add up to 100%.
        </span>
      </label>

      <div className="compb-table-wrap">
        <table className="compb-table">
          <thead>
            <tr>
              <th>Milestone label</th>
              <th>Percent</th>
              <th>Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="compb-particular">
                  <input
                    type="text"
                    placeholder="e.g. on signing"
                    value={row.label}
                    onChange={(e) => handleFieldChange(i, "label", e.target.value)}
                  />
                </td>
                <td className="compb-num">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={row.percent}
                    onChange={(e) => handlePercentChange(i, e.target.value)}
                  />
                </td>
                <td className="compb-particular">
                  <input
                    type="text"
                    placeholder="e.g. Confirms PO and locks panel allocation"
                    value={row.description}
                    onChange={(e) => handleFieldChange(i, "description", e.target.value)}
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
        + Add milestone
      </button>
      <span className={`entity-field-help ${totalPercent !== 100 ? "entity-field-warning" : ""}`}>
        {" "}
        Total: {totalPercent}% {totalPercent !== 100 ? "— should add up to 100%" : ""}
      </span>
    </div>
  );
}
