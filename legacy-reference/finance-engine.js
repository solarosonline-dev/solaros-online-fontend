/**
 * SolarOS — Solar Financial Engine
 *
 * Standalone, dependency-free module. Pure functions/classes only — no DOM,
 * no fetch, no KV access — so the exact same file can be:
 *   - loaded as a classic <script> in the browser (admin/resco-proposal.js
 *     etc.) → exposes `window.SolarFinanceEngine`
 *   - `require()`'d / `import`'d from the Cloudflare Worker
 *     (backend/worker.js) so proposal math is never duplicated between
 *     client-side preview and server-side persistence.
 *
 * Tree:
 *   SolarFinanceEngine
 *     ├── SolarGenerationEngine   — irradiation/degradation/shading → yearly units
 *     ├── FinancialEngine         — PMT/EMI, IRR, NPV, DSCR, depreciation, tax, salvage
 *     ├── RiskEngine              — credit/lease/roof/payment risk → risk-adjusted terms
 *     ├── PricingEngine           — savings %, tariff, recovery, IRR, margin, buyout, verdict
 *     └── RescoProposalEngine     — orchestrator: builds one full year-by-year proposal
 *
 * All money amounts are plain numbers (₹). All percentages are given as
 * numbers like `18` (meaning 18%), not `0.18`, unless a param name ends in
 * "Rate" and is documented as a fraction.
 */

