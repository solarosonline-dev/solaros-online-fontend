export const METER_TYPES = ["Single Phase", "3 Phase"];

/** Matches the old repo's admin/quote.html "Segment" dropdown — the value feeds
 * quote pricing/subsidy defaults once Phase 6 is built, so keep these exact values. */
export const LEAD_TYPES: { value: string; label: string }[] = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "industrial", label: "Industrial" },
  { value: "farm", label: "Agri / Farm" },
];

/** Matches the old repo's admin/quote.html "DISCOM" dropdown. Purely informational —
 * no downstream calculation branches on which discom is selected. */
export const DISCOMS = ["TPDDL", "BSES Rajdhani", "BSES Yamuna", "DHBVN", "UHBVN", "JVVNL", "Other"];
