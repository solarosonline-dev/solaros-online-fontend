// Output estimate's right-hand chart pane: the typical year's 12 monthly
// totals as bars, drilling into one month's typical-day hourly profile on
// click. Both levels read straight off handleCalculate's one full-year
// computeOutput pass (monthlyKWh / hourlyByMonth) - there's deliberately
// no per-day-of-month view, since the irradiance input is NASA POWER's
// monthly climatology (one average per month), so every day within a month
// would compute to near-identical bars.
//
// Shading: every figure has a "lost to shading" twin from the same pass
// (exactly 0 when nothing casts a shadow), so the monthly bars stack actual
// output + what shading took away, and the hourly view overlays the
// unshaded curve (actual + lost) as a dashed line - the gap is when the
// shadow hits. A roof
// dropdown (only when there's more than one roof) swaps the whole site's
// series for one roof's.
import { useState } from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// computeOutput's hourly buckets start at 5:00 (its sampling window is 5-19h).
const FIRST_HOUR = 5;
const HOURS = 15;

const ACCENT = 'var(--app-accent, #2563eb)';
const ACCENT_MUTED = '#93b4f5';
const LOSS = '#f2b866';
const UNSHADED_LINE = '#9ca3af';

// One set of output figures - the whole site, or a single roof. Built by
// summing computeOutput 'year' results grid by grid (addToOutputSeries).
export interface OutputSeries {
  totalKWh: number;
  totalLostKWh: number;
  monthlyKWh: number[];
  monthlyLostKWh: number[];
  hourlyByMonth: number[][];
  hourlyLostByMonth: number[][];
}

export function emptyOutputSeries(): OutputSeries {
  const months = () => new Array(12).fill(0);
  const hourly = () => Array.from({ length: 12 }, () => new Array(HOURS).fill(0));
  return {
    totalKWh: 0, totalLostKWh: 0,
    monthlyKWh: months(), monthlyLostKWh: months(),
    hourlyByMonth: hourly(), hourlyLostByMonth: hourly(),
  };
}

export function addToOutputSeries(into: OutputSeries, r: any) {
  into.totalKWh += r.totalKWh;
  into.totalLostKWh += r.totalLostKWh ?? 0;
  for (let m = 0; m < 12; m++) {
    into.monthlyKWh[m] += r.monthlyKWh?.[m] ?? 0;
    into.monthlyLostKWh[m] += r.monthlyLostKWh?.[m] ?? 0;
    for (let h = 0; h < HOURS; h++) {
      into.hourlyByMonth[m][h] += r.hourlyByMonth?.[m]?.[h] ?? 0;
      into.hourlyLostByMonth[m][h] += r.hourlyLostByMonth?.[m]?.[h] ?? 0;
    }
  }
}

export function formatKWh(v: number) {
  return `${v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString('en-IN')} kWh`;
}

export function formatPct(v: number) {
  return `${v < 10 ? v.toFixed(1) : Math.round(v)}%`;
}

function lossPct(actual: number, lost: number) {
  const unshaded = actual + lost;
  return unshaded > 0 ? (100 * lost) / unshaded : 0;
}

export function shadingLossPct(s: { totalKWh: number; totalLostKWh: number }) {
  return lossPct(s.totalKWh, s.totalLostKWh);
}

// Axis ticks: whole numbers normally, one decimal once the range is small
// (a loss-only view can be single-digit kWh, where rounding every tick to
// the same integer made the axis useless).
function axisTick(v: unknown) {
  const n = Number(v);
  return n.toLocaleString('en-IN', { maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 });
}

