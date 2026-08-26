import { apiRequest } from "./client";

export type AmcFrequency = "monthly" | "quarterly" | "half-yearly" | "annually";

export const AMC_FREQUENCY_OPTIONS: { value: AmcFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half-yearly", label: "Half-yearly" },
  { value: "annually", label: "Annually" },
];

export function amcFrequencyLabel(frequency: AmcFrequency | null | undefined): string | null {
  if (!frequency) return null;
  return AMC_FREQUENCY_OPTIONS.find((opt) => opt.value === frequency)?.label ?? frequency;
}

/** A single inclusion line on a plan; frequency is per-line (not per-plan)
 * since one plan can bundle items on different servicing cadences. */
export type AmcInclusionItem = {
  text: string;
  frequency: AmcFrequency | null;
};

/** Renders an inclusion item the way it should read everywhere in the app:
 * "<Frequency> <text>" when a cadence is set, otherwise just "<text>". */
export function formatAmcInclusion(item: AmcInclusionItem): string {
  const label = amcFrequencyLabel(item.frequency);
  return label ? `${label} ${item.text}` : item.text;
}

export type AmcPlan = {
  amc_id: number;
  entity_id: number;
  name: string;
  /** Decimal, serialized as a string by the backend. */
  rate_per_kw: string | null;
  inclusion: AmcInclusionItem[];
  is_active: boolean;
};

export function listAmcPlans(entityId: number, params: { is_active?: boolean } = {}) {
  const qs = new URLSearchParams();
  if (params.is_active != null) qs.set("is_active", String(params.is_active));
  const query = qs.toString();
  return apiRequest<{ items: AmcPlan[] }>(`/entities/${entityId}/amc-plans${query ? `?${query}` : ""}`);
}

export function createAmcPlan(
  entityId: number,
  data: { name: string; rate_per_kw?: number; inclusion: AmcInclusionItem[] },
) {
  return apiRequest<AmcPlan>(`/entities/${entityId}/amc-plans`, { method: "POST", body: data });
}

export function updateAmcPlan(
  entityId: number,
  amcId: number,
  data: { name?: string; rate_per_kw?: number; inclusion?: AmcInclusionItem[] },
) {
  return apiRequest<AmcPlan>(`/entities/${entityId}/amc-plans/${amcId}`, { method: "PATCH", body: data });
}

export function deactivateAmcPlan(entityId: number, amcId: number) {
  return apiRequest<void>(`/entities/${entityId}/amc-plans/${amcId}`, { method: "DELETE" });
}
