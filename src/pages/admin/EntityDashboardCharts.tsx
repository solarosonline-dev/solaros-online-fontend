import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { QuoteMetrics, SegmentCapacity } from "../../api/adminMetrics";
import { formatCount, formatKw, formatPercent } from "./adminMetricsFormat";

// Small, entity-dashboard-only visuals that replace flat count tiles with
// something glanceable. Palette follows AdminMetricsCharts.tsx's convention
// of fixed, never-cycled series colors, extended with a semantic
// success/neutral/muted set since this chart shows status composition
// rather than a magnitude comparison across entities.
const COLOR_ACCEPTED = "#16a34a"; // success green
const COLOR_IN_PROGRESS = "#eab308"; // pending amber
const COLOR_DROPPED = "#94a3b8"; // muted slate — a drop isn't a failure state worth alarming on

export function QuoteStatusDonut({ quotes }: { quotes: QuoteMetrics }) {
  const data = [
    { name: "Accepted", value: quotes.quotes_accepted_count, color: COLOR_ACCEPTED },
    { name: "In progress", value: quotes.quotes_in_progress_count, color: COLOR_IN_PROGRESS },
    { name: "Dropped", value: quotes.quotes_rejected_count, color: COLOR_DROPPED },
  ];
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return <div className="entity-chart-empty">No quotes yet.</div>;
  }

  return (
    <div className="entity-quote-donut">
      <div className="entity-quote-donut-chart">
        <ResponsiveContainer width={120} height={120}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={38} outerRadius={56} startAngle={90} endAngle={-270}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip formatter={(value: unknown, name: unknown) => [formatCount(Number(value)), String(name)]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="entity-quote-donut-center">
          <div className="entity-quote-donut-center-value">{formatPercent(quotes.quote_acceptance_rate)}</div>
          <div className="entity-quote-donut-center-label">accepted</div>
        </div>
      </div>
      <ul className="entity-quote-donut-legend">
        {data.map((d) => (
          <li key={d.name}>
            <span className="entity-quote-donut-legend-dot" style={{ background: d.color }} />
            {d.name}
            <span className="entity-quote-donut-legend-value">{formatCount(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SEGMENTS: { key: "residential" | "commercial" | "industrial" | "other"; label: string; color: string }[] = [
  { key: "residential", label: "Residential", color: "#2563eb" },
  { key: "commercial", label: "Commercial", color: "#7c3aed" },
  { key: "industrial", label: "Industrial", color: "#0d9488" },
  { key: "other", label: "Other", color: "#94a3b8" },
];

export function SegmentBreakdownBar({ quotes }: { quotes: QuoteMetrics }) {
  const visible = SEGMENTS.filter((s) => (quotes[s.key] as SegmentCapacity).count > 0);
  const total = visible.reduce((sum, s) => sum + (quotes[s.key] as SegmentCapacity).count, 0);

  if (total === 0) {
    return <div className="entity-chart-empty">No segmented quotes yet.</div>;
  }

  return (
    <div className="entity-segment-bar">
      <div className="entity-segment-bar-track">
        {visible.map((s) => {
          const count = (quotes[s.key] as SegmentCapacity).count;
          const pct = (count / total) * 100;
          return <div key={s.key} className="entity-segment-bar-fill" style={{ width: `${pct}%`, background: s.color }} />;
        })}
      </div>
      <ul className="entity-segment-bar-legend">
        {visible.map((s) => {
          const seg = quotes[s.key] as SegmentCapacity;
          return (
            <li key={s.key}>
              <span className="entity-segment-bar-legend-dot" style={{ background: s.color }} />
              {s.label}
              <span className="entity-segment-bar-legend-value">
                {formatCount(seg.count)} · avg {formatKw(seg.avg_capacity_kw ?? 0)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
