import type { LeadStatus } from "../../api/leads";

/** The lead lifecycle, in order. REJECTED is a terminal side-exit rather than
 * a funnel stage, so it's handled separately wherever this is used. */
export const LEAD_FUNNEL_STEPS: { status: LeadStatus; label: string }[] = [
  { status: "NEW", label: "New" },
  { status: "QUOTE_GENERATED", label: "Quote generated" },
  { status: "QUOTE_ACCEPTED", label: "Quote accepted" },
  { status: "AGREEMENT_GENERATED", label: "Agreement generated" },
  { status: "AGREEMENT_ACCEPTED", label: "Agreement accepted" },
];

export function leadFunnelLabel(status: LeadStatus): string {
  if (status === "REJECTED") return "Rejected";
  return LEAD_FUNNEL_STEPS.find((s) => s.status === status)?.label ?? status;
}

/** Plain status pill — used wherever a single lead's current status is
 * shown inline (tables, page headers). No funnel styling here; the funnel
 * visualization lives one level up, as navigation (see LeadFunnelNav). */
export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`lead-status-badge${status === "REJECTED" ? " rejected" : ""}`}>{leadFunnelLabel(status)}</span>
  );
}

/** Top-level, clickable funnel navigation for the leads list: New > Quote
 * generated > Quote accepted > ... Clicking a stage filters the list down
 * to leads currently at that stage (`onSelect(status)`); "All leads" clears
 * the filter. "Rejected" sits off to the side as its own tab, since it's a
 * side-exit from the funnel, not a stage within it. */
export function LeadFunnelNav({
  value,
  onSelect,
}: {
  value: LeadStatus | "";
  onSelect: (status: LeadStatus | "") => void;
}) {
  return (
    <div className="lead-funnel-nav">
      <button
        type="button"
        className={`lead-funnel-tab lead-funnel-tab--all${value === "" ? " active" : ""}`}
        onClick={() => onSelect("")}
      >
        All leads
      </button>
      <div className="lead-funnel">
        {LEAD_FUNNEL_STEPS.map((step) => (
          <button
            key={step.status}
            type="button"
            className={`lead-funnel-chevron${value === step.status ? " active" : ""}`}
            onClick={() => onSelect(step.status)}
          >
            {step.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`lead-funnel-tab lead-funnel-tab--rejected${value === "REJECTED" ? " active" : ""}`}
        onClick={() => onSelect("REJECTED")}
      >
        Rejected
      </button>
    </div>
  );
}
