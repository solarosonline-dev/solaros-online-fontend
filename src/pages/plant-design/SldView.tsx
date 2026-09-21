// Renders the electrical design produced by gridInverterAssignment.js's
// assignSiteToInverters as a single-line diagram: grid -> net meter ->
// main LT panel -> AC busbar -> one column per inverter -> that inverter's
// MPPT/string breakdown - plus the string/MPPT schedule table, plant
// details, and legend, matching the shape of the reference SLD in
// ROADMAP.md's electrical design phase. An inverter can carry more than one
// grid's strings (pooled small grids sharing spare MPPT capacity), so each
// physical MPPT channel is labeled with the grid it belongs to whenever an
// inverter isn't dedicated to a single grid.
//
// Printable: the "Print SLD" button below calls window.print(); the
// @media print rule scoped to PRINT_ROOT_CLASS hides the rest of the app
// (step bar, sidebars) and prints only this component, landscape, one page
// wide - the standard trick for printing a single view out of an SPA that
// has no per-page routes.

import { CUSTOM_INVERTER_MAKE, inverterCatalogMakes, inverterCatalogModels, findInverter } from './inverterCatalog.js';
import { CollapsibleSection, SliderInput } from './PlantDesignControls.jsx';

const PRINT_ROOT_CLASS = 'sld-print-root';

// Compact throughout on purpose: an inverter used to be a large text-filled
// box (~260x98) with every spec repeated per column, which - combined with
// the info tables stacked full-width below the diagram - routinely spilled
// well past one printed page (see git history for the two earlier passes
// at this). This version draws each inverter as a small symbol (matching
// the reference SLD's own compact drafting style) with just enough text
// to identify it, and moves the shared/repeated specs (module, inverter,
// plant totals) into a sidebar table instead of duplicating them under
// every column - the diagram only needs to show *wiring*, not restate
// numbers already in the sidebar/schedule.
const COL_WIDTH = 210;
const COL_GAP = 36;
const INV_SYMBOL = 34;
const INV_BOX_Y = 266;
// One trunk line out of the inverter, branching into one leaf per MPPT
// channel (see inverters.map below) - a plain vertical drop to a shared
// horizontal branch line, then one vertical drop per channel down to its
// own module icon + label, same shape as an actual DC string run rather
// than a disconnected list of icons that happened to sit near the
// inverter. All channels sit in a single row now instead of a 2-up grid,
// which also means this block's height no longer depends on MPPT count -
// only its width does (branches spread out sideways, not stacked). Starts
// right at the symbol's own bottom edge (INV_BOX_Y + INV_SYMBOL) - the
// inverter's id/power/DC-output label sits beside the symbol, not below
// it, so there's no separate text-block height to clear first.
const BRANCH_DROP = 10;
const LEAF_DROP = 8;
const MPPT_ICON = 8;
const MPPT_Y = INV_BOX_Y + INV_SYMBOL + BRANCH_DROP;
const MPPT_BLOCK_H = LEAF_DROP + MPPT_ICON + 20;

// Flattens an inverter's (possibly several) grid entries into one ordered
// list of physical MPPT rows: {lens, gridLabel}, one per channel actually
// used, in the same order they'd occupy MPPT-1, MPPT-2, ... `entry.channels`
// already holds each channel's actual string lengths (grouped same-length
// where possible - see distributeAcrossMppts), so no reconstruction needed.
function inverterChannelRows(inverter) {
  let rows: any[] = [];
  inverter.entries.forEach((entry) => {
    entry.channels.forEach((lens) => rows.push({ lens, gridLabel: entry.gridLabel }));
  });
  return rows;
}

