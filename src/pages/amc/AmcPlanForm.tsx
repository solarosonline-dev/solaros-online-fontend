import { useState, type FormEvent, type KeyboardEvent } from "react";
import {
  createAmcPlan,
  updateAmcPlan,
  formatAmcInclusion,
  AMC_FREQUENCY_OPTIONS,
  type AmcFrequency,
  type AmcInclusionItem,
  type AmcPlan,
} from "../../api/amcPlans";
import { ApiError } from "../../api/client";

type Props = {
  entityId: number;
  plan: AmcPlan | null;
  onCancel: () => void;
};

export default function AmcPlanForm({ entityId, plan, onCancel }: Props) {
  const [name, setName] = useState(plan?.name ?? "");
  const [ratePerKw, setRatePerKw] = useState(plan?.rate_per_kw ?? "");
  const [inclusions, setInclusions] = useState<AmcInclusionItem[]>(plan?.inclusion ?? []);
  const [newItemFrequency, setNewItemFrequency] = useState<AmcFrequency | "">("");
  const [newItemText, setNewItemText] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Tracks the plan being edited -- starts as `plan?.amc_id` (editing an
  // existing plan) or null (adding a new one), and flips from null to the
  // newly created id after the first successful save so a second save
  // while still on this screen updates that same plan instead of creating
  // a duplicate. `savedSnapshot` is the {name, ratePerKw, inclusions} as of
  // the last successful save -- comparing the live fields against it (see
  // isDirtySinceSave below) is what lets the Save button flip back from
  // "Saved" the moment anything changes, without wiring an onChange
  // handler onto every field.
  const [savedPlanId, setSavedPlanId] = useState<number | null>(plan?.amc_id ?? null);
  const [savedSnapshot, setSavedSnapshot] = useState<{
    name: string;
    ratePerKw: string;
    inclusions: AmcInclusionItem[];
  } | null>(null);

  const isDirtySinceSave =
    savedSnapshot != null &&
    (name !== savedSnapshot.name ||
      ratePerKw !== savedSnapshot.ratePerKw ||
      JSON.stringify(inclusions) !== JSON.stringify(savedSnapshot.inclusions));
  const showSaved = savedSnapshot != null && !isDirtySinceSave;

  function handleAddItem() {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    setInclusions([...inclusions, { text: trimmed, frequency: newItemFrequency || null }]);
    setNewItemText("");
    setNewItemFrequency("");
  }

  function handleNewItemKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddItem();
    }
  }

  function handleRemoveItem(index: number) {
    setInclusions(inclusions.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!name.trim()) {
      setNameError("Plan name is required.");
      return;
    }
    setNameError(null);

    const rate = ratePerKw.trim() ? Number(ratePerKw) : undefined;

    setSubmitting(true);
    try {
      if (savedPlanId != null) {
        await updateAmcPlan(entityId, savedPlanId, { name: name.trim(), rate_per_kw: rate, inclusion: inclusions });
      } else {
        const created = await createAmcPlan(entityId, { name: name.trim(), rate_per_kw: rate, inclusion: inclusions });
        setSavedPlanId(created.amc_id);
      }
      setName(name.trim());
      setSavedSnapshot({ name: name.trim(), ratePerKw, inclusions });
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Could not save plan");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="amc-panel">
      <form onSubmit={handleSubmit} noValidate>
        <div className="amc-field">
          <label htmlFor="amcName">Plan name</label>
          <input id="amcName" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          {nameError && <p className="amc-field-error">{nameError}</p>}
        </div>

        <div className="amc-field">
          <label htmlFor="amcRatePerKw">Rate (₹ per kW / year)</label>
          <input
            id="amcRatePerKw"
            type="number"
            min={0}
            step="0.01"
            value={ratePerKw}
            onChange={(e) => setRatePerKw(e.target.value)}
          />
        </div>

        <div className="amc-field">
          <label htmlFor="amcInclusionInput">Inclusions</label>

          {inclusions.length > 0 && (
            <ul className="amc-inclusion-editor-list">
              {inclusions.map((item, i) => {
                const full = formatAmcInclusion(item);
                return (
                  <li key={i}>
                    {/* title carries the full text for hover/long-press since the
                        span itself truncates with an ellipsis on narrow screens
                        (see .amc-inclusion-editor-list li span in the CSS). */}
                    <span title={full}>{full}</span>
                    <button type="button" className="amc-inclusion-remove" onClick={() => handleRemoveItem(i)}>
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="amc-inclusion-add-row">
            <select
              id="amcInclusionFrequency"
              aria-label="Frequency"
              // Full name on hover (desktop) / long-press (some mobile
              // browsers) since the visible option text is abbreviated --
              // see the shortLabel comment in api/amcPlans.ts.
              title={AMC_FREQUENCY_OPTIONS.find((opt) => opt.value === newItemFrequency)?.label ?? "Frequency"}
              value={newItemFrequency}
              onChange={(e) => setNewItemFrequency(e.target.value as AmcFrequency | "")}
            >
              <option value="">Freq.</option>
              {AMC_FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} title={opt.label}>
                  {opt.shortLabel}
                </option>
              ))}
            </select>
            <input
              id="amcInclusionInput"
              type="text"
              placeholder="e.g. Panel cleaning"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={handleNewItemKeyDown}
            />
          </div>
          <button
            type="button"
            className="amc-btn amc-inclusion-add-btn"
            onClick={handleAddItem}
            aria-label="Add inclusion"
            title="Add inclusion"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <path
                d="M12 4v16M4 12h16"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {submitError && (
          <p className="amc-status error" role="alert">
            {submitError}
          </p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className="amc-btn primary" disabled={submitting || showSaved}>
            {submitting ? "Saving…" : showSaved ? "Saved" : savedPlanId != null ? "Save changes" : "Add plan"}
          </button>
          <button type="button" className="amc-btn" onClick={onCancel}>
            {showSaved ? "Done" : "Cancel"}
          </button>
        </div>
      </form>
    </div>
  );
}
