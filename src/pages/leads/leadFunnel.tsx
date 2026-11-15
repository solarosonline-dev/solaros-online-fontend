import { formatStageLabel, type LeadStatus } from "../../api/leads";

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

/** Stage pill for the entity-configured lead workflow. A rejected lead shows
 * as "Rejected" regardless of the stage it was at. */
export function LeadStageBadge({ stage, rejected }: { stage: string | undefined; rejected?: boolean }) {
  return (
    <span className={`lead-status-badge${rejected ? " rejected" : ""}`}>
      {rejected ? "Rejected" : formatStageLabel(stage || "NEW")}
    </span>
  );
}

/** Top-level, clickable funnel navigation for the leads list, driven by the
 * entity's configured workflow stages (Settings > Lead workflow). Clicking a
 * stage filters the list to leads currently at that stage; "All leads" clears
 * it. "Rejected" sits off to the side as its own tab, since a lead can be
 * rejected from any stage. `value` is a stage name, "REJECTED" or "". */
export function LeadFunnelNav({
  stages,
  value,
  onSelect,
}: {
  stages: string[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="lead-funnel-nav">
      {/* Mobile (≤640px): a single native dropdown instead of a row of
       * separate buttons — see .lead-funnel-select / .lead-funnel-buttons in
       * LeadsPage.css for the breakpoint that swaps between the two. */}
      <select
        className="lead-funnel-select"
        aria-label="Filter leads by stage"
        value={value}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">All leads</option>
        {stages.map((stage) => (
          <option key={stage} value={stage}>
            {formatStageLabel(stage)}
          </option>
        ))}
        <option value="REJECTED">Rejected</option>
      </select>

      <div className="lead-funnel-buttons">
        <button
          type="button"
          className={`lead-funnel-tab lead-funnel-tab--all${value === "" ? " active" : ""}`}
          onClick={() => onSelect("")}
        >
          All leads
        </button>
        <div className="lead-funnel">
          {stages.map((stage) => (
            <button
              key={stage}
              type="button"
              className={`lead-funnel-chevron${value === stage ? " active" : ""}`}
              onClick={() => onSelect(stage)}
            >
              {formatStageLabel(stage)}
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
    </div>
  );
}
