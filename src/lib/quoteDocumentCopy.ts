/* ============================================================
   Copy/formatting helpers for the customer-facing quote document —
   ported from the old repo's quote-render.js. Everything here is
   either pure formatting or generic marketing/legal copy that isn't
   tied to any per-entity backend data (segment pitch lines, the
   "what's included" list, the install timeline). Numeric derivation
   stays in quoteCalculations.ts; this file is presentation-only.
============================================================ */

import type { QuoteComputeResult } from "./quoteCalculations";

export function formatINRShort(n: number): string {
  if (n >= 1e7) return "₹" + (n / 1e7).toFixed(2).replace(/\.00$/, "") + " Cr";
  if (n >= 1e5) return "₹" + (n / 1e5).toFixed(2).replace(/\.00$/, "") + " L";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export const SEGMENT_LABELS: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
  farm: "Agri / Farm",
};

/** One-line ROI story tailored to the customer's segment. */
export function pitchLine(segment: string | null, computed: QuoteComputeResult): string {
  const monthly = formatINRShort(computed.monthlySaving);
  if (segment === "residential")
    return `From day one, your electricity bill becomes a souvenir. We've sized this system to cover your typical home consumption — and you'll save about ${monthly}/month while sending surplus units to the grid.`;
  if (segment === "commercial")
    return `Showroom, office or shop tariffs in India are punishingly high. This system pays back in ${computed.paybackYrs.toFixed(1)} years — after which every unit your roof generates is pure margin.`;
  if (segment === "industrial")
    return `Industrial roofs are India's largest untapped power plant. With accelerated depreciation available in Year 1 and ${monthly}/month bill savings, this asset typically pays back inside a few years.`;
  return `This system displaces grid power that would otherwise come from coal. From the very first day, you save money and avoid burning fossil fuel.`;
}

/** Why no subsidy applies, when it doesn't — matches the old repo's explanatory copy. */
export function subsidyExplanationNote(segment: string | null, panelType: string | null): string | null {
  const isResidential = segment === "residential";
  const isDCR = (panelType ?? "DCR") === "DCR";
  if (isResidential && !isDCR) {
    return "Non-DCR panels: No PM Surya Ghar subsidy. Lower upfront cost compensates. Net-metering may require DCR — verify with your DISCOM.";
  }
  if (!isResidential) {
    const label = (SEGMENT_LABELS[segment ?? ""] ?? "this").toLowerCase();
    return `No central subsidy on the ${label} segment. Accelerated depreciation & GST input credit may be available — consult your CA.`;
  }
  return null;
}

/** Warranty years + specification text pulled from the component-wise
 * pricing rows (matched by keyword in the particular text), so "What's
 * included" always reflects what the admin actually configured there — the
 * default components' `specification` field flows in here via the entity's
 * defaults or, if the sales rep hand-edited that row on this quote, from
 * that override instead — even when the component-wise pricing table itself
 * is hidden from the customer. `null`/omitted falls back to the generic
 * copy below (which mirrors each field's seeded default in
 * entity_preferences.py). */
export type WhatsIncludedWarranty = {
  panelWarrantyYears?: number | null;
  inverterWarrantyYears?: number | null;
  structureWarrantyYears?: number | null;
  inverterSpec?: string | null;
  structureSpec?: string | null;
  cableSpec?: string | null;
  enclosureSpec?: string | null;
  lightningSpec?: string | null;
};

export const WHATS_INCLUDED = (
  panelMake: string | null,
  inverterMake: string | null,
  isDCR: boolean,
  isResidential: boolean,
  warranty?: WhatsIncludedWarranty,
) => [
  {
    icon: "☀",
    title: `${panelMake || "Tier-1 mono-PERC"} panels${isDCR ? " (DCR/ALMM)" : " (Non-DCR)"}`,
    desc: `${
      warranty?.panelWarrantyYears != null ? `${warranty.panelWarrantyYears}-yr` : "30-yr"
    } linear performance · ≥80% output at year 25${!isDCR && !isResidential ? " · Not eligible for net-metering" : ""}`,
  },
  {
    icon: "⚡",
    title: inverterMake || "Tier-1 string inverter",
    desc: `${
      warranty?.inverterWarrantyYears != null ? `${warranty.inverterWarrantyYears}-yr` : "10-yr"
    } warranty · ${warranty?.inverterSpec ?? "IP65 · WiFi monitoring built-in"}`,
  },
  {
    icon: "🛠",
    title: "Elevated GI mounting structure",
    desc: `${
      warranty?.structureWarrantyYears != null ? `${warranty.structureWarrantyYears}-yr` : "10-yr"
    } ${warranty?.structureSpec ?? "anti-corrosion · zero roof-leak guarantee"}`,
  },
  {
    icon: "🔌",
    title: "DC + AC cabling, ACDB & DCDB",
    desc: `${warranty?.cableSpec ?? "IS-7098-2 cables"} · ${warranty?.enclosureSpec ?? "IP65 enclosures · SPD & isolators"}`,
  },
  {
    icon: "⏚",
    title: "Earthing, lightning & surge protection",
    desc: warranty?.lightningSpec ?? "Copper-bonded electrodes · Type-2 SPD · IS-3043 compliant",
  },
  { icon: "📋", title: "Single-window paperwork", desc: "PM Surya Ghar registration · DISCOM net-metering · loan facilitation" },
  { icon: "📱", title: "WiFi monitoring + WhatsApp savings report", desc: "Live generation & lifetime savings on your phone" },
  { icon: "🛡", title: "Performance Promise", desc: "≥80% design generation guaranteed in writing" },
];

export function installTimeline(lastStepLabel: string) {
  return [
    { day: "Day 0", title: "Site survey", detail: "Drone scan, shadow analysis, structural check" },
    { day: "Day 1–2", title: "Design & BOQ", detail: "3-D layout, single-line diagram, panel-level layout shared" },
    { day: "Day 2–4", title: "Paperwork", detail: "PM Surya Ghar registration, DISCOM application, loan if needed" },
    { day: "Day 4–7", title: "Installation", detail: "Mounting, panels, inverter, cables — photos sent on WhatsApp every hour" },
    { day: "Day 7–10", title: "Commissioning", detail: "Net-meter installed by DISCOM, monitoring app active, training" },
    { day: "Year 1+", title: lastStepLabel, detail: "Cleaning, monitoring, monthly savings report" },
  ];
}