// Small line-drawn icons for the legend, styled to match the main
// schematic's own stroke language (thin #1c2b4a lines) instead of relying
// on unicode glyphs, which render inconsistently across fonts/OSes and
// don't read as "electrical symbol" the way an actual drawn shape does.
function LegendIcon({ kind }) {
  const stroke = { stroke: '#1c2b4a', strokeWidth: 1.5, fill: 'none' };
  const body = {
    grid: <polygon points="14,3 24,19 4,19" {...stroke} />,
    meter: <>
      <circle cx="14" cy="11" r="9" {...stroke} />
      <text x="14" y="14" fontSize="7" textAnchor="middle" fill="#1c2b4a">kWh</text>
    </>,
    panel: <rect x="3" y="5" width="22" height="12" {...stroke} />,
    busbar: <line x1="2" y1="11" x2="26" y2="11" stroke="#1c2b4a" strokeWidth="4" />,
    inverter: <>
      <rect x="4" y="3" width="20" height="16" {...stroke} />
      <line x1="6" y1="17" x2="22" y2="5" stroke="#1c2b4a" strokeWidth="1.2" />
    </>,
    module: <PvModulePaths x={4} y={3} size={16} />,
    mppt: <>
      <line x1="14" y1="2" x2="14" y2="20" stroke="#999" strokeWidth="1" />
      <circle cx="14" cy="11" r="2" fill="#1c2b4a" stroke="none" />
    </>,
    earth: <EarthSymbolPaths cx={14} cy={4} scale={0.9} />,
  }[kind];
  return <svg width="28" height="22" viewBox="0 0 28 22" style={{ flexShrink: 0 }}>{body}</svg>;
}

// Standard IEC ground symbol (a stem into three decreasing-width bars),
// reused at both legend scale and the larger scale drawn on the diagram
// itself, so the two visually match.
function EarthSymbolPaths({ cx, cy, scale = 1 }) {
  const s = scale;
  return (
    <g stroke="#1c2b4a" strokeWidth={1.2 * s}>
      <line x1={cx} y1={cy} x2={cx} y2={cy + 7 * s} />
      <line x1={cx - 7 * s} y1={cy + 7 * s} x2={cx + 7 * s} y2={cy + 7 * s} />
      <line x1={cx - 4.5 * s} y1={cy + 11 * s} x2={cx + 4.5 * s} y2={cy + 11 * s} />
      <line x1={cx - 2 * s} y1={cy + 15 * s} x2={cx + 2 * s} y2={cy + 15 * s} />
    </g>
  );
}

// The standard PV-module symbol - a square outline with diagonal hatching
// (the cell strings' shading lines) - drawn at (x,y) as its top-left
// corner, `size` square. Reused both at legend scale and small/inline next
// to each MPPT/string entry in the diagram itself (see the inverters.map
// block below), same shape at both sizes so the legend actually matches
// what's drawn on the schematic.
function PvModulePaths({ x, y, size }) {
  const s = size;
  // Three lines parallel to the corner-to-corner diagonal, each clipped to
  // the square by construction (both endpoints always sit on an edge) -
  // no separate clip-path needed.
  const fractions = [0.33, 0.66, 1];
  return (
    <g>
      <rect x={x} y={y} width={s} height={s} fill="#fff" stroke="#c0392b" strokeWidth={Math.max(1, s * 0.09)} />
      {fractions.map((f) => (
        <line key={f} x1={x} y1={y + s * f} x2={x + s * f} y2={y} stroke="#c0392b" strokeWidth={Math.max(0.75, s * 0.06)} />
      ))}
    </g>
  );
}

// "Save as PDF" in the print dialog has no API to set a filename directly -
// every browser instead just slugifies whatever document.title happens to
// be at the moment print() is called (that's also literally what the print
// preview's own tab/window title shows). Swapping it in right before, then
// restoring the app's real title once the dialog closes (`afterprint`
// fires reliably in every major browser, print-cancelled included) is the
// standard workaround - never left in place, so nothing else on screen
// (tab title, browser history) is affected by it either.
function buildPrintFilename(projectName) {
  const safeName = (projectName || 'Untitled project').trim().replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '-');
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return `SolarOS-SLD-${safeName}-${dateStr}`;
}

