export const METER_TYPES = ["Single Phase", "3 Phase"];

/** Matches the old repo's admin/quote.html "Segment" dropdown — the value feeds
 * quote pricing/subsidy defaults once Phase 6 is built, so keep these exact values. */
export const LEAD_TYPES: { value: string; label: string }[] = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "industrial", label: "Industrial" },
  { value: "farm", label: "Agri / Farm" },
];

// The DISCOM dropdown used to be a flat, Delhi/NCR-only list here. It's now
// derived from the selected state via ./discomOptions (STATES /
// getDiscomsForState), covering every Indian state/UT from the MNRE-sourced
// discom dataset.
