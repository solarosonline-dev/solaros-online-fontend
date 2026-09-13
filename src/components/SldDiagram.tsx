import type { SldInverterLayout } from "../api/workOrders";

// Reference Single Line Diagram for a rooftop-solar net-metering
// installation, laid out per standard MNRE/CEA-aligned DISCOM documentation
// conventions: PV strings -> DC Distribution/Combiner Box (isolator + SPD,
// per-string fuses) -> Solar Inverter(s) -> AC Distribution Box (isolator +
// SPD) -> Bi-directional Net Meter -> Grid/DISCOM Supply, plus the three
// earthing points every such filing expects (array/lightning-arrestor
// earth, DC-side earth, inverter body earth) shown as a legend rather than
// wired to a specific dynamic row, since the number of strings/inverters is
// user-driven and unbounded.
//
// Every individual DC string is drawn as its own line converging on a
// shared DC Distribution Box, and every inverter gets its own line back out
// of that box labelled with how many strings feed it -- both drawn exactly
// as entered in sld_layout, not just as system-wide totals. Multiple
// inverters converge again into a shared AC Distribution Box before the net
// meter and grid connection.
//
// There's no single binding SLD template across India's ~70 DISCOMs, so
// this is intentionally a generic-but-complete rendering of the content
// every DISCOM checklist asks for -- see the footer disclaimer.
//
// Rendered as plain SVG (crisp at any zoom/print scale, and trivially
// captured by html2canvas via captureElementAsPdf) rather than an image, so
// it's driven directly by the entered layout with no external asset.

export type SldSpecs = {
  panelWattageW: number;
  inverters: SldInverterLayout[];
};

const STRING_BOX_W = 130;
const STRING_BOX_H = 34;
const STRING_ROW_H = 46;

const BOX_W = 150;
const BOX_H = 72;
const INV_ROW_H = 88;

const GAP = 60;
const START_X = 20;
const TOP_MARGIN = 46;

function MultilineText({ x, y, lines, className }: { x: number; y: number; lines: string[]; className?: string }) {
  const offset = ((lines.length - 1) * 13) / 2;
  return (
    <text x={x} y={y - offset} textAnchor="middle" className={className}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 13}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Standard ground/earth symbol: three descending horizontal bars. Used here
 * as a fixed 3-item legend (Array/LA, DC-side, Inverter body) rather than
 * wired to a specific dynamic row, since the number of strings/inverters
 * varies per system. */
function EarthLegendItem({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <line x1={x} y1={y - 12} x2={x} y2={y} stroke="#333" strokeWidth={1.5} />
      <line x1={x - 10} y1={y} x2={x + 10} y2={y} stroke="#333" strokeWidth={1.5} />
      <line x1={x - 6.5} y1={y + 5} x2={x + 6.5} y2={y + 5} stroke="#333" strokeWidth={1.5} />
      <line x1={x - 3} y1={y + 10} x2={x + 3} y2={y + 10} stroke="#333" strokeWidth={1.5} />
      <text x={x} y={y + 24} textAnchor="middle" fontSize={10} fill="#555">
        {label}
      </text>
    </g>
  );
}

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="sld-wire" />
      <polygon
        points={`${x2 - 8},${y2 - 5} ${x2},${y2} ${x2 - 8},${y2 + 5}`}
        className="sld-arrowhead"
      />
    </g>
  );
}

