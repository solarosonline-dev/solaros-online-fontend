/* ============================================================
   Quote calculation engine — ported from the old repo's
   quote-render.js `compute()`. Pure function: given raw quote
   inputs, derive every number shown on the quote (breakdown,
   savings, payback, environmental impact, payment milestones).
   Nothing here is persisted server-side — same as the old system,
   both the builder preview and the public quote page recompute
   from the raw stored inputs.
============================================================ */

import { formatMoney } from "./money";

export type QuoteComputeInput = {
  capacityKw: number;
  pricePerWatt: number;
  gstRate: number;
  dailyYield: number;
  tariff: number;
  applySubsidy: boolean;
  subsidyAmount: number | null;
  segment: string | null;
  amcRatePerKw: number | null;
  amcDurationYears: number | null;
};

export type QuoteComputeResult = {
  baseCost: number;
  gstAmount: number;
  totalCost: number;
  subsidy: number;
  netInvestment: number;
  dailyKwh: number;
  monthlyKwh: number;
  yearlyKwh: number;
  monthlySaving: number;
  yearlySaving: number;
  paybackYrs: number;
  lifetimeNet: number;
  co2Tons: number;
  trees: number;
  amcTotalCost: number | null;
};

/** PM Surya Ghar suggested subsidy ladder — residential only, used as a
 * default when no explicit subsidy amount is set. */
export function subsidyForKw(kw: number, segment: string | null): number {
  if (segment !== "residential") return 0;
  if (kw <= 1) return 30000;
  if (kw <= 2) return 60000;
  return 78000;
}

/** Exported for QuoteDocument's payment-schedule section, which derives each
 * milestone's rupee amount from the entity's configurable percentages. */
export function roundToTen(n: number): number {
  return Math.round(n / 10) * 10;
}

export function computeQuote(input: QuoteComputeInput): QuoteComputeResult {
  const kw = input.capacityKw || 0;
  const ppw = input.pricePerWatt || 0;
  const gst = (input.gstRate || 0) / 100;
  const yieldPerKw = input.dailyYield || 4.2;
  const tariff = input.tariff || 9;

  const baseCost = kw * 1000 * ppw;
  const gstAmount = Math.round(baseCost * gst);
  const totalCost = baseCost + gstAmount;

  const subsidy = input.applySubsidy
    ? input.subsidyAmount != null
      ? Math.max(0, input.subsidyAmount)
      : subsidyForKw(kw, input.segment)
    : 0;
  const netInvestment = Math.max(totalCost - subsidy, 0);

  const dailyKwh = kw * yieldPerKw;
  const monthlyKwh = Math.round(dailyKwh * 30);
  const yearlyKwh = Math.round(dailyKwh * 365);

  const monthlySaving = Math.round(monthlyKwh * tariff);
  const yearlySaving = monthlySaving * 12;

  const paybackYrs = yearlySaving > 0 ? netInvestment / yearlySaving : 0;

  // 25-year lifetime net savings, compounding tariff at 4%/yr, minus net investment.
  let lifetimeGross = 0;
  let yearSaving = yearlySaving;
  for (let y = 0; y < 25; y++) {
    lifetimeGross += yearSaving;
    yearSaving *= 1.04;
  }
  const lifetimeNet = lifetimeGross - netInvestment;

  const co2Tons = (yearlyKwh * 0.82) / 1000;
  const trees = co2Tons * 50;

  const amcTotalCost =
    input.amcRatePerKw != null && input.amcDurationYears != null
      ? Math.round(input.amcRatePerKw * kw * input.amcDurationYears)
      : null;

  return {
    baseCost,
    gstAmount,
    totalCost,
    subsidy,
    netInvestment,
    dailyKwh,
    monthlyKwh,
    yearlyKwh,
    monthlySaving,
    yearlySaving,
    paybackYrs,
    lifetimeNet,
    co2Tons,
    trees,
    amcTotalCost,
  };
}

/** Standard monthly-compounded loan EMI (PMT) — ported from SolarSite's
 * quote-render.js `emiMonthly()`. Used only by the optional loan-financing
 * section; independent of `computeQuote()`. */
export function emiMonthly(principal: number, annualRatePercent: number, tenureYears: number): number {
  const P = principal || 0;
  const r = (annualRatePercent || 0) / 100 / 12;
  const n = Math.round((tenureYears || 0) * 12);
  if (P <= 0 || n <= 0) return 0;
  if (r === 0) return P / n;
  return (P * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
}

/** Loan-financed payback — distinct from `paybackYrs` above (which ignores
 * financing entirely). Recovers the customer's self-funded capital outlay
 * via the net monthly cash position (monthlySaving - EMI) while the loan is
 * active, then via the full monthlySaving once the loan is paid off.
 * Ported from SolarSite's quote-render.js `loanPaybackYears()`. */
export function loanPaybackYears(
  selfFunding: number,
  monthlySaving: number,
  emi: number,
  tenureYears: number,
): number {
  if (selfFunding <= 0) return 0;
  const tenureMonths = Math.round((tenureYears || 0) * 12);
  const netPositionDuringLoan = monthlySaving - emi;

  if (netPositionDuringLoan > 0) {
    const monthsNeeded = selfFunding / netPositionDuringLoan;
    if (monthsNeeded <= tenureMonths) return monthsNeeded / 12;
    const remainingAfterTenure = selfFunding - netPositionDuringLoan * tenureMonths;
    if (monthlySaving <= 0) return Infinity;
    return (tenureMonths + remainingAfterTenure / monthlySaving) / 12;
  }
  const shortfallAtTenureEnd = selfFunding - netPositionDuringLoan * tenureMonths;
  if (monthlySaving <= 0) return Infinity;
  return (tenureMonths + shortfallAtTenureEnd / monthlySaving) / 12;
}

/** 10-year savings projection for the loan section: applies a 0.55%/yr
 * generation degradation to yearly kWh (year 1 = full output), tariff held
 * flat (no escalation) — a deliberately separate, simpler assumption from
 * `lifetimeNet` (which escalates tariff 4%/yr over 25 years), so this tile
 * doesn't reuse/alter that figure. Ported from quote-render.js lines 310-316. */
export function tenYearSavingsProjection(yearlyKwh: number, tariff: number): number {
  let savings = 0;
  let genYear = yearlyKwh;
  for (let y = 1; y <= 10; y++) {
    savings += genYear * tariff;
    genYear *= 1 - 0.0055;
  }
  return Math.round(savings);
}

/** @deprecated use formatMoney from src/lib/money.ts directly -- kept as a
 *  thin INR-defaulted wrapper so existing call sites (which don't yet pass
 *  a currency) keep rendering exactly as before. Accepts an optional
 *  currency for callers that do have one in scope (e.g. an Entity). */
export function formatINR(n: number, currency?: string): string {
  return formatMoney(n, currency);
}
