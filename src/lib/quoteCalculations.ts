/* ============================================================
   Quote calculation engine — ported from the old repo's
   quote-render.js `compute()`. Pure function: given raw quote
   inputs, derive every number shown on the quote (breakdown,
   savings, payback, environmental impact, payment milestones).
   Nothing here is persisted server-side — same as the old system,
   both the builder preview and the public quote page recompute
   from the raw stored inputs.
============================================================ */

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
  payAdvance: number;
  payDispatch: number;
  payCommission: number;
  amcTotalCost: number | null;
};

/** PM Surya Ghar suggested subsidy ladder — residential only, used as a
 * default when no explicit subsidy amount is set. */
function subsidyForKw(kw: number, segment: string | null): number {
  if (segment !== "residential") return 0;
  if (kw <= 1) return 30000;
  if (kw <= 2) return 60000;
  return 78000;
}

function roundToTen(n: number): number {
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

  const payAdvance = roundToTen(totalCost * 0.3);
  const payDispatch = roundToTen(totalCost * 0.6);
  const payCommission = totalCost - payAdvance - payDispatch;

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
    payAdvance,
    payDispatch,
    payCommission,
    amcTotalCost,
  };
}

export function formatINR(n: number): string {
  if (!isFinite(n) || n == null) return "₹0";
  const sign = n < 0 ? "-" : "";
  const rounded = Math.round(Math.abs(n));
  const s = rounded.toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return sign + "₹" + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3);
}