export default function SldView({
  projectName, gridConnection, panelSpec, inverterChoice, sitePlan, totalPanelCount, totalCapacityKW,
  targetDcAcRatio, mpptVoltageUtilizationPct = 100, onInverterChoiceChange, onTargetDcAcRatioChange, onMpptVoltageUtilizationPctChange,
}) {
  const invalidGrids = sitePlan.perGrid.filter((g) => !g.valid);
  const inverters = sitePlan.inverters.map((inv) => ({ ...inv, id: `INV-${inv.id}`, rows: inverterChannelRows(inv), shared: inv.entries.length > 1, utilization: inv.dcKw / inverterChoice.acPowerKw }));

  function handlePrint() {
    const previousTitle = document.title;
    document.title = buildPrintFilename(projectName);
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);
    window.print();
  }

  const svgWidth = Math.max(1000, inverters.length * (COL_WIDTH + COL_GAP) + COL_GAP);
  const svgHeight = MPPT_Y + MPPT_BLOCK_H + 20;
  // Must clear the "Solar Main LT Panel" box above (bottom edge at y=238 -
  // see that rect/text block below) and leave a visible stub before
  // INV_BOX_Y - bit us once already: INV_BOX_Y - 70 = 210 lands *inside*
  // that box (190-238), so the busbar visually cut through its own text.
  // -12 (not -20) leaves a bit more breathing room between the panel's own
  // bottom edge and the busbar than a bare minimal stub would.
  const busY = INV_BOX_Y - 12;
  const centerX = svgWidth / 2;

  // Lets the electrical design be tweaked without leaving this page - reads
  // and writes the exact same state as Step 2's "Inverter (default)"/
  // "String sizing" sections (passed down from PlantDesignEditor as these
  // onChange props), so a change here or there shows up in both places and
  // re-runs assignSiteToInverters either way. Built from the same
  // CollapsibleSection/SliderInput/pde-field-* pieces Step 2 uses (see
  // PlantDesignControls.jsx) so it looks and behaves identically rather
  // than reinventing a second style of input here. Sits above the
  // printable SLD card itself (not inside it) - it's a live editor for
  // this page, not part of the diagram/schedule being drawn, and never
  // needs a sld-no-print escape hatch for that reason: it's outside
  // .sld-print-root entirely, so the print stylesheet's "hide everything
  // except .sld-print-root" rule already keeps it off the printed sheet.
  // Collapsed by default (defaultOpen=false) - reviewing the diagram is
  // the common case, tweaking these is occasional. Only rendered when the
  // caller wired the onChange props up - keeps this component still usable
  // as pure read-only display (e.g. a future share/export view) otherwise.
  const controls = onInverterChoiceChange && onTargetDcAcRatioChange && onMpptVoltageUtilizationPctChange && (
    <div style={{ flexShrink: 0 }}>
      <CollapsibleSection title="Inverter & string sizing" defaultOpen={false}>
        <div className={inverterChoice.make !== CUSTOM_INVERTER_MAKE ? 'pde-field-row' : undefined}>
          <div className="pde-field-sm">
            <label>Make</label>
            <select
              value={inverterChoice.make}
              onChange={(e) => {
                const make = e.target.value;
                if (make === CUSTOM_INVERTER_MAKE) {
                  onInverterChoiceChange({ ...inverterChoice, make, model: '' });
                  return;
                }
                onInverterChoiceChange({ ...inverterChoice, ...inverterCatalogModels(make)[0] });
              }}
            >
              {inverterCatalogMakes().map((make) => <option key={make} value={make}>{make}</option>)}
              <option value={CUSTOM_INVERTER_MAKE}>{CUSTOM_INVERTER_MAKE}</option>
            </select>
          </div>
          {inverterChoice.make !== CUSTOM_INVERTER_MAKE && (
            <div className="pde-field-sm">
              <label>Model</label>
              <select
                value={inverterChoice.model}
                onChange={(e) => {
                  const inv = findInverter(inverterChoice.make, e.target.value);
                  if (inv) onInverterChoiceChange({ ...inverterChoice, ...inv });
                }}
              >
                {inverterCatalogModels(inverterChoice.make).map((i) => <option key={i.model} value={i.model}>{i.model} · {i.acPowerKw}kW</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="pde-field-sm"><label>Target DC:AC ratio</label><SliderInput min={0.8} max={1.5} step={0.01} value={targetDcAcRatio} onChange={onTargetDcAcRatioChange} /></div>
        <div className="pde-field-sm"><label>MPPT voltage utilization (%)</label><SliderInput min={100} max={140} step={1} value={mpptVoltageUtilizationPct} onChange={onMpptVoltageUtilizationPctChange} /></div>
      </CollapsibleSection>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', boxSizing: 'border-box' }}>
      {controls}
      <div className={PRINT_ROOT_CLASS} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20, flex: 1, minHeight: 0, overflow: 'auto', boxSizing: 'border-box', background: '#fff', color: '#222', borderRadius: 10, border: '1px solid #d5d5d5', fontSize: 14 }}>
      <style>{`
        @media print {
          @page { size: landscape; margin: 12mm; }
          /* .sld-print-root's own background is already white, but that
             only covers the box it actually occupies - position:absolute
             content that spans multiple pages doesn't necessarily paint
             that background all the way to a later page's own edges, so
             whatever the app's own page background is (behind body/html)
             was showing through in the gap on a page where our content
             ran shorter than a full page. Forcing the page background
             itself white removes that regardless of where it was leaking
             from. */
          html, body { background: #fff !important; }
          body * { visibility: hidden; }
          .${PRINT_ROOT_CLASS}, .${PRINT_ROOT_CLASS} * { visibility: visible; }
          .${PRINT_ROOT_CLASS} { position: absolute; inset: 0; height: auto !important; overflow: visible !important; border: none !important; padding: 0 !important; }
          .${PRINT_ROOT_CLASS} .sld-no-print { display: none !important; }
          .${PRINT_ROOT_CLASS} .sld-svg-scroll { overflow: visible !important; border: none !important; break-inside: avoid; page-break-inside: avoid; }
          /* The svg's own minWidth (inline, see svgWidth) exists so it
             never squeezes unreadably thin on screen - overflowX:auto on
             sld-svg-scroll turns that into a scrollbar there instead of an
             overflow. Print has no scrollbar to fall back on, and just
             forced overflow:visible above (needed so the diagram isn't
             clipped/hidden entirely) - left as min-width on a printed page
             that's narrower than svgWidth, the diagram would spill straight
             over the sidebar table beside it instead of scaling down to
             fit. Printing is a one-shot fixed layout with no interaction
             to preserve, so dropping the min-width here and letting the
             viewBox scale the diagram down to whatever the column's own
             width is (down to a legible floor) is the right trade, not a
             workaround. */
          .${PRINT_ROOT_CLASS} .sld-svg-scroll svg { min-width: 260px !important; width: 100% !important; }
          /* The two "info section" rows below the diagram are flex
             containers on screen (nice side-by-side columns), but print
             pagination engines treat a flex/grid container as one
             unbreakable block - when it doesn't fit the remaining page, the
             *whole row* (every card in it) gets pushed together, and if
             that row is itself taller than one page, each card's heading
             ends up stranded at the bottom of one page while its table
             lands alone on the next. Switching to plain block flow for
             print lets each card size/place itself independently, and
             sld-print-card's own break-inside:avoid keeps each card's own
             heading+table glued together as one unit while still letting
             different cards land on different pages freely. */
          .${PRINT_ROOT_CLASS} .sld-print-row { display: block !important; }
          .${PRINT_ROOT_CLASS} .sld-print-card { break-inside: avoid; page-break-inside: avoid; margin-bottom: 14px; }
          .${PRINT_ROOT_CLASS} .sld-print-card:last-child { margin-bottom: 0; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #1c2b4a', paddingBottom: 6 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1c2b4a' }}>SINGLE LINE DIAGRAM</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 13, color: '#777', textAlign: 'right' }}>
            Grid: {gridConnection.voltage} V · {gridConnection.phase}-Phase{gridConnection.discom && ` · DISCOM: ${gridConnection.discom}`}
            {gridConnection.sanctionedLoadKw !== '' && <><br />Sanctioned load: {gridConnection.sanctionedLoadKw} kW</>}
          </div>
          <button
            className="sld-no-print"
            onClick={handlePrint}
            style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: '#1c2b4a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            🖨 Print SLD
          </button>
        </div>
      </div>

      {invalidGrids.length > 0 && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c6c0', borderRadius: 6, padding: 12, fontSize: 13, color: '#c0392b' }}>
          {invalidGrids.map((g) => <div key={g.key}>{g.label}: {g.reason}</div>)}
        </div>
      )}

      {inverters.length === 0 ? (
        <div style={{ fontSize: 14, color: '#888' }}>No panels placed yet - draw a roof and fill it with panels (steps 3-4) to generate an SLD.</div>
      ) : (
        <>
          {/* Diagram + its schedule + legend/notes on the left, spec tables
              in a narrow sidebar on the right - matches the reference
              drawing's own layout (specs sit in a side column beside the
              schematic rather than duplicated under every inverter column
              or in a third full-width row below it). NOT wrapped in
              sld-print-row/display:block for print, unlike the card groups
              inside each column: this outer split is meant to stay
              side-by-side even when printed - the schedule table competing
              for the same page as the diagram (rather than sitting in its
              own full-width row above both columns) is what actually lets
              the whole thing land on one sheet for a typical site instead
              of the schedule alone claiming a full page first. */}
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
            <div style={{ flex: '3 1 0%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* flexShrink:0 matters here, not just cosmetic: this is a flex
                  column child, and overflowX:'auto' with overflowY left at its
                  'visible' default gets computed as 'auto' on *both* axes per
                  the CSS overflow spec - a flex item with non-visible overflow
                  on both axes collapses to its automatic minimum size (0) with
                  nothing else to constrain it, hiding the whole SVG on screen.
                  Print worked despite this bug because the @media print rule
                  above already forces overflow:visible, which sidesteps the
                  collapse entirely - that's why "looks fine printed, blank on
                  screen" was the exact symptom. */}
              <div className="sld-svg-scroll" style={{ overflowX: 'auto', flexShrink: 0, border: '1px solid #e2e2e2', borderRadius: 8, background: '#fff' }}>
            {/* No width/height attributes - viewBox alone plus CSS width:100%
                lets the diagram stretch to fill the available pane when
                there are few inverters (2 shouldn't sit cramped in a corner
                of a wide screen), while minWidth stops it shrinking below a
                readable size when there are many - at that point the
                container's overflowX:auto kicks in and scrolls instead of
                squeezing every column unreadably thin. */}
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ display: 'block', width: '100%', minWidth: svgWidth, height: 'auto' }}>
              {/* Grid -> net meter -> client's LT panel -> solar main LT panel */}
              <polygon points={`${centerX - 16},44 ${centerX + 16},44 ${centerX},20`} fill="none" stroke="#333" strokeWidth={1.5} />
              <text x={centerX + 26} y={38} fontSize={14} fill="#333">GRID · {gridConnection.voltage}V {gridConnection.phase}Ph</text>
              <line x1={centerX} y1={44} x2={centerX} y2={78} stroke="#333" strokeWidth={1.5} />
              <circle cx={centerX} cy={92} r={15} fill="#fff" stroke="#333" strokeWidth={1.5} />
              <text x={centerX} y={97} fontSize={11} fill="#333" textAnchor="middle">kWh</text>
              <text x={centerX + 26} y={97} fontSize={13} fill="#666">Net meter (bi-dir)</text>
              <line x1={centerX} y1={107} x2={centerX} y2={132} stroke="#333" strokeWidth={1.5} />
              <rect x={centerX - 95} y={132} width={190} height={32} fill="#fff" stroke="#333" strokeWidth={1.5} />
              <text x={centerX} y={152} fontSize={14} fill="#333" textAnchor="middle">Client's LT Panel</text>
              <line x1={centerX} y1={164} x2={centerX} y2={190} stroke="#333" strokeWidth={1.5} />
              <rect x={centerX - 110} y={190} width={220} height={48} fill="#fff" stroke="#1c2b4a" strokeWidth={1.5} strokeDasharray="4 2" />
              <text x={centerX} y={211} fontSize={13} fill="#1c2b4a" textAnchor="middle">Solar Main LT Panel</text>
              <text x={centerX} y={228} fontSize={11} fill="#666" textAnchor="middle">MCCB · SPD · Isolator · MFM</text>
              <line x1={centerX} y1={238} x2={centerX} y2={busY} stroke="#333" strokeWidth={1.5} />

              {/* System earth reference, tapped off the main LT panel - see
                  EarthSymbolPaths, shared with the legend's own icon. */}
              <line x1={centerX - 110} y1={214} x2={centerX - 140} y2={214} stroke="#333" strokeWidth={1} />
              <EarthSymbolPaths cx={centerX - 140} cy={214} scale={1.1} />

              {/* AC busbar spanning every inverter column */}
              <line x1={COL_GAP} y1={busY} x2={svgWidth - COL_GAP} y2={busY} stroke="#1c2b4a" strokeWidth={4} />

              {inverters.map((inv, i) => {
                const cx = COL_GAP + COL_WIDTH / 2 + i * (COL_WIDTH + COL_GAP);
                const symbolTop = INV_BOX_Y;
                const symbolBottom = symbolTop + INV_SYMBOL;
                const labelX = cx + INV_SYMBOL / 2 + 6;
                return (
                  <g key={inv.id}>
                    <line x1={cx} y1={busY} x2={cx} y2={symbolTop} stroke="#333" strokeWidth={1.5} />
                    {/* A compact symbol (square + diagonal, same glyph as
                        LegendIcon's own "inverter" entry at legend scale)
                        instead of a large text-filled box - specs that used
                        to repeat under every column (model, DC/AC ratio,
                        etc.) now live once in the sidebar's own INVERTER
                        table instead of N times here. Its label sits beside
                        the symbol rather than below it, so the branch tree
                        starts right at the symbol's own bottom edge instead
                        of after a separate text block's worth of height. */}
                    <rect x={cx - INV_SYMBOL / 2} y={symbolTop} width={INV_SYMBOL} height={INV_SYMBOL} fill="#fff" stroke="#333" strokeWidth={1.5} />
                    <line x1={cx - INV_SYMBOL / 2 + 3} y1={symbolTop + INV_SYMBOL - 3} x2={cx + INV_SYMBOL / 2 - 3} y2={symbolTop + 3} stroke="#333" strokeWidth={1.2} />
                    <text x={labelX} y={symbolTop + 12} fontSize={11} fontWeight={700} fill="#1c2b4a">{inv.id}</text>
                    <text x={labelX} y={symbolTop + 22} fontSize={9} fill="#666">{inverterChoice.acPowerKw} kW · {inverterChoice.phase}Ph</text>
                    <text x={labelX} y={symbolTop + 32} fontSize={9} fontWeight={600} fill={inv.utilization < 0.6 ? '#c0392b' : '#2e7d32'}>
                      {inv.dcKw.toFixed(1)} kW DC · {(inv.utilization * 100).toFixed(0)}%
                    </text>
                    {/* One trunk out of the inverter, branching into one
                        leaf per MPPT channel actually used - a real branch
                        (shared horizontal + individual drops), not a
                        disconnected list of icons that merely sat near the
                        inverter. Branches spread evenly across the column's
                        own width; a single channel just continues straight
                        down with no horizontal branch line at all (nothing
                        to branch to). */}
                    {inv.rows.length > 0 && (() => {
                      const n = inv.rows.length;
                      const innerLeft = cx - COL_WIDTH / 2 + 14;
                      const innerRight = cx + COL_WIDTH / 2 - 14;
                      const branchY = symbolBottom + BRANCH_DROP;
                      const leafY = branchY + LEAF_DROP;
                      const branchX = (ci) => (n === 1 ? cx : innerLeft + ((innerRight - innerLeft) * ci) / (n - 1));
                      return (
                        <>
                          <line x1={cx} y1={symbolBottom} x2={cx} y2={branchY} stroke="#999" strokeWidth={1} />
                          {n > 1 && <line x1={branchX(0)} y1={branchY} x2={branchX(n - 1)} y2={branchY} stroke="#999" strokeWidth={1} />}
                          {inv.rows.map((row, ci) => {
                            const bx = branchX(ci);
                            return (
                              <g key={ci}>
                                <line x1={bx} y1={branchY} x2={bx} y2={leafY} stroke="#999" strokeWidth={1} />
                                <PvModulePaths x={bx - MPPT_ICON / 2} y={leafY} size={MPPT_ICON} />
                                <text x={bx} y={leafY + MPPT_ICON + 10} fontSize={8.5} fontWeight={600} fill="#333" textAnchor="middle">M{ci + 1}</text>
                                <text x={bx} y={leafY + MPPT_ICON + 19} fontSize={8} fill="#555" textAnchor="middle">
                                  {row.lens.length}×{[...new Set(row.lens)].join('/')}
                                </text>
                              </g>
                            );
                          })}
                        </>
                      );
                    })()}
                  </g>
                );
              })}
            </svg>
          </div>

              <div className="sld-print-row" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <div className="sld-print-card" style={{ flex: '1 1 320px', minWidth: 280 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>STRING SCHEDULE</div>
                  <div style={{ overflowX: 'auto', border: '1px solid #e2e2e2', borderRadius: 6 }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10.5 }}>
                      <thead>
                        <tr style={{ background: '#f4f6f8', textAlign: 'left' }}>
                          {['INV', 'Grid', 'MPPT', 'Strings', 'Mod/Str', 'Str Voc (V)', 'DC kWp'].map((h) => (
                            <th key={h} style={{ padding: '4px 6px', borderBottom: '1px solid #e2e2e2' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {inverters.flatMap((inv) => inv.rows.map((row, ci) => (
                          <tr key={`${inv.id}-${ci}`}>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>{inv.id}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>{row.gridLabel}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>{ci + 1}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>{row.lens.length}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>{[...new Set(row.lens)].join('–')}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>{(Math.max(...row.lens) * panelSpec.voc).toFixed(0)}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>{(row.lens.reduce((s, l) => s + l, 0) * panelSpec.wattage / 1000).toFixed(1)}</td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="sld-print-card" style={{ flex: '1 1 260px', minWidth: 240 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>NOTES</div>
                  <ol style={{ border: '1px solid #e2e2e2', borderRadius: 6, padding: '8px 12px 8px 26px', margin: 0, fontSize: 10.5, color: '#333', lineHeight: 1.6 }}>
                    <li>Plant: {totalCapacityKW.toFixed(2)} kWp DC, {totalPanelCount}× {panelSpec.wattage}Wp modules, {inverters.reduce((s, inv) => s + inv.rows.reduce((s2, row) => s2 + row.lens.length, 0), 0)} strings.</li>
                    <li>Module: Voc {panelSpec.voc} V, Isc {panelSpec.isc} A, {panelSpec.model || `${panelSpec.wattage}W custom`}.</li>
                    <li>Inverter: {inverterChoice.model || `${inverterChoice.acPowerKw}kW custom`}, {inverterChoice.mpptCount} MPPT, max {inverterChoice.maxCurrentPerMppt} A/MPPT. Strings sized to {mpptVoltageUtilizationPct}% of the rated MPPT voltage window (never exceeding the {inverterChoice.maxDcVoltage} V absolute max).</li>
                    <li>Grid: {gridConnection.voltage} V, {gridConnection.phase}-Phase. {gridConnection.sanctionedLoadKw !== '' && `Sanctioned load: ${gridConnection.sanctionedLoadKw} kW. `}{gridConnection.discom && `DISCOM: ${gridConnection.discom}.`}</li>
                    <li>Earthing as per IS 3043; SPD as per IS/IEC 61643.</li>
                    <li>Wiring &amp; protection as per IS 732, IE Rules &amp; CEA standards for grid-connected solar PV.</li>
                    <li>DC/AC cable sizing and protective device (MCCB/isolator/fuse) ratings to be finalized in the detailed cable schedule — not yet computed by this tool.</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Sidebar: specs that used to repeat under every inverter
                column, or sit in a third full-width row below the diagram,
                now live once each in this side column instead - see this
                whole split's own comment above. The Client/Date/Scale strip
                used to be its own full-width row above the diagram, pushing
                it down a whole row for no reason - it's a small title-block
                fact box, not something that needs the full page width, so
                it lives here now as the sidebar's first card instead,
                letting the diagram start right under the header. */}
            <div style={{ flex: '1 1 220px', maxWidth: 260, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="sld-print-card" style={{ display: 'flex', gap: 0, fontSize: 11, border: '1px solid #e2e2e2', borderRadius: 6, overflow: 'hidden' }}>
                {[
                  ['Client', projectName || 'Untitled project'],
                  ['Date', new Date().toLocaleDateString('en-IN')],
                  ['Scale', 'NTS'],
                ].map(([k, v], i) => (
                  <div key={k} style={{ flex: 1, padding: '6px 8px', borderLeft: i > 0 ? '1px solid #e2e2e2' : 'none', background: '#fafafa' }}>
                    <div style={{ color: '#888', textTransform: 'uppercase', fontSize: 9.5 }}>{k}</div>
                    <div style={{ fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</div>
                  </div>
                ))}
              </div>

              <div className="sld-print-card">
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>MODULE — {panelSpec.model || `${panelSpec.wattage}W custom`}</div>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, border: '1px solid #e2e2e2', borderRadius: 6 }}>
                  <tbody>
                    {[
                      ['Pmax', `${panelSpec.wattage} Wp`],
                      ['Voc', `${panelSpec.voc} V`],
                      ['Vmp', `${panelSpec.vmp} V`],
                      ['Isc', `${panelSpec.isc} A`],
                      ['Imp', `${panelSpec.imp} A`],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0', color: '#666' }}>{k}</td>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="sld-print-card">
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>INVERTER — {inverterChoice.model || `${inverterChoice.acPowerKw}kW custom`} (×{inverters.length})</div>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, border: '1px solid #e2e2e2', borderRadius: 6 }}>
                  <tbody>
                    {[
                      ['Max V DC', `${inverterChoice.maxDcVoltage} V`],
                      ['Max I DC/MPPT', `${inverterChoice.maxCurrentPerMppt} A`],
                      ['MPPT channels', inverterChoice.mpptCount],
                      ['MPPT range', `${inverterChoice.mpptVoltageMin}–${inverterChoice.mpptVoltageMax} V`],
                      ['AC power', `${inverterChoice.acPowerKw} kW`],
                      ['Max I AC', `${inverterChoice.maxAcCurrent} A`],
                      ['Phase', `${inverterChoice.phase}-Phase`],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0', color: '#666' }}>{k}</td>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Sidebar had room to spare below its tables (its cards
                  together are shorter than the diagram+schedule on the
                  left), so the legend lives here rather than sitting in its
                  own row below the diagram - trading otherwise-blank space
                  for a full-width schedule table there instead. Sits above
                  PLANT DETAILS: the legend explains symbols used in the
                  diagram right above it, so it reads before the plant's own
                  summary numbers below. */}
              <div className="sld-print-card">
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>LEGEND</div>
                <div style={{ border: '1px solid #e2e2e2', borderRadius: 6, padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10.5, color: '#333' }}>
                  {[
                    ['module', 'PV module'],
                    ['inverter', 'String inverter'],
                    ['grid', 'Grid'],
                    ['meter', 'Net (bi-dir) meter'],
                    ['panel', 'LT panel / busbar'],
                    ['busbar', 'AC busbar'],
                    ['earth', 'Earthing'],
                  ].map(([kind, label]) => (
                    <div key={label} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <LegendIcon kind={kind} />
                      <span>{label}</span>
                    </div>
                  ))}
                  <div style={{ gridColumn: '1 / -1', fontSize: 9.5, color: '#777', borderTop: '1px solid #f0f0f0', paddingTop: 5, marginTop: 1 }}>
                    <strong>M1, M2 …</strong> label MPPT channels; <strong>n×m</strong> = n strings of m modules on that channel.
                  </div>
                </div>
              </div>

              <div className="sld-print-card">
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>PLANT DETAILS</div>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, border: '1px solid #e2e2e2', borderRadius: 6 }}>
                  <tbody>
                    {[
                      ['Total DC capacity', `${totalCapacityKW.toFixed(2)} kWp`],
                      ['Total AC capacity', `${(inverters.length * inverterChoice.acPowerKw).toFixed(1)} kW`],
                      ['DC/AC ratio', (totalCapacityKW / (inverters.length * inverterChoice.acPowerKw)).toFixed(2)],
                      ['Module qty', `${totalPanelCount} Nos`],
                      ['Total strings', `${inverters.reduce((s, inv) => s + inv.rows.reduce((s2, row) => s2 + row.lens.length, 0), 0)} Nos`],
                      ['Inverter qty', `${inverters.length} Nos`],
                      ['Shared inverters', `${inverters.filter((inv) => inv.shared).length} Nos`],
                      ['DISCOM', gridConnection.discom || '—'],
                      ['Sanctioned load', gridConnection.sanctionedLoadKw !== '' ? `${gridConnection.sanctionedLoadKw} kW` : '—'],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0', color: '#666' }}>{k}</td>
                        <td style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    </div>
  );
}
