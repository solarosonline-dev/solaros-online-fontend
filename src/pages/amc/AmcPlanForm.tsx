import { useState, type FormEvent } from "react";
import { createAmcPlan, updateAmcPlan, type AmcPlan } from "../../api/amcPlans";
import { ApiError } from "../../api/client";

type Props = {
  entityId: number;
  plan: AmcPlan | null;
  onSaved: () => void;
  onCancel: () => void;
};

function toArray(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export default function AmcPlanForm({ entityId, plan, onSaved, onCancel }: Props) {
  const [name, setName] = useState(plan?.name ?? "");
  const [inclusionText, setInclusionText] = useState(plan?.inclusion.join("\n") ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!name.trim()) {
      setNameError("Plan name is required.");
      return;
    }
    setNameError(null);

    const inclusion = toArray(inclusionText);

    setSubmitting(true);
    try {
      if (plan) {
        await updateAmcPlan(entityId, plan.amc_id, { name: name.trim(), inclusion });
      } else {
        await createAmcPlan(entityId, { name: name.trim(), inclusion });
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
          <label htmlFor="amcInclusion">Inclusions (one per line)</label>
          <textarea
            id="amcInclusion"
            rows={5}
            value={inclusionText}
            onChange={(e) => setInclusionText(e.target.value)}
          />
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
