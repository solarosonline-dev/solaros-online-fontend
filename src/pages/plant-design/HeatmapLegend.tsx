import type { CSSProperties } from 'react';
import { sunExposureColor, heatmapPosition } from './heatmapColor.js';

// Color key for the heatmaps (Shadow analysis, Efficiency view) - the
// shared gradient (heatmapColor.ts) as a bar, with % ticks placed by
// heatmapPosition so the bar's stretch (most of it covers 70-100%) is
// visible rather than implied. One row per active heatmap.
const TICKS = [50, 70, 80, 90, 100];
// The bar is drawn in gradient-position space, so evenly spaced samples
// along it map back to their pct with the inverse of heatmapPosition.
const BAR = `linear-gradient(to right, ${Array.from({ length: 21 }, (_, i) => {
  const t = i / 20;
  return `${sunExposureColor(100 * Math.cbrt(t))} ${t * 100}%`;
}).join(', ')})`;

export default function HeatmapLegend({ rows, style }: { rows: Array<{ key: string; title: string; low: string; high: string }>; style?: CSSProperties }) {
  if (!rows.length) return null;
  return (
    <div className="pde-heatmap-legend" style={style}>
      {rows.map((r) => (
        <div key={r.key} className="pde-heatmap-legend-row">
          <div className="pde-heatmap-legend-title">{r.title}</div>
          <div className="pde-heatmap-legend-bar" style={{ background: BAR }} />
          <div className="pde-heatmap-legend-ticks">
            {TICKS.map((t) => (
              <span key={t} style={{ left: `${heatmapPosition(t) * 100}%` }}>{t}%</span>
            ))}
          </div>
          <div className="pde-heatmap-legend-ends">
            <span>{r.low}</span>
            <span>{r.high}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
