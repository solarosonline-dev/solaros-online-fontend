/* ============================================================
   Shared money-formatting utility, backed by Intl.NumberFormat.
   Replaces the three independent hand-rolled ₹/en-IN formatters that used
   to live in quoteCalculations.ts, quoteDocumentCopy.ts, and
   adminMetricsFormat.ts.

   Every currency-formatting call site in the app should eventually route
   through here, passing the relevant Entity's `currency` (see
   src/api/entity.ts) where one is in scope. Call sites with no entity in
   scope (public quote links, cross-entity admin aggregates) fall back to
   the INR default below — that's a deliberate, documented limitation, not
   an oversight: those views don't yet have a currency to key off of.
============================================================ */

// Locale is derived from currency for now, since Entity doesn't carry a
// separate locale field yet (see app.core.countries.CountryConfig on the
// backend, which is the eventual source of this mapping). One currency ->
// one locale is a simplification that holds for every currency we support
// today (just INR); revisit if/when a currency needs multiple locales.
const CURRENCY_LOCALES: Record<string, string> = {
  INR: "en-IN",
};

const DEFAULT_CURRENCY = "INR";

function localeFor(currency: string): string {
  return CURRENCY_LOCALES[currency] ?? "en-US";
}

function safeNumber(n: number): number {
  return isFinite(n) && n != null ? n : 0;
}

/** Full, non-compact currency formatting, e.g. "₹12,34,567" / "-₹1,234". */
export function formatMoney(n: number, currency: string = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat(localeFor(currency), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(safeNumber(n));
}

/** Compact form for large amounts, e.g. "₹1.25 Cr" / "₹4.5 L".
 *  India's crore/lakh convention only applies to INR -- other currencies
 *  fall back to Intl's own "compact" notation (K/M/B) since there's no
 *  universal short-form convention to hardcode for them. */
export function formatMoneyShort(n: number, currency: string = DEFAULT_CURRENCY): string {
  const value = safeNumber(n);
  if (currency === "INR") {
    if (value >= 1e7) return "₹" + (value / 1e7).toFixed(2).replace(/\.00$/, "") + " Cr";
    if (value >= 1e5) return "₹" + (value / 1e5).toFixed(2).replace(/\.00$/, "") + " L";
    return "₹" + Math.round(value).toLocaleString(localeFor(currency));
  }
  return new Intl.NumberFormat(localeFor(currency), {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Per-unit amount, e.g. "₹1,234/kW". */
export function formatMoneyPerUnit(n: number | null, unit: string, currency: string = DEFAULT_CURRENCY): string {
  if (n == null) return "—";
  return `${formatMoney(n, currency)}/${unit}`;
}
