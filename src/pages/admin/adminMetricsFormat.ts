// Shared formatting helpers for the admin dashboard + per-EPC drilldown page —
// keeps number/duration/percentage presentation consistent across both.

export function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export function formatPercent(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatDays(days: number | null): string {
  if (days == null) return "—";
  return `${days.toFixed(1)}d`;
}

export function formatKw(kw: number): string {
  return `${kw.toLocaleString("en-IN", { maximumFractionDigits: 1 })} kW`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-IN");
}

export function formatPerKw(amount: number | null): string {
  if (amount == null) return "—";
  return `₹${Math.round(amount).toLocaleString("en-IN")}/kW`;
}