function hourLabel(h: number) {
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${suffix}`;
}

// Where the shading-loss figures stop being reliable - shown under both
// chart views, and (same wording) on the Design Report's Energy output
// page, since customers see those numbers too. See computeOutput's
// lost-energy accumulation for what *is* modelled.
export const SHADING_LIMITS_NOTE =
  'Shading loss covers shadows from the obstacles drawn in this design only. Real losses can be higher: partial shade on one panel can pull down its whole string, and nearby buildings, trees or panel rows shading each other aren\'t included.';

function sourceNote(ghiStatus: string) {
  if (ghiStatus === 'ready') return 'Typical-year estimate from NASA POWER 2001-2020 monthly irradiance averages. Actual output will vary with each year\'s weather.';
  if (ghiStatus === 'loading') return 'Fetching this site\'s irradiance data - currently showing illustrative sample averages.';
  return 'Based on illustrative sample irradiance averages, not this site\'s own data.';
}

const ALL_ROOFS = 'all';

// Clickable legend: each item toggles its series on/off. Hiding the last
// visible series is a no-op so the chart is never empty. A real button row
// (not recharts' own <Legend onClick>) so it's keyboard-reachable and
// tappable on mobile.
function SeriesToggles({ items, hidden, onChange }: {
  items: { key: string; label: string; color: string; dashed?: boolean }[];
  hidden: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  function toggle(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else if (items.filter((i) => !next.has(i.key)).length > 1) next.add(key);
    else return;
    onChange(next);
  }
  return (
    <div className="pde-output-chart-toggles">
      {items.map((i) => {
        const off = hidden.has(i.key);
        return (
          <button key={i.key} type="button" aria-pressed={!off} className={`pde-output-chart-toggle${off ? ' off' : ''}`} onClick={() => toggle(i.key)}>
            <span
              className="pde-output-chart-swatch"
              style={i.dashed ? { borderTop: `2px dashed ${i.color}`, height: 0 } : { background: i.color }}
            />
            {i.label}
          </button>
        );
      })}
    </div>
  );
}

interface OutputChartPanelProps {
  result: (OutputSeries & { roofs?: { id: any; label: string; series: OutputSeries }[] }) | null;
  drillMonth: number | null;
  onDrillMonth: (m: number | null) => void;
  ghiStatus: string;
  isMobile: boolean;
}

export default function OutputChartPanel({ result, drillMonth, onDrillMonth, ghiStatus, isMobile }: OutputChartPanelProps) {
  const [roofFilter, setRoofFilter] = useState<string>(ALL_ROOFS);
  // Which series are toggled off, per view - kept here (not reset on roof
  // or month change) so e.g. a loss-only view survives flipping roofs.
  const [monthlyHidden, setMonthlyHidden] = useState<Set<string>>(new Set());
  const [hourlyHidden, setHourlyHidden] = useState<Set<string>>(new Set());
  const chartHeight = isMobile ? 260 : 360;

  if (!result?.monthlyLostKWh) {
    return (
      <div className="pde-step1-card pde-output-chart">
        <div className="pde-field-sm-hint">Calculating…</div>
      </div>
    );
  }

  const roofOptions = result.roofs ?? [];
  // Falls back to the whole site if the selected roof has since been
  // deleted or emptied of panels.
  const selectedRoof = roofOptions.find((r) => String(r.id) === roofFilter);
  const series: OutputSeries = selectedRoof?.series ?? result;

  const roofPicker = roofOptions.length > 1 && (
    <select className="pde-output-chart-roof" value={selectedRoof ? roofFilter : ALL_ROOFS} onChange={(e) => setRoofFilter(e.target.value)}>
      <option value={ALL_ROOFS}>All roofs · {formatPct(shadingLossPct(result))} shading loss</option>
      {roofOptions.map((r) => (
        <option key={String(r.id)} value={String(r.id)}>{r.label} · {formatPct(shadingLossPct(r.series))} shading loss</option>
      ))}
    </select>
  );

  const tooltipFormatter = (v: unknown, name: unknown) => [formatKWh(Number(v)), String(name)];

  if (drillMonth === null) {
    const { monthlyKWh, monthlyLostKWh } = series;
    const data = monthlyKWh.map((kWh, m) => ({ name: MONTH_SHORT[m], actual: kWh, lost: monthlyLostKWh[m] }));
    // Loss-only view of a roof/site nothing shades: say so, rather than
    // an empty (or meaningless) chart.
    const noLossToShow = monthlyHidden.has('actual') && series.totalLostKWh === 0;
    const best = monthlyKWh.indexOf(Math.max(...monthlyKWh));
    const worst = monthlyKWh.indexOf(Math.min(...monthlyKWh));
    return (
      <div className="pde-step1-card pde-output-chart">
        {roofPicker}
        <div className="pde-output-chart-header">
          <div>
            {/* Loss-only view rescales to the losses alone, so say so -
                a tall bar here is tens of kWh, not hundreds. */}
            <div className="pde-output-chart-title">{monthlyHidden.has('actual') ? 'Monthly shading loss' : 'Monthly output'}</div>
            <div className="pde-output-chart-sub">Typical year · click a month to see its hourly profile</div>
          </div>
          <div className="pde-output-chart-stats">
            <span>Best: <strong>{MONTH_SHORT[best]}</strong> {formatKWh(monthlyKWh[best])}</span>
            <span>Lowest: <strong>{MONTH_SHORT[worst]}</strong> {formatKWh(monthlyKWh[worst])}</span>
            <span>Shading loss: <strong>{formatPct(shadingLossPct(series))}</strong></span>
          </div>
        </div>
        <SeriesToggles
          items={[
            { key: 'actual', label: 'Output', color: ACCENT },
            { key: 'lost', label: 'Lost to shading', color: LOSS },
          ]}
          hidden={monthlyHidden}
          onChange={setMonthlyHidden}
        />
        {noLossToShow ? (
          <div className="pde-output-chart-empty" style={{ height: chartHeight }}>
            No shading loss - nothing on {selectedRoof ? 'this roof' : 'this site'} casts a shadow on the panels during the year.
          </div>
        ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#eef0f3" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} interval={0} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} tickFormatter={axisTick} />
            <Tooltip cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} formatter={tooltipFormatter} />
            <Bar dataKey="actual" name="Output" stackId="m" fill={ACCENT} hide={monthlyHidden.has('actual')} radius={monthlyHidden.has('lost') ? [4, 4, 0, 0] : 0} style={{ cursor: 'pointer' }} onClick={(_d: unknown, i: number) => onDrillMonth(i)} />
            <Bar dataKey="lost" name="Lost to shading" stackId="m" fill={LOSS} hide={monthlyHidden.has('lost')} radius={[4, 4, 0, 0]} style={{ cursor: 'pointer' }} onClick={(_d: unknown, i: number) => onDrillMonth(i)} />
          </BarChart>
        </ResponsiveContainer>
        )}
        <div className="pde-field-sm-hint pde-output-chart-note">{sourceNote(ghiStatus)}<br />{SHADING_LIMITS_NOTE}</div>
      </div>
    );
  }

  const hours = series.hourlyByMonth[drillMonth];
  const lostHours = series.hourlyLostByMonth[drillMonth];
  const data = hours.map((kWh, i) => ({ name: hourLabel(FIRST_HOUR + i), actual: kWh, unshaded: kWh + lostHours[i] }));
  const dayTotal = hours.reduce((a, b) => a + b, 0);
  const peakIdx = hours.indexOf(Math.max(...hours));
  // Same y-axis ceiling for every month, so stepping between months with
  // the arrows shows real seasonal differences instead of each curve
  // rescaling itself to fill the chart.
  const yMax = Math.max(...series.hourlyByMonth.flatMap((hs, m) => hs.map((v, h) => v + series.hourlyLostByMonth[m][h]))) || 1;

  return (
    <div className="pde-step1-card pde-output-chart">
      {roofPicker}
      <div className="pde-output-chart-header">
        <div>
          <button className="pde-output-chart-back" onClick={() => onDrillMonth(null)}>← All months</button>
          <div className="pde-output-chart-title-row">
            <button className="pde-output-chart-step" aria-label="Previous month" onClick={() => onDrillMonth((drillMonth + 11) % 12)}>‹</button>
            <div className="pde-output-chart-title">{MONTH_LONG[drillMonth]} · typical day</div>
            <button className="pde-output-chart-step" aria-label="Next month" onClick={() => onDrillMonth((drillMonth + 1) % 12)}>›</button>
          </div>
          <div className="pde-output-chart-sub">Hourly output on an average day this month</div>
        </div>
        <div className="pde-output-chart-stats">
          <span>Per day: <strong>{formatKWh(dayTotal)}</strong></span>
          <span>Month: <strong>{formatKWh(series.monthlyKWh[drillMonth])}</strong></span>
          <span>Peak: <strong>{hourLabel(FIRST_HOUR + peakIdx)}</strong></span>
          <span>Shading loss: <strong>{formatPct(lossPct(series.monthlyKWh[drillMonth], series.monthlyLostKWh[drillMonth]))}</strong></span>
        </div>
      </div>
      <SeriesToggles
        items={[
          { key: 'actual', label: 'Output', color: ACCENT },
          { key: 'unshaded', label: 'Without shading', color: UNSHADED_LINE, dashed: true },
        ]}
        hidden={hourlyHidden}
        onChange={setHourlyHidden}
      />
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef0f3" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} interval={isMobile ? 2 : 1} />
          <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} domain={[0, Math.ceil(yMax)]} tickFormatter={axisTick} />
          <Tooltip formatter={tooltipFormatter} />
          <Area type="monotone" dataKey="actual" name="Output" stroke={ACCENT} strokeWidth={2} fill={ACCENT_MUTED} fillOpacity={0.35} hide={hourlyHidden.has('actual')} />
          <Line type="monotone" dataKey="unshaded" name="Without shading" stroke={UNSHADED_LINE} strokeWidth={1.5} strokeDasharray="5 4" dot={false} hide={hourlyHidden.has('unshaded')} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="pde-field-sm-hint pde-output-chart-note">{sourceNote(ghiStatus)}<br />{SHADING_LIMITS_NOTE}</div>
    </div>
  );
}
