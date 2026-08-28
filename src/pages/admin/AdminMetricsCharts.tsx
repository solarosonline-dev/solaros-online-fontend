import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdminEntityMetrics } from "../../api/adminMetrics";
import { formatKw, formatMs } from "./adminMetricsFormat";
import "./AdminMetrics.css";

// Categorical slots 1 (blue) and 2 (orange) from the dataviz palette —
// assigned in fixed order, never cycled: slot 1 is always p50/primary
// magnitude, slot 2 is always p95/secondary.
const SERIES_1 = "#2a78d6";
const SERIES_2 = "#eb6834";

function shortName(name: string): string {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

export function QuoteAmountByEntityChart({ entities }: { entities: AdminEntityMetrics[] }) {
  const data = entities
    .filter((e) => e.quotes.quotes_count > 0)
    .sort((a, b) => b.quotes.quotes_total_amount - a.quotes.quotes_total_amount)
    .map((e) => ({ name: shortName(e.entity_name), amount: e.quotes.quotes_total_amount }));

  if (data.length === 0) return <div className="admin-metrics-chart-empty">No quotes yet.</div>;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} stroke="#e1e0d9" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#898781" }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#898781" }} axisLine={false} tickLine={false} width={70} />
        <Tooltip formatter={(value: unknown) => [`₹${Number(value).toLocaleString("en-IN")}`, "Quote amount"]} />
        <Bar dataKey="amount" name="Quote amount" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function QuoteGenerationTimeByEntityChart({ entities }: { entities: AdminEntityMetrics[] }) {
  const data = entities
    .filter((e) => e.quotes.quote_generation_p50_ms != null)
    .map((e) => ({
      name: shortName(e.entity_name),
      p50: e.quotes.quote_generation_p50_ms ?? 0,
      p95: e.quotes.quote_generation_p95_ms ?? 0,
    }));

  if (data.length === 0) {
    return <div className="admin-metrics-chart-empty">No quote-generation timing data yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} stroke="#e1e0d9" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#898781" }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#898781" }} axisLine={false} tickLine={false} width={60} />
        <Tooltip formatter={(value: unknown) => formatMs(Number(value))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="p50" name="p50" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={24} />
        <Bar dataKey="p95" name="p95" fill={SERIES_2} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProjectCapacityByEntityChart({ entities }: { entities: AdminEntityMetrics[] }) {
  const data = entities
    .filter((e) => e.projects.total_capacity_kw > 0)
    .sort((a, b) => b.projects.total_capacity_kw - a.projects.total_capacity_kw)
    .map((e) => ({ name: shortName(e.entity_name), kw: e.projects.total_capacity_kw }));

  if (data.length === 0) return <div className="admin-metrics-chart-empty">No project capacity yet.</div>;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} stroke="#e1e0d9" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#898781" }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#898781" }} axisLine={false} tickLine={false} width={60} />
        <Tooltip formatter={(value: unknown) => formatKw(Number(value))} />
        <Bar dataKey="kw" name="Total kW" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
