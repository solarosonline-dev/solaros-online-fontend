import { useState, type FormEvent, type KeyboardEvent } from "react";
import { createAmcPlan, updateAmcPlan, type AmcPlan } from "../../api/amcPlans";
import { ApiError } from "../../api/client";

type Props = {
  entityId: number;
  plan: AmcPlan | null;
  onSaved: () => void;
  onCancel: () => void;
};

export default function AmcPlanForm({ entityId, plan, onSaved, onCancel }: Props) {
  const [name, setName] = useState(plan?.name ?? "");
  const [inclusions, setInclusions] = useState<string[]>(plan?.inclusion ?? []);
  const [newItem, setNewItem] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleAddItem() {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    setInclusions([...inclusions, trimmed]);
    setNewItem("");
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

    setSubmitting(true);
    try {
      if (plan) {
        await updateAmcPlan(entityId, plan.amc_id, { name: name.trim(), inclusion: inclusions });
      } else {
        await createAmcPlan(entityId, { name: name.trim(), inclusion: inclusions });
      }
      onSaved();
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
          <label htmlFor="amcInclusionInput">Inclusions</label>

          {inclusions.length > 0 && (
            <ul className="amc-inclusion-editor-list">
              {inclusions.map((item, i) => (
                <li key={i}>
                  <span>{item}</span>
                  <button type="button" className="amc-inclusion-remove" onClick={() => handleRemoveItem(i)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="amc-inclusion-add-row">
            <input
              id="amcInclusionInput"
              type="text"
              placeholder="e.g. Bi-annual panel cleaning"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={handleNewItemKeyDown}
            />
            <button type="button" className="amc-btn" onClick={handleAddItem}>
              + Add
            </button>
          </div>
        </div>

        {submitError && (
          <p className="amc-status error" role="alert">
            {submitError}
          </p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className="amc-btn primary" disabled={submitting}>
            {submitting ? "Saving…" : plan ? "Save changes" : "Add plan"}
          </button>
          <button type="button" className="amc-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
