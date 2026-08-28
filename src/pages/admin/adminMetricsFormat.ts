// Shared formatting helpers for the admin dashboard + per-EPC drilldown page —
// keeps number/duration/percentage presentation consistent across both.
//
// formatPerKw defaults to INR: these views aggregate metrics across
// entities (system-admin dashboard) or look one up by id from that same
// cross-entity list (per-EPC drilldown), and the admin-metrics API doesn't
// carry a currency for those rows yet. Rather than silently mixing
// currencies or guessing, we display INR consistently here until the
// metrics endpoints are extended to carry a currency — a decision, not an
// oversight.

import { formatMoneyPerUnit } from "../../lib/money";

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
  return formatMoneyPerUnit(amount, "kW");
}
