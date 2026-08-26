/* ============================================================
   Copy/formatting helpers for the customer-facing agreement document —
   ported from the old repo's agreement-render.js. Static legal/marketing
   copy that isn't backend data lives here (scope-of-work, acknowledgement)
   — unlike quoteDocumentCopy.ts's WHATS_INCLUDED etc., none of this seeds
   into the editable `terms` list; the agreement's terms come solely from
   entity document-customization preferences (see AgreementBuilderPage).
============================================================ */

/** The static "what we provide" bullets shown in the numbered section 1 —
 * fixed copy, not part of the editable terms list (unlike the warranty/
 * liability boilerplate below, which stays admin-editable there). */
export const AGREEMENT_SCOPE_ITEMS = [
  {
    icon: "☀",
    title: "Supply & installation",
    desc: "Solar panels, inverter, mounting structure, cabling, earthing & safety components",
  },
  {
    icon: "🛠",
    title: "Complete site work",
    desc: "Site survey, installation, testing and commissioning",
  },
  {
    icon: "📋",
    title: "Single-window paperwork",
    desc: "Net-metering application, DISCOM coordination, PM Surya Ghar subsidy filing (if eligible)",
  },
  {
    icon: "🛡",
    title: "Handover pack",
    desc: "Manufacturer warranty cards (panels & inverter), test reports and user manual",
  },
];

/** The customer-facing acknowledgement shown just above the signature pad —
 * fixed copy, not part of the editable terms list. */
export const AGREEMENT_ACKNOWLEDGEMENT =
  "I confirm I have read and understood this agreement, including that without AMC, the installer is not responsible for warranty, service or system performance after 12 months.";

export type EquipmentRow = {
  label: string;
  /** Keywords used to find a matching quote component row for warranty
   * lookup — mirrors QuoteDocument's findWarrantyYears pattern. */
  keywords: string[];
};

/** The 6 fixed equipment slots shown in the agreement's equipment table.
 * Make/model data isn't captured anywhere yet — Panels/Inverter make comes
 * from the linked quote's panel_make/inverter_make, everything else (model,
 * and make for the remaining 4 rows) renders as an on-paper placeholder
 * until that data has a real home. */
export const EQUIPMENT_ROWS: EquipmentRow[] = [
  { label: "Solar Panels", keywords: ["panel"] },
  { label: "Inverter", keywords: ["inverter"] },
  { label: "DC & AC Cabling", keywords: ["cabl"] },
  { label: "ACDB", keywords: ["acdb"] },
  { label: "DCDB", keywords: ["dcdb"] },
  { label: "Surge Protection (SPD)", keywords: ["surge", "spd"] },
];
