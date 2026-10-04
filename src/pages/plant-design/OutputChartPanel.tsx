// Output estimate's right-hand chart pane: the typical year's 12 monthly
// totals as bars, drilling into one month's typical-day hourly profile on
// click. Both levels read straight off handleCalculate's one full-year
// computeOutput pass (monthlyKWh / hourlyByMonth) - there's deliberately
// no per-day-of-month view, since the irradiance input is NASA POWER's
// monthly climatology (one average per month), so every day within a month
// would compute to near-identical bars.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// computeOutput's hourly buckets start at 5:00 (its sampling window is 5-19h).
const FIRST_HOUR = 5;

const ACCENT = 'var(--app-accent, #2563eb)';
const ACCENT_MUTED = '#93b4f5';

export function formatKWh(v: number) {
  return `${v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString('en-IN')} kWh`;
}

function hourLabel(h: number) {
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${suffix}`;
}

function sourceNote(ghiStatus: string) {
  if (ghiStatus === 'ready') return 'Typical-year estimate from NASA POWER 2001-2020 monthly irradiance averages. Actual output will vary with each year\'s weather.';
  if (ghiStatus === 'loading') return 'Fetching this site\'s irradiance data - currently showing illustrative sample averages.';
  return 'Based on illustrative sample irradiance averages, not this site\'s own data.';
}

interface OutputChartPanelProps {
  result: { totalKWh: number; monthlyKWh?: number[]; hourlyByMonth?: number[][] } | null;
  drillMonth: number | null;
  onDrillMonth: (m: number | null) => void;
  ghiStatus: string;
  isMobile: boolean;
}

export default function OutputChartPanel({ result, drillMonth, onDrillMonth, ghiStatus, isMobile }: OutputChartPanelProps) {
  const chartHeight = isMobile ? 260 : 360;

  if (!result?.monthlyKWh || !result.hourlyByMonth) {
    return (
      <div className="pde-step1-card pde-output-chart">
        <div className="pde-field-sm-hint">Calculating…</div>
      </div>
    );
  }

  const { monthlyKWh, hourlyByMonth } = result;

  if (drillMonth === null) {
    const data = monthlyKWh.map((kWh, m) => ({ name: MONTH_SHORT[m], kWh }));
    const best = monthlyKWh.indexOf(Math.max(...monthlyKWh));
    const worst = monthlyKWh.indexOf(Math.min(...monthlyKWh));
    return (
      <div className="pde-step1-card pde-output-chart">
        <div className="pde-output-chart-header">
          <div>
            <div className="pde-output-chart-title">Monthly output</div>
            <div className="pde-output-chart-sub">Typical year · click a month to see its hourly profile</div>
          </div>
          <div className="pde-output-chart-stats">
            <span>Best: <strong>{MONTH_SHORT[best]}</strong> {formatKWh(monthlyKWh[best])}</span>
            <span>Lowest: <strong>{MONTH_SHORT[worst]}</strong> {formatKWh(monthlyKWh[worst])}</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#eef0f3" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} interval={0} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} tickFormatter={(v) => Number(v).toLocaleString('en-IN')} />
            <Tooltip cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} formatter={(v: unknown) => [formatKWh(Number(v)), 'Output']} />
            <Bar dataKey="kWh" radius={[4, 4, 0, 0]} style={{ cursor: 'pointer' }} onClick={(_d: unknown, i: number) => onDrillMonth(i)}>
              {data.map((d) => <Cell key={d.name} fill={ACCENT} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="pde-field-sm-hint pde-output-chart-note">{sourceNote(ghiStatus)}</div>
      </div>
    );
  }

  const hours = hourlyByMonth[drillMonth];
  const data = hours.map((kWh, i) => ({ name: hourLabel(FIRST_HOUR + i), kWh }));
  const dayTotal = hours.reduce((a, b) => a + b, 0);
  const peakIdx = hours.indexOf(Math.max(...hours));
  // Same y-axis ceiling for every month, so stepping between months with
  // the arrows shows real seasonal differences instead of each curve
  // rescaling itself to fill the chart.
  const yMax = Math.max(...hourlyByMonth.flat()) || 1;

  return (
    <div className="pde-step1-card pde-output-chart">
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
          <span>Month: <strong>{formatKWh(monthlyKWh[drillMonth])}</strong></span>
          <span>Peak: <strong>{hourLabel(FIRST_HOUR + peakIdx)}</strong></span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eef0f3" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} interval={isMobile ? 2 : 1} />
          <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} domain={[0, Math.ceil(yMax)]} tickFormatter={(v) => Number(v).toLocaleString('en-IN')} />
          <Tooltip formatter={(v: unknown) => [formatKWh(Number(v)), 'Output']} />
          <Area type="monotone" dataKey="kWh" stroke={ACCENT} strokeWidth={2} fill={ACCENT_MUTED} fillOpacity={0.35} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="pde-field-sm-hint pde-output-chart-note">{sourceNote(ghiStatus)}</div>
    </div>
  );
}
