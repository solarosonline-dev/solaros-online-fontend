import NumberField from "../../../components/NumberField";
import type { PaymentSchedule } from "../../../api/entityPreferences";

type Props = {
  draft: PaymentSchedule;
  onChange: (draft: PaymentSchedule) => void;
};

export default function PaymentScheduleTab({ draft, onChange }: Props) {
  const rows = draft.rows;
  const totalPercent = rows.reduce((sum, row) => sum + (row.percent || 0), 0);
  const isMobile = document.body.classList.contains("mobile-view");

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

  function handlePercentChange(index: number, percent: number) {
    onChange({
      rows: rows.map((row, i) => (i === index ? { ...row, percent } : row)),
    });
  }

  if (isMobile) {
    // Render high-fidelity Mobile Cards Stack
    return (
      <div className="mobile-payment-schedule-tab">
        <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
          Milestone Rules &amp; Percentages
          <span className="entity-field-help" style={{ display: "block", textTransform: "none", marginTop: "4px", fontSize: "12px", lineHeight: "1.4" }}>
            Milestones shown on the quote document. Rupees are auto-computed based on the percentage of total project cost. Sum should equal 100%.
          </span>
        </label>

        <div className="mobile-users-list" style={{ marginTop: "12px" }}>
          {rows.map((row, i) => (
            <div key={i} className="mobile-user-card" style={{ padding: "14px", position: "relative" }}>
              <button
                type="button"
                className="user-card-delete-icon"
                aria-label="Remove milestone"
                onClick={() => handleRemove(i)}
                style={{ top: "8px", right: "8px" }}
              >
                🗑️
              </button>

              <div className="mobile-form-field">
                <label>Milestone Label</label>
                <input
                  type="text"
                  placeholder="e.g. On Signing"
                  value={row.label}
                  onChange={(e) => handleFieldChange(i, "label", e.target.value)}
                  style={{ height: "38px !important", fontSize: "13px !important" }}
                />
              </div>

              <div className="mobile-form-field">
                <label>Percentage Share (%)</label>
                <NumberField
                  min={0}
                  max={100}
                  placeholder="e.g. 30"
                  value={row.percent}
                  emptyValue={0}
                  onCommit={(v) => handlePercentChange(i, v)}
                  style={{ height: "38px !important", fontSize: "13px !important" }}
                />
              </div>

              <div className="mobile-form-field" style={{ marginBottom: "0" }}>
                <label>Milestone Description Remarks</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Confirms project setup and locks supply allocation"
                  value={row.description}
                  onChange={(e) => handleFieldChange(i, "description", e.target.value)}
                  style={{ fontSize: "13px !important", padding: "8px 10px", height: "auto" }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Form summary indicators */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
          <button type="button" className="mobile-user-submit-btn" onClick={handleAdd} style={{ minHeight: "40px !important" }}>
            ➕ Add Milestone
          </button>

          <span
            className={`entity-field-help ${totalPercent !== 100 ? "entity-field-warning" : ""}`}
            style={{
              padding: "10px",
              borderRadius: "10px",
              background: totalPercent === 100 ? "#f0fdf4" : "#fffbeb",
              border: `1px solid ${totalPercent === 100 ? "#dcfce7" : "#fef3c7"}`,
              color: totalPercent === 100 ? "#15803d" : "#b45309",
              fontSize: "12px",
              fontWeight: 700,
              textAlign: "center"
            }}
          >
            Total Allocated: {totalPercent}% {totalPercent !== 100 ? "— should add up to exactly 100%" : ""}
          </span>
        </div>
      </div>
    );
  }

  // Desktop Responsive Table
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
                <td className="compb-particular" data-label="Milestone label">
                  <input
                    type="text"
                    placeholder="e.g. on signing"
                    value={row.label}
                    onChange={(e) => handleFieldChange(i, "label", e.target.value)}
                  />
                </td>
                <td className="compb-num" data-label="Percent">
                  <NumberField
                    min={0}
                    max={100}
                    step={1}
                    value={row.percent}
                    emptyValue={0}
                    onCommit={(v) => handlePercentChange(i, v)}
                  />
                </td>
                <td className="compb-particular" data-label="Description">
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
      <button type="button" className="entity-btn entity-add-row-btn" onClick={handleAdd}>
        + Add milestone
      </button>
      <span className={`entity-field-help ${totalPercent !== 100 ? "entity-field-warning" : ""}`}>
        {" "}
        Total: {totalPercent}% {totalPercent !== 100 ? "— should add up to 100%" : ""}
      </span>
    </div>
  );
}