export default function SldDiagram({ specs }: { specs: SldSpecs }) {
  const { panelWattageW, inverters } = specs;

  // Flattened, in entry order, grouped by inverter -- what determines the
  // vertical stacking of individual string boxes on the left.
  const flatStrings = inverters.flatMap((inv, invIdx) =>
    inv.strings.map((panels, strIdx) => ({ invIdx, strIdx, panels })),
  );
  const numStrings = Math.max(flatStrings.length, 1);
  const numInverters = Math.max(inverters.length, 1);

  const totalPanels = flatStrings.reduce((sum, s) => sum + s.panels, 0);
  const totalKwp = (totalPanels * panelWattageW) / 1000;
  const totalCapacityKw = inverters.reduce((sum, inv) => sum + inv.capacity_kw, 0);

  const X1 = START_X;
  const X2 = X1 + STRING_BOX_W + GAP;
  const X3 = X2 + BOX_W + GAP;
  const X4 = X3 + BOX_W + GAP;
  const X5 = X4 + BOX_W + GAP;
  const X6 = X5 + BOX_W + GAP;
  const width = X6 + BOX_W + 20;

  const stringsHeight = numStrings * STRING_ROW_H;
  const invertersHeight = numInverters * INV_ROW_H;
  const mainHeight = Math.max(stringsHeight, invertersHeight, BOX_H);

  const stringsTop = TOP_MARGIN + (mainHeight - stringsHeight) / 2;
  const invertersTop = TOP_MARGIN + (mainHeight - invertersHeight) / 2;
  const singleBoxCenterY = TOP_MARGIN + mainHeight / 2;

  const stringCenterY = (i: number) => stringsTop + i * STRING_ROW_H + STRING_BOX_H / 2;
  const invCenterY = (j: number) => invertersTop + j * INV_ROW_H + BOX_H / 2;

  const earthLegendY = TOP_MARGIN + mainHeight + 46;
  const notesY = earthLegendY + 44;
  const height = notesY + 40;

  return (
    <div className="sld-diagram">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Single line diagram">
        <text x={width / 2} y={20} textAnchor="middle" className="sld-title">
          Single Line Diagram — Rooftop Solar PV System
        </text>
        <text x={width / 2} y={36} textAnchor="middle" className="sld-subtitle">
          {flatStrings.length} string{flatStrings.length === 1 ? "" : "s"} · {totalPanels} panels ×{" "}
          {panelWattageW}W · {totalKwp.toFixed(2)} kWp DC · {inverters.length} inverter
          {inverters.length === 1 ? "" : "s"} · {totalCapacityKw.toFixed(1)} kW AC
        </text>

        {/* Column 1: one box per individual DC string, each labelled with
            which inverter it belongs to and how many panels are in it. */}
        {flatStrings.map((s, i) => {
          const y = stringCenterY(i);
          return (
            <g key={`str-${i}`}>
              <rect x={X1} y={y - STRING_BOX_H / 2} width={STRING_BOX_W} height={STRING_BOX_H} rx={5} className="sld-box" />
              <MultilineText
                x={X1 + STRING_BOX_W / 2}
                y={y}
                lines={[`Inv ${s.invIdx + 1} · String ${s.strIdx + 1}`, `${s.panels} panels`]}
                className="sld-box-label sld-box-label-small"
              />
              <line x1={X1 + STRING_BOX_W} y1={y} x2={X2} y2={singleBoxCenterY} className="sld-wire" />
            </g>
          );
        })}

        {/* Column 2: single shared DC Distribution Box every string
            converges on. */}
        <rect x={X2} y={singleBoxCenterY - BOX_H / 2} width={BOX_W} height={BOX_H} rx={6} className="sld-box" />
        <MultilineText
          x={X2 + BOX_W / 2}
          y={singleBoxCenterY}
          lines={["DC Distribution Box", "Isolator + SPD", "Per-string fuses"]}
          className="sld-box-label"
        />

        {/* Column 3: one box per inverter, fed by however many strings were
            assigned to it -- the line out of the DCDB to each inverter is
            itself labelled with that count, per DISCOM SLDs showing string-
            to-inverter routing explicitly. */}
        {inverters.map((inv, j) => {
          const y = invCenterY(j);
          const midX = (X2 + BOX_W + X3) / 2;
          return (
            <g key={`inv-${j}`}>
              <line x1={X2 + BOX_W} y1={singleBoxCenterY} x2={X3} y2={y} className="sld-wire" />
              <text x={midX} y={(singleBoxCenterY + y) / 2 - 4} textAnchor="middle" className="sld-line-label">
                {inv.strings.length} string{inv.strings.length === 1 ? "" : "s"}
              </text>
              <rect x={X3} y={y - BOX_H / 2} width={BOX_W} height={BOX_H} rx={6} className="sld-box" />
              <MultilineText
                x={X3 + BOX_W / 2}
                y={y}
                lines={[`Inverter ${j + 1}`, `${inv.capacity_kw} kW`, `${inv.strings.length} string${inv.strings.length === 1 ? "" : "s"}`]}
                className="sld-box-label"
              />
              <line x1={X3 + BOX_W} y1={y} x2={X4} y2={singleBoxCenterY} className="sld-wire" />
            </g>
          );
        })}

        {/* Column 4: single shared AC Distribution Box every inverter's
            output converges back on. */}
        <rect x={X4} y={singleBoxCenterY - BOX_H / 2} width={BOX_W} height={BOX_H} rx={6} className="sld-box" />
        <MultilineText
          x={X4 + BOX_W / 2}
          y={singleBoxCenterY}
          lines={["AC Distribution Box", "Isolator + SPD"]}
          className="sld-box-label"
        />

        <Arrow x1={X4 + BOX_W} y1={singleBoxCenterY} x2={X5} y2={singleBoxCenterY} />
        <rect x={X5} y={singleBoxCenterY - BOX_H / 2} width={BOX_W} height={BOX_H} rx={6} className="sld-box" />
        <MultilineText x={X5 + BOX_W / 2} y={singleBoxCenterY} lines={["Bi-directional", "Net Meter"]} className="sld-box-label" />

        <Arrow x1={X5 + BOX_W} y1={singleBoxCenterY} x2={X6} y2={singleBoxCenterY} />
        <rect x={X6} y={singleBoxCenterY - BOX_H / 2} width={BOX_W} height={BOX_H} rx={6} className="sld-box" />
        <MultilineText x={X6 + BOX_W / 2} y={singleBoxCenterY} lines={["Grid /", "DISCOM Supply"]} className="sld-box-label" />

        {/* Earthing legend -- three points every DISCOM net-metering filing
            expects (array/lightning-arrestor, DC-side, inverter body).
            Shown as a fixed legend rather than wired to one specific row,
            since the number of strings/inverters is unbounded. */}
        <text x={START_X} y={earthLegendY - 22} className="sld-note">
          Earthing (provide at each point below, per standard practice):
        </text>
        <EarthLegendItem x={START_X + 30} y={earthLegendY} label="Array / LA earth" />
        <EarthLegendItem x={START_X + 190} y={earthLegendY} label="DC-side earth" />
        <EarthLegendItem x={START_X + 340} y={earthLegendY} label="Inverter body earth" />

        <text x={START_X} y={notesY} className="sld-disclaimer">
          Reference single-line diagram generated per standard DISCOM net-metering documentation conventions —
          verify against your specific DISCOM's checklist before submission.
        </text>
      </svg>
    </div>
  );
}
