import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  formatINR as formatINRBase,
  emiMonthly,
  loanPaybackYears,
  roundToTen,
  tenYearSavingsProjection,
  type QuoteComputeResult,
} from "../../lib/quoteCalculations";
import type { PaymentScheduleRow } from "../../api/entityPreferences";
import type { QuoteComponentRow } from "../../api/quotes";
import {
  formatINRShort as formatINRShortBase,
  formatDate,
  SEGMENT_LABELS,
  pitchLine,
  subsidyExplanationNote,
  WHATS_INCLUDED,
  installTimeline,
} from "../../lib/quoteDocumentCopy";
import "./QuoteDocument.css";

export type QuoteDocumentBranding = {
  entityName: string;
  primaryColor?: string;
  logoUrl?: string | null;
  tagline?: string;
  footerTag?: string;
  gstno?: string | null;
  address?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  typography?: { h1?: string; h2?: string; h3?: string; body?: string; small?: string };
  /** ISO 4217, e.g. "INR" -- from the owning Entity's `currency`. Defaults to
   * INR when omitted (callers that don't yet have an Entity in scope, e.g.
   * the public quote page). */
  currency?: string;
  /** e.g. "GST" -- from the owning Entity's `tax_label`, resolved
   * server-side from its country. Falls back to "GST" at render sites when
   * omitted. */
  tax_label?: string;
  /** e.g. "GSTIN" -- from the owning Entity's `tax_id_label`. Falls back to
   * "GSTIN" at render sites when omitted. */
  tax_id_label?: string;
};

export type QuoteDocumentAmc = { name: string; ratePerKw: number | null; inclusion: string[] } | null;

export type QuoteDocumentAmcPost5 = {
  enabled: boolean;
  /** Up to 3 plans, selected from the same AMC catalog as `amc`. */
  plans: { name: string; ratePerKw: number | null; inclusion: string[] }[];
};

export type QuoteDocumentLoan = {
  enabled: boolean;
  amount: number | null;
  ratePercent: number | null;
  tenureYears: number | null;
};

export type QuoteDocumentProps = {
  /** Human-readable reference (e.g. "Q-VINO-28-08-2025-WS67"), shown in
   * place of the raw numeric quote id. Null before the quote has ever been
   * saved. */
  quoteNumber: string | null;
  createdAt: string | null;
  validityDays: number | null;
  capacityKw: number;
  panelMake: string | null;
  inverterMake: string | null;
  panelType: string | null;
  notes: string | null;
  terms: string[];
  /** Always the full component-wise pricing list, regardless of whether the
   * pricing table itself is shown — warranty info in "What's included" is
   * derived from this and must keep working even when the table is hidden. */
  components: QuoteComponentRow[];
  /** Whether to render the component-wise section at all (Particulars +
   * Warranty). Defaults to true when omitted. */
  showComponentDetails?: boolean;
  /** Independent of showComponentDetails: whether to additionally show the
   * Qty/Price/Tax/Total columns and the grand-total row. When false, only
   * Particulars (with warranty note) render. Defaults to true when omitted
   * (the public quote page always wants it shown whenever there are rows;
   * the builder's live preview passes the LHS "Enable pricing" toggle). */
  showComponentPricing?: boolean;
  customerName: string;
  customerCompany?: string | null;
  customerAddress: string | null;
  customerDiscom: string | null;
  customerMobile: string | null;
  customerEmail: string | null;
  segment: string | null;
  pricePerWatt: number;
  taxRate: number;
  tariff: number;
  computed: QuoteComputeResult;
  amc: QuoteDocumentAmc;
  amcDurationYears: number | null;
  amcMode: "included" | "chargeable";
  amcPost5: QuoteDocumentAmcPost5;
  loan: QuoteDocumentLoan;
  /** EPC-configurable payment milestones (entity preference
   * `payment_schedule`) — percentages should sum to 100; each row's rupee
   * amount is derived from `computed.totalCost` here rather than passed in,
   * with the last row absorbing any rounding remainder so the rows always
   * foot exactly to the total. */
  paymentSchedule: PaymentScheduleRow[];
  branding: QuoteDocumentBranding;
  /** The customer-facing share link for this quote, if one has been generated
   * yet — rendered as a scannable QR code in the footer so a printed copy can
   * be scanned straight through to online acceptance. Omitted/null hides it. */
  shareUrl?: string | null;
  /** Optional on-screen action (e.g. an "Accept this quote" button) rendered
   * above the signature line. Only used by the public-facing page — omitted
   * entirely from print/PDF output (wrapped in `no-print`) and unused by the
   * EPC-side live preview, which doesn't pass it. */
  signatureAction?: ReactNode;
  /** Which RHS sections just changed on the LHS form — used only by the
   * EPC-side live preview to briefly flash the affected section so edits are
   * easy to spot. Omitted (or all-false) entirely by the public page, which
   * has no editable LHS. */
  highlightSections?: {
    pricing?: boolean;
    metrics?: boolean;
    amc?: boolean;
    loan?: boolean;
    components?: boolean;
  };
};

