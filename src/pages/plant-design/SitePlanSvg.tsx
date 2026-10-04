// A static, non-interactive 2D site plan for the Design Report: satellite
// backdrop, roofs, obstacles and panels, north arrow and scale bar, framed
// on a given area (the whole site, or one roof). Deliberately separate from
// the editor's own plan <svg> - that one is wired into every editing
// interaction and its own zoom/pan state, none of which a report needs.
//
// Exports as true vector (data-pdf-vector, see designReportPdf.ts), so it
// sticks to what svg2pdf.js handles: literal colors (no CSS variables),
// plain shapes, and the backdrop as an already-inlined data URL (an
// external href wouldn't load inside the PDF converter).
//
// World space is the engine's: meters, x = east, y = north. SVG y grows
// downward, so every y is negated on the way in (north stays up).

export interface SitePlanData {
  roofs: { id: any; label: string; polygon: { x: number; y: number }[] }[];
  // One footprint (4 corners) per placed panel, already rotated.
  panels: { roofId: any; corners: { x: number; y: number }[] }[];
  obstacles: { polygon: { x: number; y: number }[]; round: boolean; cx: number; cy: number; r: number }[];
  // Satellite image centered on the site origin (0,0), as a data URL.
  backdrop: { dataUrl: string; widthMeters: number; heightMeters: number } | null;
}

interface Bounds { minX: number; maxX: number; minY: number; maxY: number }

export function boundsOf(points: { x: number; y: number }[]): Bounds {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const ASPECT = 4 / 3;

// Grows `b` by `padFrac` of its own size (at least `minPad` meters per side)
// and then to ASPECT, keeping it centered.
function frame(b: Bounds, padFrac: number, minPad: number) {
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const pad = Math.max(Math.max(w, h) * padFrac, minPad);
  let fw = w + 2 * pad, fh = h + 2 * pad;
  if (fw / fh < ASPECT) fw = fh * ASPECT; else fh = fw / ASPECT;
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  return { x: cx - fw / 2, y: cy - fh / 2, w: fw, h: fh };
}

function niceLength(target: number) {
  const pow = 10 ** Math.floor(Math.log10(target));
  const n = target / pow;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
}

const pts = (poly: { x: number; y: number }[]) => poly.map((p) => `${p.x},${-p.y}`).join(' ');

export default function SitePlanSvg({ data, focus, padFrac, minPad, highlightRoofId = null, chromeScale = 1 }: {
  data: SitePlanData;
  focus: Bounds;
  padFrac: number;
  minPad: number;
  // Close-up of one roof: that roof is outlined, the others drawn muted.
  highlightRoofId?: any;
  // Labels, north arrow and scale bar are sized as a share of the view's
  // width, so in a small figure they'd shrink with it - a small figure
  // passes >1 to keep them legible at its rendered size.
  chromeScale?: number;
}) {
  const f = frame(focus, padFrac, minPad);
  // SVG coordinates: x as-is, y negated - so the frame's top edge is -maxY.
  const vb = { x: f.x, y: -(f.y + f.h), w: f.w, h: f.h };
  const u = f.w / 100; // one "unit" = 1% of the view width, for strokes
  const c = u * chromeScale; // ... and for labels/north arrow/scale bar
  // Bar long enough to clear its own "0 … N m" labels (which scale with
  // `c`), but never more than ~40% of the view.
  const scaleLen = niceLength(Math.min(c * 20, f.w * 0.4));
  const sbX = vb.x + c * 4, sbY = vb.y + vb.h - c * 4;
  const naX = vb.x + vb.w - c * 6, naY = vb.y + c * 7;

  return (
    <svg data-pdf-vector viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} width="100%" style={{ display: 'block', background: '#e7ecdf' }}>
      <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#e7ecdf" />
      {data.backdrop && (
        <image
          href={data.backdrop.dataUrl}
          x={-data.backdrop.widthMeters / 2}
          y={-data.backdrop.heightMeters / 2}
          width={data.backdrop.widthMeters}
          height={data.backdrop.heightMeters}
          preserveAspectRatio="none"
        />
      )}

      {data.roofs.map((r) => {
        const muted = highlightRoofId != null && r.id !== highlightRoofId;
        return (
          <polygon
            key={r.id}
            points={pts(r.polygon)}
            fill="#ffffff"
            fillOpacity={muted ? 0.08 : 0.22}
            stroke={muted ? '#ffffff' : '#f97316'}
            strokeOpacity={muted ? 0.6 : 1}
            strokeWidth={u * (muted ? 0.25 : 0.45)}
          />
        );
      })}

      {data.obstacles.map((o, i) => (o.round
        ? <circle key={i} cx={o.cx} cy={-o.cy} r={o.r} fill="#6b7280" fillOpacity={0.85} stroke="#374151" strokeWidth={u * 0.15} />
        : <polygon key={i} points={pts(o.polygon)} fill="#6b7280" fillOpacity={0.85} stroke="#374151" strokeWidth={u * 0.15} />
      ))}

      {data.panels.map((p, i) => {
        const muted = highlightRoofId != null && p.roofId !== highlightRoofId;
        return (
          <polygon
            key={i}
            points={pts(p.corners)}
            fill={muted ? '#475569' : '#1e3a8a'}
            fillOpacity={muted ? 0.7 : 1}
            stroke="#93c5fd"
            strokeWidth={u * 0.08}
          />
        );
      })}

      {data.roofs.map((r) => {
        const b = boundsOf(r.polygon);
        const cx = (b.minX + b.maxX) / 2, cy = -(b.minY + b.maxY) / 2;
        const fs = c * 2.6;
        const w = r.label.length * fs * 0.6 + fs;
        return (
          <g key={`label-${r.id}`}>
            <rect x={cx - w / 2} y={cy - fs * 0.9} width={w} height={fs * 1.4} rx={fs * 0.3} fill="#111827" fillOpacity={0.7} />
            <text x={cx} y={cy + fs * 0.2} fontSize={fs} fontWeight={700} fill="#ffffff" textAnchor="middle">{r.label}</text>
          </g>
        );
      })}

      {/* North arrow */}
      <g>
        <circle cx={naX} cy={naY} r={c * 3.2} fill="#ffffff" fillOpacity={0.9} stroke="#374151" strokeWidth={c * 0.15} />
        <polygon points={`${naX},${naY - c * 2.4} ${naX - c * 1.1},${naY + c * 1.2} ${naX},${naY + c * 0.5} ${naX + c * 1.1},${naY + c * 1.2}`} fill="#111827" />
        <text x={naX} y={naY + c * 5.6} fontSize={c * 2.4} fontWeight={700} fill="#111827" textAnchor="middle">N</text>
      </g>

      {/* Scale bar */}
      <g>
        <rect x={sbX - u} y={sbY - c * 3.6} width={scaleLen + c * 2} height={c * 5} rx={c * 0.5} fill="#ffffff" fillOpacity={0.85} />
        <rect x={sbX} y={sbY} width={scaleLen / 2} height={c * 0.7} fill="#111827" />
        <rect x={sbX + scaleLen / 2} y={sbY} width={scaleLen / 2} height={c * 0.7} fill="#ffffff" stroke="#111827" strokeWidth={c * 0.1} />
        <text x={sbX} y={sbY - c * 0.9} fontSize={c * 2.1} fill="#111827">0</text>
        <text x={sbX + scaleLen} y={sbY - c * 0.9} fontSize={c * 2.1} fill="#111827" textAnchor="end">{scaleLen} m</text>
      </g>
    </svg>
  );
}