(function (globalObj, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = mod;
  }
  if (globalObj) {
    globalObj.SolarFinanceEngine = mod;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  /* ============================================================
     Small shared helpers
  ============================================================ */

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function isFiniteNum(n) {
    return typeof n === "number" && isFinite(n);
  }

  /* ============================================================
     1. SOLAR GENERATION ENGINE
     Turns plant size + site assumptions into a year-by-year and
     month-by-month generation schedule.
  ============================================================ */

  class SolarGenerationEngine {

    /**
     * Annual generation in Year 1 (before degradation).
     * @param {number} plantKW - plant capacity (kWp)
     * @param {number} specificYield - kWh/kWp/year from PVGIS/NASA POWER for
     *   the site (India rooftop typically 1400-1700; default 1500)
     * @param {number} shadingLossPercent - % lost to shading/soiling/misc (0-100)
     */
    static annualGeneration(plantKW, specificYield = 1500, shadingLossPercent = 0) {
      const effectiveYield = specificYield * (1 - (shadingLossPercent || 0) / 100);
      return round2(plantKW * effectiveYield);
    }

    /** Even monthly split of an annual figure. */
    static monthlyGeneration(annualUnits) {
      return round2(annualUnits / 12);
    }

    /**
     * Seasonal monthly split. `monthlyWeights` is a 12-length array that
     * sums to 1 (fraction of annual generation falling in that month).
     * Falls back to a generic North-India-ish rooftop profile (summer-peaked,
     * monsoon dip) when no weights are supplied.
     */
    static monthlySeasonalGeneration(annualUnits, monthlyWeights) {
      const DEFAULT_WEIGHTS = [
        0.075, 0.078, 0.090, 0.095, 0.098, 0.082,
        0.070, 0.072, 0.082, 0.088, 0.080, 0.070,
      ];
      const weights = (Array.isArray(monthlyWeights) && monthlyWeights.length === 12)
        ? monthlyWeights
        : DEFAULT_WEIGHTS;
      const sum = weights.reduce((a, b) => a + b, 0) || 1;
      return weights.map((w) => round2(annualUnits * (w / sum)));
    }

    /**
     * Generation in a given plant year after cumulative module degradation.
     * @param {number} baseAnnualUnits - Year-1 annual generation
     * @param {number} year - 1-indexed plant year (1 = first year, no degradation yet)
     * @param {number} annualDegradationPercent - typical panel degradation, ~0.5-0.7%/yr
     */
    static degradedGeneration(baseAnnualUnits, year, annualDegradationPercent = 0.7) {
      const factor = Math.pow(1 - annualDegradationPercent / 100, Math.max(0, year - 1));
      return round2(baseAnnualUnits * factor);
    }

    /**
     * Full year-by-year generation schedule for the AMC/PPA tenure.
     * Returns [{ year, units }] for year = 1..years.
     */
    static generationSchedule(plantKW, years, opts = {}) {
      const {
        specificYield = 1500,
        shadingLossPercent = 0,
        annualDegradationPercent = 0.7,
      } = opts;
      const baseAnnual = SolarGenerationEngine.annualGeneration(plantKW, specificYield, shadingLossPercent);
      const schedule = [];
      for (let year = 1; year <= years; year++) {
        schedule.push({
          year,
          units: SolarGenerationEngine.degradedGeneration(baseAnnual, year, annualDegradationPercent),
        });
      }
      return schedule;
    }
  }

  /* ============================================================
     2. FINANCIAL ENGINE
     Loan amortization, IRR/NPV, DSCR, depreciation & tax benefit,
     salvage value.
  ============================================================ */

  class FinancialEngine {

    /**
     * Annual capital recovery (PMT). Same formula as before, kept for
     * backward-compatible callers.
     */
    static annualCapitalRecovery(projectCost, roiPercent, recoveryYears) {
      const r = roiPercent / 100;
      if (r === 0) return projectCost / recoveryYears;
      return (
        projectCost *
        (r * Math.pow(1 + r, recoveryYears)) /
        (Math.pow(1 + r, recoveryYears) - 1)
      );
    }

    /** Monthly EMI for a loan (PMT on a monthly-compounded basis). */
    static emiMonthly(projectCost, annualRoiPercent, tenureYears) {
      const r = (annualRoiPercent / 100) / 12;
      const n = tenureYears * 12;
      if (r === 0) return projectCost / n;
      return (
        projectCost *
        (r * Math.pow(1 + r, n)) /
        (Math.pow(1 + r, n) - 1)
      );
    }

    /**
     * Full annual loan amortization schedule.
     * Returns [{ year, openingBalance, interest, principal, payment, closingBalance }]
     */
    static loanAmortizationSchedule(projectCost, roiPercent, tenureYears) {
      const payment = FinancialEngine.annualCapitalRecovery(projectCost, roiPercent, tenureYears);
      const r = roiPercent / 100;
      let balance = projectCost;
      const rows = [];
      for (let year = 1; year <= tenureYears; year++) {
        const interest = balance * r;
        let principal = payment - interest;
        if (year === tenureYears) principal = balance; // clear rounding drift on final year
        const closing = Math.max(0, balance - principal);
        rows.push({
          year,
          openingBalance: round2(balance),
          interest: round2(interest),
          principal: round2(principal),
          payment: round2(interest + principal),
          closingBalance: round2(closing),
        });
        balance = closing;
      }
      return rows;
    }

    /**
     * Net Present Value.
     * @param {number} discountRatePercent - e.g. 12 (meaning 12%)
     * @param {number[]} cashflows - cashflows[0] is Year-0 (usually negative,
     *   the initial investment), cashflows[1..n] are Year 1..n net cashflows.
     */
    static npv(discountRatePercent, cashflows) {
      const r = discountRatePercent / 100;
      return round2(cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + r, t), 0));
    }

    /**
     * Internal Rate of Return via Newton-Raphson with a bisection fallback
     * (Newton-Raphson can diverge for pathological cashflow series — the
     * fallback guarantees a result whenever a sign change exists).
     * @param {number[]} cashflows - cashflows[0] negative (investment), rest inflows.
     * @returns {number|null} IRR as a percentage (e.g. 14.3), or null if it
     *   cannot be solved (e.g. all cashflows same sign).
     */
    static irr(cashflows, guessPercent = 10) {
      if (!Array.isArray(cashflows) || cashflows.length < 2) return null;
      const hasPositive = cashflows.some((c) => c > 0);
      const hasNegative = cashflows.some((c) => c < 0);
      if (!hasPositive || !hasNegative) return null;

      const npvAt = (ratePercent) => FinancialEngine.npv(ratePercent, cashflows);
      const dNpvAt = (ratePercent) => {
        const r = ratePercent / 100;
        return cashflows.reduce((acc, cf, t) => (t === 0 ? acc : acc - (t * cf) / Math.pow(1 + r, t + 1)), 0);
      };

      // Newton-Raphson
      let rate = guessPercent;
      for (let i = 0; i < 100; i++) {
        const f = npvAt(rate);
        const fPrime = dNpvAt(rate);
        if (Math.abs(f) < 1e-6) return round2(rate);
        if (fPrime === 0 || !isFiniteNum(fPrime)) break;
        const next = rate - f / fPrime;
        if (!isFiniteNum(next)) break;
        rate = next;
      }

      // Bisection fallback over a wide bracket
      let lo = -99, hi = 1000;
      let fLo = npvAt(lo), fHi = npvAt(hi);
      if ((fLo > 0 && fHi > 0) || (fLo < 0 && fHi < 0)) return null; // no sign change found
      for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        const fMid = npvAt(mid);
        if (Math.abs(fMid) < 1e-6) return round2(mid);
        if ((fMid > 0) === (fLo > 0)) { lo = mid; fLo = fMid; } else { hi = mid; }
      }
      return round2((lo + hi) / 2);
    }

    /**
     * Debt Service Coverage Ratio per year: cash available for debt service
     * (revenue - O&M, before debt service) ÷ that year's total debt payment.
     * @param {number[]} cashBeforeDebtService - per-year (revenue - O&M)
     * @param {number[]} debtService - per-year total loan payment (0 after loan closes)
     * @returns {Array<{year:number, dscr:number|null}>}
     */
    static dscrSeries(cashBeforeDebtService, debtService) {
      return cashBeforeDebtService.map((cash, i) => {
        const ds = debtService[i] || 0;
        return {
          year: i + 1,
          dscr: ds > 0 ? round2(cash / ds) : null, // null = no debt service that year (n/a)
        };
      });
    }

    /**
     * Written-Down-Value (WDV) depreciation schedule — the method used for
     * solar assets under the Indian Income Tax Act (renewable-energy
     * devices sit in the 40% WDV block as of AY 2021-22 onward). Pass a
     * different `ratePercent` for the Companies Act SLM view if needed.
     * Returns [{ year, openingWDV, depreciation, closingWDV }].
     */
    static depreciationScheduleWDV(assetCost, ratePercent = 40, years = 15) {
      const r = ratePercent / 100;
      let wdv = assetCost;
      const rows = [];
      for (let year = 1; year <= years; year++) {
        const dep = round2(wdv * r);
        const closing = round2(wdv - dep);
        rows.push({ year, openingWDV: round2(wdv), depreciation: dep, closingWDV: closing });
        wdv = closing;
      }
      return rows;
    }

    /**
     * Straight-line depreciation schedule (Companies Act view / for
     * book-keeping comparisons), spread evenly over `years` down to a
     * residual `salvagePercent` of cost.
     */
    static depreciationScheduleSLM(assetCost, years = 15, salvagePercent = 10) {
      const salvage = assetCost * (salvagePercent / 100);
      const perYear = round2((assetCost - salvage) / years);
      let wdv = assetCost;
      const rows = [];
      for (let year = 1; year <= years; year++) {
        const dep = year === years ? round2(wdv - salvage) : perYear;
        const closing = round2(wdv - dep);
        rows.push({ year, openingWDV: round2(wdv), depreciation: dep, closingWDV: closing });
        wdv = closing;
      }
      return rows;
    }

    /**
     * Tax shield generated by depreciation in each year.
     * @param {Array<{year:number, depreciation:number}>} depreciationSchedule
     * @param {number} taxRatePercent - e.g. 25 for a 25% corporate tax rate
     */
    static taxBenefit(depreciationSchedule, taxRatePercent) {
      const rate = taxRatePercent / 100;
      return depreciationSchedule.map((row) => ({
        year: row.year,
        taxSaved: round2(row.depreciation * rate),
      }));
    }

    /** Simple salvage value: cost less straight-line depreciation to a floor %. */
    static salvageValue(assetCost, usefulLifeYears, salvagePercent = 10) {
      return round2(assetCost * (salvagePercent / 100));
    }
  }

  /* ============================================================
     3. RISK ENGINE
     Deterministic scoring from inputs the sales/credit team can
     enter by hand today (no external bureau integration yet).
     Produces a 0-100 risk score (higher = riskier) and translates
     it into a tariff/discount-rate markup.
  ============================================================ */

  class RiskEngine {

    /** Credit score band → risk points (0 = safest, 100 = riskiest). */
    static creditScoreRisk(score) {
      if (score == null || !isFiniteNum(score)) return { points: 40, band: "Unknown" };
      if (score >= 750) return { points: 0, band: "Excellent" };
      if (score >= 700) return { points: 15, band: "Good" };
      if (score >= 650) return { points: 35, band: "Fair" };
      if (score >= 600) return { points: 60, band: "Weak" };
      return { points: 90, band: "Poor" };
    }

    /**
     * Risk from the customer's roof lease running out before the PPA/RESCO
     * tenure ends — the single biggest RESCO-specific risk (stranded asset).
     */
    static leaseExpiryRisk(leaseYearsRemaining, ppaTenureYears) {
      if (leaseYearsRemaining == null) return { points: 30, band: "Unknown" };
      const shortfall = ppaTenureYears - leaseYearsRemaining;
      if (shortfall <= 0) return { points: 0, band: "Covered" };
      if (shortfall <= 2) return { points: 25, band: "Minor gap" };
      if (shortfall <= 5) return { points: 55, band: "Material gap" };
      return { points: 90, band: "Severe gap" };
    }

    /** Roof ownership: owned > leased-long-term > leased-short-term > disputed. */
    static roofOwnershipRisk(ownership) {
      const table = {
        owned: { points: 0, band: "Owned" },
        leased_long: { points: 20, band: "Leased (long-term)" },
        leased_short: { points: 55, band: "Leased (short-term)" },
        disputed: { points: 95, band: "Disputed / unclear title" },
      };
      return table[ownership] || { points: 40, band: "Unknown" };
    }

    /** Payment history: number of late payments in the trailing 12 months. */
    static paymentHistoryRisk(latePaymentsLast12Months) {
      const n = latePaymentsLast12Months || 0;
      if (n === 0) return { points: 0, band: "Clean" };
      if (n <= 1) return { points: 20, band: "Minor" };
      if (n <= 3) return { points: 50, band: "Concerning" };
      return { points: 85, band: "Chronic" };
    }

    /**
     * Simple bankruptcy-probability heuristic (0-1), derived from the same
     * inputs — NOT a substitute for a real credit-bureau model. Weighted
     * blend of credit-score risk and payment-history risk.
     */
    static bankruptcyProbability({ creditScore, latePaymentsLast12Months }) {
      const creditRisk = RiskEngine.creditScoreRisk(creditScore).points / 100;
      const paymentRisk = RiskEngine.paymentHistoryRisk(latePaymentsLast12Months).points / 100;
      return round2(Math.min(1, creditRisk * 0.6 + paymentRisk * 0.4));
    }

    /**
     * Composite 0-100 risk score across all inputs, weighted by how much
     * each dimension matters for a RESCO/PPA (lease expiry & roof title
     * carry the most weight — they threaten the asset itself, not just
     * the receivable).
     */
    static compositeRiskScore({
      creditScore,
      leaseYearsRemaining,
      ppaTenureYears,
      roofOwnership,
      latePaymentsLast12Months,
    }) {
      const weights = { credit: 0.25, lease: 0.30, roof: 0.30, payment: 0.15 };
      const credit = RiskEngine.creditScoreRisk(creditScore);
      const lease = RiskEngine.leaseExpiryRisk(leaseYearsRemaining, ppaTenureYears);
      const roof = RiskEngine.roofOwnershipRisk(roofOwnership);
      const payment = RiskEngine.paymentHistoryRisk(latePaymentsLast12Months);

      const score = round2(
        credit.points * weights.credit +
        lease.points * weights.lease +
        roof.points * weights.roof +
        payment.points * weights.payment
      );

      let band;
      if (score < 20) band = "Low risk";
      else if (score < 45) band = "Moderate risk";
      else if (score < 70) band = "High risk";
      else band = "Very high risk";

      return {
        score,
        band,
        breakdown: { credit, lease, roof, payment },
        bankruptcyProbability: RiskEngine.bankruptcyProbability({ creditScore, latePaymentsLast12Months }),
      };
    }

    /**
     * Risk-adjusted tariff: adds a markup to the base tariff proportional
     * to risk score, capped at `maxMarkupPercent` (default 15%).
     */
    static riskAdjustedTariff(baseTariff, riskScore, maxMarkupPercent = 15) {
      const markupPercent = (riskScore / 100) * maxMarkupPercent;
      return round2(baseTariff * (1 + markupPercent / 100));
    }

    /**
     * Risk-adjusted discount rate for investor IRR/NPV — riskier customers
     * mean the investor should demand a higher hurdle rate.
     */
    static riskAdjustedDiscountRate(baseRatePercent, riskScore, maxAddOnPercent = 6) {
      return round2(baseRatePercent + (riskScore / 100) * maxAddOnPercent);
    }
  }

  /* ============================================================
     4. PRICING ENGINE
     Customer-facing tariff/savings and investor-facing return/exit
     metrics, plus a GREEN/AMBER/RED go-to-market recommendation.
  ============================================================ */

  class PricingEngine {

    static tariffPerUnit(requiredRevenue, annualGeneration) {
      return round2(requiredRevenue / annualGeneration);
    }

    static customerSavings(gridTariff, solarTariff) {
      return round2(((gridTariff - solarTariff) / gridTariff) * 100);
    }

    static annualSavings(annualGeneration, gridTariff, solarTariff) {
      return round2(annualGeneration * (gridTariff - solarTariff));
    }

    /** Tariff that delivers a customer-requested discount vs grid rate. */
    static tariffForDiscount(gridTariff, discountPercent) {
      return round2(gridTariff * (1 - discountPercent / 100));
    }

    static annualRevenue(annualGeneration, tariff) {
      return round2(annualGeneration * tariff);
    }

    static annualProfit(annualRevenue, annualOM) {
      return round2(annualRevenue - annualOM);
    }

    /**
     * Payback in years, from an actual per-year cashflow series (not the
     * old flat-average approximation) — first year where cumulative cash
     * recovers the investment, linearly interpolated within that year.
     * @param {number} projectCost
     * @param {number[]} annualNetCashflows - Year 1..n net cash (revenue - O&M - debt service, as relevant)
     */
    static paybackYears(projectCost, annualNetCashflows) {
      let cumulative = 0;
      for (let i = 0; i < annualNetCashflows.length; i++) {
        const prevCumulative = cumulative;
        cumulative += annualNetCashflows[i];
        if (cumulative >= projectCost) {
          const yearFraction = annualNetCashflows[i] > 0
            ? (projectCost - prevCumulative) / annualNetCashflows[i]
            : 1;
          return round2(i + yearFraction);
        }
      }
      return null; // never recovers within the given series
    }

    /**
     * Three customer-selectable billing structures, all priced off the
     * plant's GENERATED units (never the customer's actual consumption) —
     * this is a RESCO/PPA, not a net-metering deal, so under-consumption
     * doesn't reduce the bill and over-consumption is settled with the grid.
     *
     * Every plan's rupee figures are FLAT across the entire PPA tenure —
     * none of them re-derive a new number each year from that year's
     * (degrading) generation. That flat number is set once, from the cost
     * side of the deal, not the generation side:
     *
     *   fixed annual amount = PMT( installation cost × (1 + margin%),
     *                              loan interest rate, recoveryYears )
     *
     * i.e. the installation cost plus the interest cost of financing it
     * plus a margin (default 20%) on top, spread as a level annual
     * payment over `recoveryYears` (default 7). After year `recoveryYears`
     * the cost is fully recovered, but the customer's bill does NOT drop —
     * it continues at the exact same flat amount for the rest of the PPA
     * tenure (`post that same till PPA terms`), which is what makes the
     * later years pure margin and keeps the customer's monthly bill
     * predictable for the life of the agreement.
     *
     *  Plan 1 — Fixed monthly bill (PPA): one flat fixed amount every
     *    month, for every year of the tenure. If the customer consumes
     *    less than what's generated, they're still billed the same fixed
     *    amount. If they consume more, the extra units come from (and are
     *    billed by) the grid/DISCOM — outside this fixed bill entirely.
     *  Plan 2 — Fixed price per generated unit: pure ₹/unit metering on
     *    generated units (the risk-adjusted solar tariff, itself flat
     *    across the tenure), no fixed floor — the customer pays exactly
     *    tariff × units-generated that period.
     *  Plan 3 — Hybrid: a flat fixed base amount (a share of the Plan-1
     *    fixed amount) + a flat ₹/unit rate on generated units.
     *    `hybridFixedSharePercent` controls the fixed/variable split
     *    (default 50/50). Most attractive on short (5-6 yr) PPA terms.
     *
     * Every row also carries the DISCOM-equivalent bill for that year's
     * generated units (units × `gridTariff`) and how much cheaper the
     * plan is against that, so the customer can see, year by year, what
     * they'd have paid the grid for the same units vs. what this plan
     * actually costs them.
     *
     * @param {Array<{year:number, units:number, tariff:number, revenue:number}>} yearRows
     * @param {object} opts
     *   tariffUsed - flat risk-adjusted solar ₹/unit tariff (Plan 2's rate)
     *   gridTariff - customer's current grid ₹/unit tariff, for the DISCOM comparison
     *   projectCost - total installation cost (principal for the recovery calc)
     *   loanRoiPercent - interest rate used to amortize the recovery amount
     *   marginPercent - margin on top of installation cost (default 20)
     *   recoveryYears - years over which cost+interest+margin is recovered (default 7)
     *   hybridFixedSharePercent - 0-100, share of the flat fixed amount that
     *     becomes Plan 3's fixed base (rest becomes its per-unit rate)
     */
    static threePlans(yearRows, opts = {}) {
      const {
        tariffUsed = null,
        gridTariff = null,
        projectCost = null,
        loanRoiPercent = 10.5,
        marginPercent = 20,
        recoveryYears = 7,
        hybridFixedSharePercent = 50,
      } = opts;

      const tenureYears = yearRows.length;
      const effectiveRecoveryYears = Math.min(recoveryYears, tenureYears) || tenureYears || recoveryYears;

      // Flat annual/monthly amount for Plan 1 (and the fixed portion of
      // Plan 3): installation cost + interest cost + margin, spread over
      // the first `recoveryYears`, then held flat for the rest of tenure.
      const principalWithMargin = projectCost != null
        ? round2(projectCost * (1 + marginPercent / 100))
        : null;
      const fixedAnnualAmount = principalWithMargin != null
        ? round2(FinancialEngine.annualCapitalRecovery(principalWithMargin, loanRoiPercent, effectiveRecoveryYears))
        : null;
      const fixedMonthlyAmount = fixedAnnualAmount != null ? round2(fixedAnnualAmount / 12) : null;

      const discomBill = (units) => (gridTariff != null ? round2(units * gridTariff) : null);
      const cheaperPercent = (discom, solar) => (discom != null && solar != null && discom > 0)
        ? round2(((discom - solar) / discom) * 100)
        : null;

      const fixedMonthlyBill = yearRows.map((r) => {
        const discom = discomBill(r.units);
        return {
          year: r.year,
          generatedUnits: r.units,
          fixedMonthlyBill: fixedMonthlyAmount,
          fixedAnnualBill: fixedAnnualAmount,
          discomEquivalentAnnualBill: discom,
          discomEquivalentMonthlyBill: discom != null ? round2(discom / 12) : null,
          cheaperPercent: cheaperPercent(discom, fixedAnnualAmount),
        };
      });

      const fixedPerUnit = yearRows.map((r) => {
        const solarBill = tariffUsed != null ? round2(r.units * tariffUsed) : null;
        const discom = discomBill(r.units);
        return {
          year: r.year,
          generatedUnits: r.units,
          perUnitRate: tariffUsed,
          billIfAllGeneratedUnitsConsumed: solarBill,
          discomEquivalentAnnualBill: discom,
          discomEquivalentMonthlyBill: discom != null ? round2(discom / 12) : null,
          cheaperPercent: cheaperPercent(discom, solarBill),
        };
      });

      const share = Math.min(100, Math.max(0, hybridFixedSharePercent)) / 100;
      const fixedPortionAnnual = fixedAnnualAmount != null ? round2(fixedAnnualAmount * share) : null;
      const fixedPortionMonthly = fixedPortionAnnual != null ? round2(fixedPortionAnnual / 12) : null;
      const variableTargetAnnual = fixedAnnualAmount != null ? round2(fixedAnnualAmount * (1 - share)) : null;
      const baselineUnits = yearRows[0] ? yearRows[0].units : 0;
      const hybridPerUnitRate = (variableTargetAnnual != null && baselineUnits > 0)
        ? round2(variableTargetAnnual / baselineUnits)
        : 0;

      const hybrid = yearRows.map((r) => {
        const solarBill = fixedPortionAnnual != null
          ? round2(fixedPortionAnnual + hybridPerUnitRate * r.units)
          : null;
        const discom = discomBill(r.units);
        return {
          year: r.year,
          generatedUnits: r.units,
          fixedMonthlyAmount: fixedPortionMonthly,
          perUnitRate: hybridPerUnitRate,
          billIfAllGeneratedUnitsConsumed: solarBill,
          discomEquivalentAnnualBill: discom,
          discomEquivalentMonthlyBill: discom != null ? round2(discom / 12) : null,
          cheaperPercent: cheaperPercent(discom, solarBill),
        };
      });

      return {
        fixedMonthlyBill, fixedPerUnit, hybrid,
        fixedAnnualAmount, fixedMonthlyAmount, recoveryYears: effectiveRecoveryYears,
      };
    }

    /**
     * Per-year cashflow (and DSCR) for each of the three customer billing
     * plans, side by side. O&M and debt service are the SAME under every
     * plan (they're the EPC's actual costs/financing, independent of how
     * the customer is billed) — only the revenue collected differs, since
     * each plan bills the customer differently. This is what lets the EPC
     * see whether a plan the customer prefers (e.g. the short-term-friendly
     * hybrid) still keeps DSCR healthy, not just whether it looks good to
     * the customer.
     * @param {Array<{year:number, om:number, debtService:number}>} yearRows
     * @param {{fixedMonthlyBill:Array, fixedPerUnit:Array, hybrid:Array}} pricingPlans
     */
    static planCashflows(yearRows, pricingPlans) {
      const revenueFor = (plan, i) => {
        if (plan === "plan1") return pricingPlans.fixedMonthlyBill[i] ? pricingPlans.fixedMonthlyBill[i].fixedAnnualBill : null;
        if (plan === "plan2") return pricingPlans.fixedPerUnit[i] ? pricingPlans.fixedPerUnit[i].billIfAllGeneratedUnitsConsumed : null;
        return pricingPlans.hybrid[i] ? pricingPlans.hybrid[i].billIfAllGeneratedUnitsConsumed : null;
      };
      const seriesFor = (plan) => yearRows.map((r, i) => {
        const revenue = revenueFor(plan, i);
        const om = r.om || 0;
        const debtService = r.debtService || 0;
        const cashBeforeDebtService = revenue != null ? round2(revenue - om) : null;
        const netCashflow = cashBeforeDebtService != null ? round2(cashBeforeDebtService - debtService) : null;
        const dscr = (cashBeforeDebtService != null && debtService > 0) ? round2(cashBeforeDebtService / debtService) : null;
        return { year: r.year, revenue, om, debtService: round2(debtService), cashBeforeDebtService, netCashflow, dscr };
      });
      return {
        plan1: seriesFor("plan1"),
        plan2: seriesFor("plan2"),
        plan3: seriesFor("plan3"),
      };
    }

    static vendorMargin(totalRevenue, totalCosts) {
      const margin = totalRevenue - totalCosts;
      return {
        marginAmount: round2(margin),
        marginPercent: totalRevenue > 0 ? round2((margin / totalRevenue) * 100) : null,
      };
    }

    /**
     * Buyout price if the customer wants to exit the RESCO/PPA early in a
     * given plant year — the higher of (a) the loan principal still
     * outstanding, and (b) the depreciated (WDV) book value of the asset,
     * so the vendor never sells below cost recovery or book value.
     */
    static buyoutPrice({ outstandingLoanPrincipal = 0, currentWDV = 0, earlyExitPremiumPercent = 5 }) {
      const base = Math.max(outstandingLoanPrincipal, currentWDV);
      return round2(base * (1 + earlyExitPremiumPercent / 100));
    }

    /**
     * Final go/no-go recommendation, combining feasibility (revenue vs.
     * required revenue), DSCR health, investor IRR, and customer risk.
     */
    static recommendation({ requiredRevenue, expectedRevenue, dscrSeries = [], investorIRR, riskScore }) {
      const reasons = [];
      let status = "GREEN";

      const feasible = expectedRevenue >= requiredRevenue;
      if (!feasible) {
        status = "RED";
        reasons.push(`Expected revenue (₹${round2(expectedRevenue)}) is below the required revenue (₹${round2(requiredRevenue)}).`);
      }

      const worstDscr = dscrSeries
        .map((d) => d.dscr)
        .filter((v) => v != null)
        .reduce((min, v) => (min === null ? v : Math.min(min, v)), null);
      if (worstDscr !== null && worstDscr < 1.1) {
        status = worstDscr < 1.0 ? "RED" : (status === "RED" ? "RED" : "AMBER");
        reasons.push(`Minimum DSCR of ${worstDscr} is ${worstDscr < 1.0 ? "below 1.0 (loan default risk)" : "thin (below the usual 1.1-1.2x comfort band)"}.`);
      }

      if (investorIRR != null && investorIRR < 10) {
        status = status === "RED" ? "RED" : "AMBER";
        reasons.push(`Investor IRR of ${investorIRR}% is below the typical 10-14% hurdle rate for RESCO deals.`);
      }

      if (riskScore != null && riskScore >= 70) {
        status = "RED";
        reasons.push(`Composite customer risk score of ${riskScore} is in the "very high risk" band.`);
      } else if (riskScore != null && riskScore >= 45 && status === "GREEN") {
        status = "AMBER";
        reasons.push(`Composite customer risk score of ${riskScore} is in the "high risk" band.`);
      }

      if (reasons.length === 0) reasons.push("All feasibility, DSCR, IRR and risk checks passed comfortably.");

      return { status, feasible, worstDscr, reasons };
    }
  }

  /* ============================================================
     5. RESCO PROPOSAL ENGINE — orchestrator
     Builds one complete, year-by-year RESCO proposal from a single
     inputs object. This is the function the admin UI / backend call.
  ============================================================ */

  class RescoProposalEngine {

    /**
     * @param {object} inputs
     *  Plant & site:
     *    plantKW, specificYield, shadingLossPercent, annualDegradationPercent
     *  Commercial:
     *    projectCost, tenureYears, gridTariff, discountPercent (customer's requested discount vs grid)
     *  Finance:
     *    loanPercent (of projectCost financed by debt — defaults to 100, i.e. the
     *    entire project cost comes from finance/debt and equity is 0 unless the
     *    caller overrides it), loanRoiPercent, loanTenureYears,
     *    baseDiscountRatePercent (investor hurdle before risk adjustment), taxRatePercent,
     *    depreciationRatePercent (WDV, default 40)
     *  Customer pricing plans (Plan 1 fixed bill / Plan 3 hybrid fixed portion):
     *    marginPercent (margin on installation cost, default 20),
     *    marginRecoveryYears (years to recover cost+interest+margin before
     *    the flat bill becomes pure margin, default 7)
     *  O&M:
     *    annualOM, omEscalationPercent, insurance, monitoring, reserve
     *  Risk:
     *    creditScore, leaseYearsRemaining, roofOwnership, latePaymentsLast12Months
     */
    static buildProposal(inputs) {
      const {
        plantKW,
        specificYield = 1500,
        shadingLossPercent = 0,
        annualDegradationPercent = 0.7,

        projectCost,
        tenureYears = 15,
        gridTariff,
        discountPercent,

        loanPercent = 100,
        loanRoiPercent = 10.5,
        loanTenureYears,
        baseDiscountRatePercent = 12,
        taxRatePercent = 25,
        depreciationRatePercent = 40,

        annualOM = 0,
        omEscalationPercent = 3,
        insurance = 0,
        monitoring = 0,
        reserve = 0,

        creditScore,
        leaseYearsRemaining,
        roofOwnership,
        latePaymentsLast12Months,
      } = inputs;

      const effectiveLoanTenure = loanTenureYears || tenureYears;

      /* ---- 1. Generation ---- */
      const generationSchedule = SolarGenerationEngine.generationSchedule(plantKW, tenureYears, {
        specificYield, shadingLossPercent, annualDegradationPercent,
      });

      /* ---- 2. Risk ---- */
      const risk = RiskEngine.compositeRiskScore({
        creditScore, leaseYearsRemaining, ppaTenureYears: tenureYears, roofOwnership, latePaymentsLast12Months,
      });

      /* ---- 3. Tariff ---- */
      const solarTariff = discountPercent != null
        ? PricingEngine.tariffForDiscount(gridTariff, discountPercent)
        : null;
      const riskAdjustedTariff = solarTariff != null
        ? RiskEngine.riskAdjustedTariff(solarTariff, risk.score)
        : null;

      /* ---- 4. Loan ---- */
      const loanAmount = round2(projectCost * (loanPercent / 100));
      const equityAmount = round2(projectCost - loanAmount);
      const amortization = loanAmount > 0
        ? FinancialEngine.loanAmortizationSchedule(loanAmount, loanRoiPercent, effectiveLoanTenure)
        : [];

      /* ---- 5. Depreciation & tax ---- */
      const depreciationSchedule = FinancialEngine.depreciationScheduleWDV(projectCost, depreciationRatePercent, tenureYears);
      const taxBenefitSchedule = FinancialEngine.taxBenefit(depreciationSchedule, taxRatePercent);

      /* ---- 6. Per-year build-up: revenue, O&M, debt service, DSCR, cashflow ---- */
      const tariffUsed = riskAdjustedTariff != null ? riskAdjustedTariff : solarTariff;
      const yearRows = generationSchedule.map((g, i) => {
        const year = g.year;
        const revenue = tariffUsed != null ? round2(g.units * tariffUsed) : null;
        const omThisYear = round2(
          (annualOM + insurance + monitoring + reserve) * Math.pow(1 + omEscalationPercent / 100, year - 1)
        );
        const debtServiceRow = amortization[i];
        const debtService = debtServiceRow ? debtServiceRow.payment : 0;
        const cashBeforeDebtService = revenue != null ? round2(revenue - omThisYear) : null;
        const netCashflow = cashBeforeDebtService != null ? round2(cashBeforeDebtService - debtService) : null;
        const depRow = depreciationSchedule[i];
        const taxRow = taxBenefitSchedule[i];
        return {
          year,
          units: g.units,
          tariff: tariffUsed,
          revenue,
          om: omThisYear,
          debtService: round2(debtService),
          cashBeforeDebtService,
          netCashflow,
          depreciation: depRow ? depRow.depreciation : 0,
          closingWDV: depRow ? depRow.closingWDV : null,
          taxSaved: taxRow ? taxRow.taxSaved : 0,
        };
      });

      /* ---- 7. DSCR ---- */
      const dscrSeries = FinancialEngine.dscrSeries(
        yearRows.map((r) => r.cashBeforeDebtService || 0),
        yearRows.map((r) => r.debtService || 0)
      );

      /* ---- 8. Returns ----
         Two views, since the project can be 0%-equity (fully financed, the
         new default) up to 100%-equity:
           - Project IRR/NPV: unlevered, on the FULL project cost (Year 0 =
             -projectCost, then pre-debt-service cash + tax shield). Always
             computable regardless of the financing mix — this is the
             primary return metric now that equity can be ₹0.
           - Equity IRR/NPV: levered, on the equity actually invested
             (Year 0 = -equityAmount, then post-debt-service cash + tax
             shield). Null when equityAmount is 0 (nothing was invested,
             so there is no equity return to speak of — not the same as
             a bad deal). */
      const riskAdjustedDiscountRate = RiskEngine.riskAdjustedDiscountRate(baseDiscountRatePercent, risk.score);

      const projectCashflows = [
        -projectCost,
        ...yearRows.map((r) => round2((r.cashBeforeDebtService || 0) + (r.taxSaved || 0))),
      ];
      const projectIRR = FinancialEngine.irr(projectCashflows);
      const projectNPV = FinancialEngine.npv(riskAdjustedDiscountRate, projectCashflows);

      const equityCashflows = equityAmount > 0
        ? [-equityAmount, ...yearRows.map((r) => round2((r.netCashflow || 0) + (r.taxSaved || 0)))]
        : null;
      const investorIRR = equityCashflows ? FinancialEngine.irr(equityCashflows) : null;
      const investorNPV = equityCashflows ? FinancialEngine.npv(riskAdjustedDiscountRate, equityCashflows) : null;

      /* ---- 9. Payback (project-cost basis, using pre-tax net cashflow before debt service, i.e. unlevered) ---- */
      const unleveredCashflows = yearRows.map((r) => r.cashBeforeDebtService || 0);
      const paybackYears = PricingEngine.paybackYears(projectCost, unleveredCashflows);

      /* ---- 10. Revenue & vendor margin summary ---- */
      const totalRevenue = round2(yearRows.reduce((a, r) => a + (r.revenue || 0), 0));
      const totalOM = round2(yearRows.reduce((a, r) => a + (r.om || 0), 0));
      const totalDebtService = round2(yearRows.reduce((a, r) => a + (r.debtService || 0), 0));
      const vendorMargin = PricingEngine.vendorMargin(totalRevenue, projectCost + totalOM + (totalDebtService - loanAmount));

      /* ---- 11. Required revenue vs expected (feasibility) — Year-1 view, matches sample engine's shape ---- */
      const annualOMYear1 = yearRows[0] ? yearRows[0].om : 0;
      const capitalRecoveryYear1 = amortization[0] ? amortization[0].payment : FinancialEngine.annualCapitalRecovery(projectCost, baseDiscountRatePercent, tenureYears);
      const requiredRevenueYear1 = round2(capitalRecoveryYear1 + annualOMYear1);
      const expectedRevenueYear1 = yearRows[0] ? (yearRows[0].revenue || 0) : 0;

      /* ---- 12. Customer savings ---- */
      const customerSavingsPercent = (gridTariff && tariffUsed != null)
        ? PricingEngine.customerSavings(gridTariff, tariffUsed)
        : null;
      const annualSavingsYear1 = (gridTariff && tariffUsed != null && yearRows[0])
        ? PricingEngine.annualSavings(yearRows[0].units, gridTariff, tariffUsed)
        : null;

      /* ---- 13. Buyout price today (Year-0 view) ---- */
      const buyoutPriceToday = PricingEngine.buyoutPrice({
        outstandingLoanPrincipal: loanAmount,
        currentWDV: projectCost,
      });

      /* ---- 13b. Three customer-selectable pricing plans, all priced off
         generated units (never consumption). Plan 1/3's fixed component is
         derived from installation cost + interest + margin, amortized over
         `marginRecoveryYears`, then held flat for the rest of the tenure —
         not re-derived from each year's revenue. ---- */
      const pricingPlans = PricingEngine.threePlans(yearRows, {
        tariffUsed,
        gridTariff,
        projectCost,
        loanRoiPercent,
        marginPercent: inputs.marginPercent != null ? inputs.marginPercent : 20,
        recoveryYears: inputs.marginRecoveryYears != null ? inputs.marginRecoveryYears : 7,
      });

      /* ---- 13c. Per-year cashflow & DSCR under each of the three plans —
         same O&M/debt service as the base case, only the revenue collected
         differs by plan (see PricingEngine.planCashflows doc comment). ---- */
      const planCashflows = PricingEngine.planCashflows(yearRows, pricingPlans);

      /* ---- 14. Recommendation ----
         Uses projectIRR (always defined) rather than the equity IRR, since
         the equity IRR is null whenever the deal is 100%-financed. */
      const recommendation = PricingEngine.recommendation({
        requiredRevenue: requiredRevenueYear1,
        expectedRevenue: expectedRevenueYear1,
        dscrSeries,
        investorIRR: projectIRR,
        riskScore: risk.score,
      });

      return {
        inputs,
        generationSchedule,
        risk,
        tariff: { base: solarTariff, riskAdjusted: riskAdjustedTariff, used: tariffUsed },
        loan: { loanAmount, equityAmount, amortization },
        depreciationSchedule,
        taxBenefitSchedule,
        yearRows,
        dscrSeries,
        // Project-level (unlevered) return — on the FULL project cost, always
        // computable no matter the financing mix. Primary metric now that
        // the default is 100% financed / 0% equity.
        project: {
          cashflows: projectCashflows,
          irr: projectIRR,
          npv: projectNPV,
        },
        // Equity-level (levered) return — only meaningful when equity > 0.
        // `irr`/`npv` are null when equityAmount is 0 (nothing invested).
        investor: {
          cashflows: equityCashflows,
          irr: investorIRR,
          npv: investorNPV,
          discountRateUsed: riskAdjustedDiscountRate,
        },
        paybackYears,
        totals: { totalRevenue, totalOM, totalDebtService },
        vendorMargin,
        feasibility: { requiredRevenueYear1, expectedRevenueYear1 },
        customer: { customerSavingsPercent, annualSavingsYear1 },
        buyoutPriceToday,
        pricingPlans,
        planCashflows,
        recommendation,
      };
    }

    /**
     * Customer-safe export: strips out everything that reveals the EPC's
     * cost structure, margin, financing terms, or internal risk scoring —
     * i.e. anything the customer should never see in a shared proposal.
     * Returns only what the customer needs: their tariff, savings, the
     * generation they can expect, and the payback/tenure picture framed
     * from their side (not the vendor's).
     *
     * Excluded on purpose: projectCost, loan/equity split & amortization,
     * depreciation/tax schedules, vendor margin, investor IRR/NPV, risk
     * score/breakdown, buyout pricing logic internals, payback period
     * (a "recover-my-investment" concept that doesn't apply — the
     * customer never put any capital in).
     *
     * Zero-capex framing: since this is a 100%-financed RESCO/PPA from the
     * customer's side, the customer's own investment is always ₹0 —
     * `upfrontInvestment` is included explicitly (not derived from
     * projectCost, which stays hidden) so the UI never has to reach past
     * this whitelist to say "0". `yearOneReturn` is the same figure as
     * `estimatedAnnualSavingsYear1`, just named the way the customer should
     * hear it: money they keep vs. the grid, not "savings" against a bill
     * they fronted.
     */
    static customerView(proposal) {
      const { inputs, yearRows, customer, tariff, pricingPlans } = proposal;
      return {
        plantKW: inputs.plantKW,
        tenureYears: inputs.tenureYears,
        gridTariff: inputs.gridTariff,
        solarTariff: tariff.used,
        savingsPercent: customer.customerSavingsPercent,
        estimatedAnnualSavingsYear1: customer.annualSavingsYear1,
        upfrontInvestment: 0,
        yearOneReturn: customer.annualSavingsYear1,
        generationSchedule: yearRows.map((r) => ({
          year: r.year,
          estimatedUnits: r.units,
          tariff: r.tariff,
          estimatedBill: r.revenue,
        })),
        plans: {
          fixedMonthlyBill: pricingPlans.fixedMonthlyBill,
          fixedPerUnit: pricingPlans.fixedPerUnit,
          hybrid: pricingPlans.hybrid,
          // Flat figures behind Plan 1 / Plan 3's fixed base — same every
          // year of the tenure (see PricingEngine.threePlans doc comment):
          // installation cost + interest + margin, recovered over
          // `fixedAmountRecoveryYears`, then held flat till PPA end.
          fixedMonthlyAmount: pricingPlans.fixedMonthlyAmount,
          fixedAnnualAmount: pricingPlans.fixedAnnualAmount,
          fixedAmountRecoveryYears: pricingPlans.recoveryYears,
        },
      };
    }
  }

  return {
    SolarGenerationEngine,
    FinancialEngine,
    RiskEngine,
    PricingEngine,
    RescoProposalEngine,
  };
});