export default function QuoteDocument({
  quoteNumber,
  createdAt,
  validityDays,
  capacityKw,
  panelMake,
  inverterMake,
  panelType,
  notes,
  terms,
  components,
  showComponentDetails = true,
  showComponentPricing = true,
  customerName,
  customerCompany,
  customerAddress,
  customerDiscom,
  customerMobile,
  customerEmail,
  segment,
  pricePerWatt,
  taxRate,
  tariff,
  computed: c,
  amc,
  amcDurationYears,
  amcMode,
  amcPost5,
  loan,
  paymentSchedule,
  branding,
  shareUrl,
  signatureAction,
  highlightSections,
}: QuoteDocumentProps) {
  // Shadow the INR-defaulted base formatters with ones bound to this
  // document's currency, so every formatINR(...)/formatINRShort(...) call
  // below picks it up automatically without touching each call site.
  const formatINR = (n: number) => formatINRBase(n, branding.currency);
  const formatINRShort = (n: number) => formatINRShortBase(n, branding.currency);
  const taxLabel = branding.tax_label ?? "GST";
  const taxIdLabel = branding.tax_id_label ?? "GSTIN";

  const flashClass = (key: keyof NonNullable<QuoteDocumentProps["highlightSections"]>) =>
    highlightSections?.[key] ? " qdoc-flash" : "";

  // Scroll the RHS live preview to whichever section just changed on the LHS
  // form, so an edit anywhere in the builder is immediately visible without
  // the admin having to hunt for it in a long scrollable preview. Only ever
  // triggered by the EPC-side builder (which passes `highlightSections`) —
  // the public page passes nothing, so this never fires there.
  const pricingRef = useRef<HTMLElement>(null);
  const metricsRef = useRef<HTMLElement>(null);
  const amcRef = useRef<HTMLElement>(null);
  const loanRef = useRef<HTMLElement>(null);
  const componentsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!highlightSections) return;
    // On mobile the LHS form and RHS preview stack into a single column
    // (QuoteBuilderPage.css's 900px breakpoint) instead of sitting in
    // independently-scrollable side-by-side panes, so this scroll would
    // yank the whole page away from whatever field the admin is actively
    // typing into. Only auto-scroll on wider viewports where the preview is
    // a separate pane the admin isn't looking at while editing.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches) return;
    // Most-specific first: if a component/AMC/loan edit and a pricing/metrics
    // edit land in the same tick, prefer scrolling to the more specific
    // section rather than the generic pricing summary.
    const order: [keyof NonNullable<QuoteDocumentProps["highlightSections"]>, typeof pricingRef][] = [
      ["components", componentsRef],
      ["loan", loanRef],
      ["amc", amcRef],
      ["metrics", metricsRef],
      ["pricing", pricingRef],
    ];
    for (const [key, ref] of order) {
      if (highlightSections[key] && ref.current) {
        ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightSections]);

  // The browser's own print header/footer (page title + URL + date) is a
  // browser-chrome print-dialog setting we can't remove via CSS, but we can
  // at least stop it from surfacing the app's marketing <title> — swap in a
  // clean, customer-facing title for the duration of the print job.
  useEffect(() => {
    const previousTitle = document.title;
    const printTitle = customerName ? `Quote for ${customerName}` : "Solar Quote";
    const handleBeforePrint = () => {
      document.title = printTitle;
    };
    const handleAfterPrint = () => {
      document.title = previousTitle;
    };
    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
      document.title = previousTitle;
    };
  }, [customerName]);

  const isDCR = (panelType ?? "DCR") === "DCR";
  const isResidential = segment === "residential";
  const segLabel = SEGMENT_LABELS[segment ?? ""] ?? "Custom";

  // "What's included" shows a warranty per line item — sourced from the
  // component-wise pricing rows (matched by keyword in the particular text)
  // whenever the admin has filled one in, so it stays accurate even when the
  // component-wise pricing table itself is hidden from the customer. Falls
  // back to the generic copy in WHATS_INCLUDED when no match/value exists.
  const findWarrantyYears = (keywords: string[]): number | null => {
    const row = components.find((r) => {
      const particular = (r.particular ?? "").toLowerCase();
      return keywords.some((k) => particular.includes(k));
    });
    return row?.warranty_years ?? null;
  };
  const panelWarrantyYears = findWarrantyYears(["panel"]);
  const inverterWarrantyYears = findWarrantyYears(["inverter"]);
  const structureWarrantyYears = findWarrantyYears(["structure", "mounting"]);

  // Same keyword-match pattern as findWarrantyYears above, but for the
  // component row's `specification` text.
  const findSpecification = (keywords: string[]): string | null => {
    const row = components.find((r) => {
      const particular = (r.particular ?? "").toLowerCase();
      return keywords.some((k) => particular.includes(k));
    });
    return row?.specification ?? null;
  };
  const inverterSpec = findSpecification(["inverter"]);
  const structureSpec = findSpecification(["structure", "mounting"]);
  const cableSpec = findSpecification(["wire", "cable"]);
  const enclosureSpec = findSpecification(["acdb", "dcdb"]);
  const lightningSpec = findSpecification(["lightning"]);

  const issuedOn = createdAt ? new Date(createdAt) : new Date();
  const validity = validityDays ?? 15;
  const validTill = new Date(issuedOn.getTime() + validity * 86400000);

  const subsidyNote = c.subsidy <= 0 ? subsidyExplanationNote(segment, panelType) : null;
  const amcTotal = amc?.ratePerKw != null && amcDurationYears != null ? amc.ratePerKw * capacityKw * amcDurationYears : null;
  const amcYearly = amc?.ratePerKw != null ? amc.ratePerKw * capacityKw : null;
  const amc5Free = amcMode === "included";

  const post5Plans = amcPost5.plans.slice(0, 3);
  const post5Include = amcPost5.enabled && capacityKw > 0 && post5Plans.length > 0;
  const post5TileData = post5Plans.map((p) => {
    const ratePerKw = p.ratePerKw ?? 0;
    const yearly = Math.round(ratePerKw * capacityKw);
    return { ...p, ratePerKw, yearly, tenYr: yearly * 10 };
  });

  // Years 1-5 AMC + years 6-15 plans render as columns in one row when they
  // fit 3-across; once there are 4 tiles total (1-5 AMC + 3 post5 plans) the
  // post5 plans move to their own 3-column row instead of splitting across
  // rows mid-group.
  const combinedTileCount = (amc ? 1 : 0) + (post5Include ? post5TileData.length : 0);
  const post5OwnRow = combinedTileCount > 3;
  const gridClassForCount = (n: number) => (n === 1 ? "qdoc-tile-grid--single" : n === 2 ? "qdoc-tile-grid--pair" : "");
  // Distinct border-accent colors for each years-6-15 plan tile — kept
  // separate from "qdoc-tile--feature" (used by the years 1-5 AMC tile) so
  // no color repeats across the AMC tiles shown together.
  const POST5_TILE_STYLES = ["qdoc-tile--orange", "qdoc-tile--green-dark", "qdoc-tile--purple"];

  const loanAmount = Math.max(0, loan.amount ?? 0);
  const loanRate = loan.ratePercent ?? 0;
  const loanTenure = loan.tenureYears ?? 0;
  const loanInclude = loan.enabled && loanAmount > 0 && loanTenure > 0;
  const loanSelfFunding = Math.max(0, c.netInvestment - loanAmount);
  const loanEmi = loanInclude ? emiMonthly(loanAmount, loanRate, loanTenure) : 0;
  const loanNetMonthlyPosition = c.monthlySaving - loanEmi;
  const loanPaybackYrs = loanInclude
    ? loanPaybackYears(loanSelfFunding, c.monthlySaving, loanEmi, loanTenure)
    : 0;
  const loanTenureMonths = Math.round(loanTenure * 12);
  const loanTotalPaid = loanEmi * loanTenureMonths;
  const loanTotalInterest = Math.max(0, loanTotalPaid - loanAmount);
  const loanTariff = tariff || 9;
  const loanTotalKwh = Math.round(c.monthlyKwh * loanTenureMonths);
  const loanGeneratedValue = Math.round(loanTotalKwh * loanTariff);
  const loanValueVsPaid = loanGeneratedValue - loanTotalPaid;
  const loan10YrSavings = tenYearSavingsProjection(c.yearlyKwh, loanTariff);

  const compRowsCalc = components.map((r) => {
    const qty = r.qty ?? 0;
    const price = r.price ?? 0;
    const taxPercent = r.tax_percent ?? 0;
    const subtotal = qty * price;
    const total = subtotal + subtotal * (taxPercent / 100);
    return { particular: r.particular, qty, price, taxPercent, warrantyYears: r.warranty_years, subtotal, total };
  });
  const showComponentsTable = showComponentDetails && compRowsCalc.length > 0;
  const compTotalPrice = compRowsCalc.reduce((sum, r) => sum + r.subtotal, 0);
  const compGrandTotal = compRowsCalc.reduce((sum, r) => sum + r.total, 0);
  const compAvgTaxPercent =
    compTotalPrice > 0 ? ((compGrandTotal - compTotalPrice) / compTotalPrice) * 100 : 0;

  // Each row's amount is rounded to the nearest ₹10 except the last, which
  // absorbs whatever rounding remainder is left so the rows always foot
  // exactly to c.totalCost — same approach the old hard-coded 30/60/10 split
  // used, just generalized to however many rows the EPC has configured.
  let paymentRunningTotal = 0;
  const paymentRows = paymentSchedule.map((row, i) => {
    const isLast = i === paymentSchedule.length - 1;
    const amount = isLast ? c.totalCost - paymentRunningTotal : roundToTen(c.totalCost * (row.percent / 100));
    paymentRunningTotal += amount;
    return { ...row, amount };
  });

  const firmContact = [branding.businessEmail, branding.businessPhone].filter(Boolean).join(" · ");
  const whatsappNumber = branding.businessPhone ? branding.businessPhone.replace(/[^0-9]/g, "") : null;

  // Typography values already carry their unit (e.g. "28px") — set by the entity's
  // Typography preferences tab, don't append "px" again here.
  const style = {
    "--qdoc-primary": branding.primaryColor || "#ff6b1a",
    "--qdoc-h1": branding.typography?.h1 || "28px",
    "--qdoc-h2": branding.typography?.h2 || "22px",
    "--qdoc-h3": branding.typography?.h3 || "18px",
    "--qdoc-body": branding.typography?.body || "14px",
    "--qdoc-small": branding.typography?.small || "12px",
  } as CSSProperties;

  return (
    <div className="qdoc" style={style}>
      <div className="qdoc-toolbar no-print">
        <button type="button" className="qdoc-print-btn" onClick={() => window.print()}>
          🖨 Print / Save PDF
        </button>
      </div>

      <header className="qdoc-header">
        <div className="qdoc-brand">
          <div className="qdoc-logo">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.entityName} />
            ) : (
              <span className="qdoc-logo-fallback">{branding.entityName}</span>
            )}
          </div>
          {branding.tagline && <p className="qdoc-tagline">{branding.tagline}</p>}
          {branding.address && <p className="qdoc-creds">{branding.address}</p>}
          {firmContact && <p className="qdoc-creds">{firmContact}</p>}
          {branding.gstno && <p className="qdoc-creds">{taxIdLabel}: {branding.gstno}</p>}
        </div>
        <div className="qdoc-meta">
          <div>
            <span className="qdoc-meta-label">Quote no.</span>
            <strong>{quoteNumber ?? "DRAFT"}</strong>
          </div>
          <div className="qdoc-meta-row">
            <div>
              <span className="qdoc-meta-label">Issued</span>
              <strong>{formatDate(issuedOn)}</strong>
            </div>
            <div>
              <span className="qdoc-meta-label">Valid till</span>
              <strong>{formatDate(validTill)}</strong>
            </div>
          </div>
        </div>
      </header>

      <section className="qdoc-hero">
        <div>
          <p className="qdoc-eyebrow">Personalized proposal · {segLabel}</p>
          <h1>
            <span className="qdoc-customer-name">{customerName || "Valued customer"}</span>
            {customerCompany && <small> · {customerCompany}</small>}
          </h1>
          {customerAddress && <p className="qdoc-address">{customerAddress}</p>}
          <p className="qdoc-address qdoc-address-muted">
            {[customerDiscom, customerMobile, customerEmail].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="qdoc-pitch">
          <p>{pitchLine(segment, c)}</p>
        </div>
      </section>

      <section ref={metricsRef} className={`qdoc-metrics${flashClass("metrics")}`}>
        <div className="qdoc-metric">
          <span>System size</span>
          <strong>{capacityKw} kWp</strong>
          <em>
            {panelMake || "ALMM Tier-1 panels"}
            {!isDCR ? " (Non-DCR)" : ""}
          </em>
        </div>
        <div className="qdoc-metric qdoc-metric-accent">
          <span>Monthly savings</span>
          <strong>{formatINR(c.monthlySaving)}</strong>
          <em>at current {customerDiscom || "DISCOM"} tariff</em>
        </div>
        <div className="qdoc-metric">
          <span>Generation</span>
          <strong>{c.monthlyKwh.toLocaleString("en-IN")} kWh/mo</strong>
          <em>{c.yearlyKwh.toLocaleString("en-IN")} kWh/yr</em>
        </div>
        <div className="qdoc-metric qdoc-metric-green">
          <span>Payback</span>
          <strong>{c.paybackYrs.toFixed(1)} years</strong>
          <em>then free power</em>
        </div>
        <div className="qdoc-metric">
          <span>CO₂ avoided</span>
          <strong>{c.co2Tons.toFixed(1)} t/yr</strong>
          <em>≈ {Math.round(c.trees).toLocaleString("en-IN")} tree-equivalent</em>
        </div>
        <div className="qdoc-metric">
          <span>Lifetime savings</span>
          <strong>{formatINRShort(c.lifetimeNet)}</strong>
          <em>after recovering investment</em>
        </div>
      </section>

      <section ref={pricingRef} className={`qdoc-section${flashClass("pricing")}`}>
        <h2>Commercial summary</h2>
        <div className="qdoc-table-wrap">
        <table className="qdoc-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Calculation</th>
              <th className="qdoc-ta-r">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>System cost (ex-{taxLabel})</td>
              <td>
                <small>
                  {capacityKw} kW × ₹{pricePerWatt.toFixed(2)}/W
                </small>
              </td>
              <td className="qdoc-ta-r">{formatINR(c.baseCost)}</td>
            </tr>
            <tr>
              <td>{taxLabel} @ {taxRate.toFixed(1)}%</td>
              <td>
                <small>Solar PV generating system</small>
              </td>
              <td className="qdoc-ta-r">{formatINR(c.gstAmount)}</td>
            </tr>
            <tr className="qdoc-row-strong">
              <td>Total project cost</td>
              <td>
                <small>Inclusive of {taxLabel}</small>
              </td>
              <td className="qdoc-ta-r">{formatINR(c.totalCost)}</td>
            </tr>
            {c.subsidy > 0 ? (
              <tr className="qdoc-row-accent">
                <td>Less subsidy</td>
                <td>
                  <small>PM Surya Ghar central financial assistance</small>
                </td>
                <td className="qdoc-ta-r qdoc-amt-green">– {formatINR(c.subsidy)}</td>
              </tr>
            ) : (
              subsidyNote && (
                <tr>
                  <td colSpan={3} className="qdoc-row-note">
                    {subsidyNote}
                  </td>
                </tr>
              )
            )}
            <tr className="qdoc-row-total">
              <td>Your investment</td>
              <td>
                <small>Net of subsidy{c.subsidy > 0 ? "" : " (no subsidy applied)"}</small>
              </td>
              <td className="qdoc-ta-r">{formatINR(c.netInvestment)}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>

      <section className="qdoc-section">
        <h2>
          What's included <small className="qdoc-h2-sub">— turnkey, no surprises</small>
        </h2>
        <ul className="qdoc-incl">
          {WHATS_INCLUDED(panelMake, inverterMake, isDCR, isResidential, {
            panelWarrantyYears,
            inverterWarrantyYears,
            structureWarrantyYears,
            inverterSpec,
            structureSpec,
            cableSpec,
            enclosureSpec,
            lightningSpec,
          }).map((item, i) => (
            <li key={i}>
              <span className="qdoc-icon">{item.icon}</span>
              <div>
                <strong>{item.title}</strong>
                <span>{item.desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {showComponentsTable && (
        <section ref={componentsRef} className={`qdoc-section qdoc-components${flashClass("components")}`}>
          <h2>{showComponentPricing ? "Component-wise pricing" : "What's included"}</h2>
          <div className="qdoc-table-wrap">
          <table className="qdoc-table">
            <thead>
              <tr>
                <th>Particulars</th>
                {showComponentPricing && (
                  <>
                    <th className="qdoc-ta-r">Qty</th>
                    <th className="qdoc-ta-r">Price</th>
                    <th className="qdoc-ta-r">Tax</th>
                    <th className="qdoc-ta-r">Total</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {compRowsCalc.map((row, i) => (
                <tr key={i}>
                  <td>
                    {row.particular}
                    {row.warrantyYears != null && (
                      <small className="qdoc-comp-warranty"> · {row.warrantyYears} yr warranty</small>
                    )}
                  </td>
                  {showComponentPricing && (
                    <>
                      <td className="qdoc-ta-r">{row.qty}</td>
                      <td className="qdoc-ta-r">{formatINR(row.price)}</td>
                      <td className="qdoc-ta-r">{row.taxPercent}%</td>
                      <td className="qdoc-ta-r">{formatINR(row.total)}</td>
                    </>
                  )}
                </tr>
              ))}
              {showComponentPricing && (
                <tr className="qdoc-row-total">
                  <td>Total</td>
                  <td></td>
                  <td className="qdoc-ta-r">{formatINR(compTotalPrice)}</td>
                  <td className="qdoc-ta-r">{compAvgTaxPercent.toFixed(1)}%</td>
                  <td className="qdoc-ta-r">{formatINR(compGrandTotal)}</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </section>
      )}

      {amc || post5Include ? (
        <section ref={amcRef} className={`qdoc-section qdoc-amc${flashClass("amc")}`}>
          <h2>
            AMC <small className="qdoc-h2-sub">— we stay on the roof with you</small>
          </h2>

          {(() => {
            const amcTile = amc && (
              <article className="qdoc-tile qdoc-tile--feature" key="amc-5yr">
                <div className="qdoc-tile-tag">{amc5Free ? "Included · 5 years" : "Recommended · 5 years"}</div>
                <h3>{amc.name}</h3>
                {amc5Free ? (
                  <>
                    <p className="qdoc-tile-price">
                      Included<small> · free of cost</small>
                    </p>
                    <p className="qdoc-tile-rate">
                      Bundled with your system at no extra charge
                      {amc.ratePerKw != null
                        ? ` — worth ${formatINR(amc.ratePerKw)}/kW/yr${
                            amcTotal != null && amcDurationYears ? ` (${formatINR(amcTotal)} over ${amcDurationYears} years)` : ""
                          }.`
                        : "."}
                    </p>
                  </>
                ) : amcYearly != null ? (
                  <>
                    <p className="qdoc-tile-price">
                      {formatINR(amcYearly)}
                      <small> / year</small>
                    </p>
                    <p className="qdoc-tile-rate">
                      {formatINR(amc.ratePerKw ?? 0)}/kW/yr × {capacityKw} kW
                      {amcTotal != null && amcDurationYears ? ` · ${formatINR(amcTotal)} for ${amcDurationYears} year(s)` : ""}
                    </p>
                  </>
                ) : (
                  <p className="qdoc-tile-rate">Contact us for pricing.</p>
                )}
                {amc.inclusion.length > 0 && (
                  <ul>
                    {amc.inclusion.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
              </article>
            );

            const post5Tiles = post5Include
              ? post5TileData.map((plan, i) => (
                  <article className={`qdoc-tile ${POST5_TILE_STYLES[i % POST5_TILE_STYLES.length]}`} key={`post5-${i}`}>
                    <div className="qdoc-tile-tag">Years 6-15 · 10 years</div>
                    <h3>{plan.name}</h3>
                    <p className="qdoc-tile-price">
                      {formatINR(plan.yearly)}
                      <small> / year</small>
                    </p>
                    <p className="qdoc-tile-rate">
                      {formatINR(plan.ratePerKw)}/kW/yr × {capacityKw} kW · {formatINR(plan.tenYr)} for 10 years
                    </p>
                    {plan.inclusion.length > 0 && (
                      <ul>
                        {plan.inclusion.map((item, j) => (
                          <li key={j}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))
              : [];

            if (!post5OwnRow) {
              // Fits in a single row: years 1-5 AMC and the years 6-15 plans
              // render together as columns (<= 3 tiles total).
              const combined = [...(amcTile ? [amcTile] : []), ...post5Tiles];
              return <div className={`qdoc-tile-grid ${gridClassForCount(combined.length)}`}>{combined}</div>;
            }

            // 4 tiles total (1-5 AMC + 3 post5 plans): the 1-5 AMC keeps its
            // own row, and the 3 post5 plans move to their own 3-column row
            // rather than splitting across rows.
            return (
              <>
                <div className="qdoc-tile-grid qdoc-tile-grid--single">{amcTile}</div>
                <h3 className="qdoc-post5-heading" style={{ marginTop: 28, marginBottom: 14 }}>
                  Years 6–15 <small>— continue the same care for the next 10 years</small>
                </h3>
                <div className="qdoc-tile-grid">{post5Tiles}</div>
              </>
            );
          })()}
          {post5Include && (
            <p className="qdoc-row-note" style={{ marginTop: 12 }}>
              Years 6–15 AMC pricing shown above is indicative, based on today's rates. It is only a guide to what
              maintenance may cost after year 5 — the actual price applicable at that time will follow the AMC rates
              prevailing on that day.
            </p>
          )}
        </section>
      ) : (
        <section ref={amcRef} className={`qdoc-section qdoc-amc${flashClass("amc")}`}>
          <h2>AMC</h2>
          <article className="qdoc-tile qdoc-tile--chargeable">
            <div className="qdoc-tile-tag">Not included</div>
            <h3>AMC is not bundled with this quote</h3>
            <p className="qdoc-tile-rate">
              Annual maintenance is available as a chargeable add-on — ask your sales contact for current rates.
            </p>
          </article>
        </section>
      )}

      {loan.enabled && !loanInclude && (
        <section ref={loanRef} className={`qdoc-section qdoc-loan${flashClass("loan")}`}>
          <h2>
            Loan financing <small className="qdoc-h2-sub">— cashflow vs. EMI, month on month</small>
          </h2>
          <article className="qdoc-tile qdoc-tile--pending">
            <div className="qdoc-tile-tag">Pending</div>
            <h3>Loan details pending</h3>
            <p className="qdoc-tile-rate">Loan amount, rate and tenure will appear here once entered.</p>
          </article>
        </section>
      )}

      {loanInclude && (
        <section ref={loanRef} className={`qdoc-section qdoc-loan${flashClass("loan")}`}>
          <h2>
            Loan financing <small className="qdoc-h2-sub">— cashflow vs. EMI, month on month</small>
          </h2>
          <div className="qdoc-table-wrap">
          <table className="qdoc-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Basis</th>
                <th className="qdoc-ta-r">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Loan amount</td>
                <td>
                  <small>Financed by lender</small>
                </td>
                <td className="qdoc-ta-r">{formatINR(loanAmount)}</td>
              </tr>
              <tr className="qdoc-row-accent">
                <td>Self-funding</td>
                <td>
                  <small>Net investment (post-subsidy) − loan amount</small>
                </td>
                <td className="qdoc-ta-r">{formatINR(loanSelfFunding)}</td>
              </tr>
              <tr>
                <td>Rate of interest</td>
                <td>
                  <small>Per annum, reducing balance</small>
                </td>
                <td className="qdoc-ta-r">{loanRate.toFixed(2)}%</td>
              </tr>
              <tr>
                <td>Tenure</td>
                <td>
                  <small>Loan repayment period</small>
                </td>
                <td className="qdoc-ta-r">
                  {loanTenure} yr{loanTenure === 1 ? "" : "s"}
                </td>
              </tr>
              <tr className="qdoc-row-strong">
                <td>Cashflow (generation savings)</td>
                <td>
                  <small>Monthly electricity bill savings</small>
                </td>
                <td className="qdoc-ta-r qdoc-amt-green">{formatINR(c.monthlySaving)}/mo</td>
              </tr>
              <tr className="qdoc-row-strong">
                <td>Outflow (EMI)</td>
                <td>
                  <small>Loan amount × rate × tenure (standard amortization)</small>
                </td>
                <td className="qdoc-ta-r">{formatINR(loanEmi)}/mo</td>
              </tr>
              <tr className="qdoc-row-total">
                <td>Net monthly position</td>
                <td>
                  <small>Cashflow − EMI, while the loan is active</small>
                </td>
                <td className="qdoc-ta-r">
                  {loanNetMonthlyPosition >= 0 ? "+" : ""}
                  {formatINR(loanNetMonthlyPosition)}/mo
                </td>
              </tr>
              <tr className="qdoc-row-total">
                <td>Payback period (loan-financed)</td>
                <td>
                  <small>Self-funded portion recovered via net cash position</small>
                </td>
                <td className="qdoc-ta-r">{loanPaybackYrs.toFixed(1)} yrs</td>
              </tr>
            </tbody>
          </table>
          </div>
          <div className="qdoc-tile-grid">
            <article className="qdoc-tile qdoc-tile--orange">
              <div className="qdoc-tile-tag">
                Over {loanTenure} yr{loanTenure === 1 ? "" : "s"} tenure
              </div>
              <h3>Total paid, with interest</h3>
              <p className="qdoc-tile-price">{formatINR(loanTotalPaid)}</p>
              <p className="qdoc-tile-rate">
                Incl. {formatINR(loanTotalInterest)} interest on {formatINR(loanAmount)} principal
              </p>
            </article>
            <article className="qdoc-tile qdoc-tile--free">
              <div className="qdoc-tile-tag">
                Over {loanTenure} yr{loanTenure === 1 ? "" : "s"} tenure
              </div>
              <h3>Electricity generated</h3>
              <p className="qdoc-tile-price">
                {loanTotalKwh.toLocaleString("en-IN")}
                <small> kWh</small>
              </p>
              <p className="qdoc-tile-rate">
                {loanTotalKwh.toLocaleString("en-IN")} kWh × {formatINR(loanTariff)}/unit = {formatINR(loanGeneratedValue)}
              </p>
            </article>
            <article className="qdoc-tile qdoc-tile--green-dark">
              <div className="qdoc-tile-tag">
                Over {loanTenure} yr{loanTenure === 1 ? "" : "s"} tenure
              </div>
              <h3>Generated value vs. loan paid</h3>
              <p className="qdoc-tile-price">
                {loanValueVsPaid >= 0 ? "+" : ""}
                {formatINR(loanValueVsPaid)}
              </p>
              <p className="qdoc-tile-rate">
                {formatINR(loanGeneratedValue)} electricity value − {formatINR(loanTotalPaid)} total loan paid
              </p>
            </article>
            <article className="qdoc-tile qdoc-tile--green-dark qdoc-tile--wide">
              <div className="qdoc-tile-tag">Next 10 years</div>
              <h3>10-year savings projection</h3>
              <p className="qdoc-tile-price">{formatINR(loan10YrSavings)}</p>
              <p className="qdoc-tile-rate">Generation degrading 0.55%/yr, tariff held flat at {formatINR(loanTariff)}/unit</p>
            </article>
          </div>
          <p className="qdoc-row-note" style={{ marginTop: 8 }}>
            Loan-financed payback: your self-funded portion is recovered in about{" "}
            <strong>{loanPaybackYrs.toFixed(1)} years</strong>, accounting for the EMI outflow during the loan tenure
            — after which the system generates pure savings.
          </p>
        </section>
      )}

      <section className="qdoc-section">
        <h2>Payment schedule</h2>
        <div className="qdoc-table-wrap">
        <table className="qdoc-table qdoc-table-pay">
          <tbody>
            {paymentRows.map((row, i) => (
              <tr key={i}>
                <td>
                  <strong>{row.percent}%</strong> {row.label}
                </td>
                <td>{row.description}</td>
                <td className="qdoc-ta-r">
                  <strong>{formatINR(row.amount)}</strong>
                </td>
              </tr>
            ))}
            <tr className="qdoc-row-total">
              <td>Total</td>
              <td>NEFT / RTGS / Cheque to {branding.entityName}</td>
              <td className="qdoc-ta-r">{formatINR(c.totalCost)}</td>
            </tr>
          </tbody>
        </table>
        </div>
        {c.subsidy > 0 && (
          <p className="qdoc-pay-note">
            PM Surya Ghar subsidy of <strong>{formatINR(c.subsidy)}</strong> credits to your bank account ~30 days after
            net-meter activation. We handle the entire filing — you sign three forms.
          </p>
        )}
      </section>

      <section className="qdoc-section qdoc-timeline">
        <h2>From go-ahead to first units — 7 to 10 days</h2>
        <ol>
          {installTimeline(amc ? `${amc.name} begins` : "Ongoing support").map((step, i) => (
            <li key={i}>
              <span>{step.day}</span>
              <strong>{step.title}</strong>
              <em>{step.detail}</em>
            </li>
          ))}
        </ol>
      </section>

      {notes && (
        <section className="qdoc-section">
          <h2>Notes</h2>
          <p className="qdoc-notes">{notes}</p>
        </section>
      )}

      {terms.length > 0 && (
        <section className="qdoc-section">
          <h2>Terms &amp; conditions</h2>
          <ol className="qdoc-terms">
            {terms.map((term, i) => (
              <li key={i}>{term}</li>
            ))}
          </ol>
          <p className="qdoc-row-note" style={{ marginTop: 8 }}>
            This quote is valid for {validity} days from issue.
          </p>
        </section>
      )}

      {branding.businessPhone && (
        <section className="qdoc-section qdoc-cta">
          <h2>Ready to make this real?</h2>
          <p>Reply to this quote on WhatsApp or call — we'll book a site visit within 48 hours.</p>
          <div className="qdoc-cta-row no-print">
            {whatsappNumber && (
              <a
                className="qdoc-btn qdoc-btn-primary"
                href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
                  `Hi ${branding.entityName}, I'd like to proceed with quote ${quoteNumber ?? ""}.`,
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                💬 Confirm on WhatsApp
              </a>
            )}
            <a className="qdoc-btn qdoc-btn-ghost" href={`tel:${branding.businessPhone.replace(/[^0-9+]/g, "")}`}>
              📞 {branding.businessPhone}
            </a>
          </div>
        </section>
      )}

      <footer className="qdoc-footer">
        <div>
          <strong>{branding.entityName}</strong>
          {branding.address && <p>{branding.address}</p>}
          {firmContact && <p>{firmContact}</p>}
          {branding.gstno && <p>{taxIdLabel}: {branding.gstno}</p>}
          {branding.footerTag && <p className="qdoc-footer-tag">{branding.footerTag}</p>}
        </div>
        {shareUrl && (
          <div className="qdoc-qr">
            <div className="qdoc-qr-code">
              <QRCodeSVG value={shareUrl} size={64} />
            </div>
            <p className="qdoc-powered-by">
                Powered by <strong>SolarOS</strong>
            </p>
          </div>
        )}
        <div className="qdoc-sign">
          {signatureAction && <div className="qdoc-sign-action no-print">{signatureAction}</div>}
          <p className="qdoc-sign-label">Customer acceptance</p>
          <div className="qdoc-sign-line" />
          <p>Name &amp; Date</p>
        </div>
      </footer>


    </div>
  );
}
