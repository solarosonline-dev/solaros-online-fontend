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

const PRINT_ROOT_CLASS = 'sld-print-root';

const COL_WIDTH = 260;
const COL_GAP = 44;
const INV_BOX_Y = 280;
const INV_BOX_H = 98;
const MPPT_Y = INV_BOX_Y + INV_BOX_H + 44;
const MPPT_ROW_H = 40;

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

export default function SldView({ projectName, capacityNote, gridConnection, panelSpec, inverterChoice, sitePlan, totalPanelCount, totalCapacityKW, inverterSuggestion }) {
  const invalidGrids = sitePlan.perGrid.filter((g) => !g.valid);
  const inverters = sitePlan.inverters.map((inv) => ({ ...inv, id: `INV-${inv.id}`, rows: inverterChannelRows(inv), shared: inv.entries.length > 1, utilization: inv.dcKw / inverterChoice.acPowerKw }));

  const svgWidth = Math.max(1000, inverters.length * (COL_WIDTH + COL_GAP) + COL_GAP);
  const maxRows = Math.max(inverterChoice.mpptCount, ...inverters.map((inv) => inv.rows.length), 0);
  const svgHeight = MPPT_Y + maxRows * MPPT_ROW_H + 30;
  // Must clear the "Solar Main LT Panel" box above (bottom edge at y=238 -
  // see that rect/text block below) and leave a visible stub before
  // INV_BOX_Y - bit us once already: INV_BOX_Y - 70 = 210 lands *inside*
  // that box (190-238), so the busbar visually cut through its own text.
  const busY = INV_BOX_Y - 20;
  const centerX = svgWidth / 2;

  return (
    <div className={PRINT_ROOT_CLASS} style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 20, height: '100%', overflow: 'auto', boxSizing: 'border-box', background: '#fff', color: '#222', borderRadius: 10, border: '1px solid #d5d5d5', fontSize: 14 }}>
      <style>{`
        @media print {
          @page { size: landscape; margin: 12mm; }
          body * { visibility: hidden; }
          .${PRINT_ROOT_CLASS}, .${PRINT_ROOT_CLASS} * { visibility: visible; }
          .${PRINT_ROOT_CLASS} { position: absolute; inset: 0; height: auto !important; overflow: visible !important; border: none !important; padding: 0 !important; }
          .${PRINT_ROOT_CLASS} .sld-no-print { display: none !important; }
          .${PRINT_ROOT_CLASS} .sld-svg-scroll { overflow: visible !important; border: none !important; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #1c2b4a', paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1c2b4a' }}>SINGLE LINE DIAGRAM</div>
          <div style={{ fontSize: 14, color: '#555' }}>{projectName || 'Untitled project'} · {capacityNote || '?'} kW</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 13, color: '#777', textAlign: 'right' }}>
            Grid: {gridConnection.voltage} V · {gridConnection.phase}-Phase{gridConnection.discom && ` · DISCOM: ${gridConnection.discom}`}
            {gridConnection.sanctionedLoadKw !== '' && <><br />Sanctioned load: {gridConnection.sanctionedLoadKw} kW</>}
          </div>
          <button
            className="sld-no-print"
            onClick={() => window.print()}
            style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: '#1c2b4a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            🖨 Print SLD
          </button>
        </div>
      </div>

      {/* flexShrink:0 required here too - see the sld-svg-scroll comment
          below for why any flex-column child with non-visible overflow
          (border-radius clipping needs overflow:hidden) collapses to 0
          height otherwise. Bit us twice now; watch for this on any new
          flex child that sets `overflow` to anything but 'visible'. */}
      <div style={{ display: 'flex', flexShrink: 0, gap: 0, fontSize: 11, border: '1px solid #e2e2e2', borderRadius: 6, overflow: 'hidden' }}>
        {[
          ['Client', projectName || 'Untitled project'],
          ['Date', new Date().toLocaleDateString('en-IN')],
          ['Scale', 'NTS'],
          ['Rev', 'R00'],
        ].map(([k, v], i) => (
          <div key={k} style={{ flex: 1, padding: '6px 10px', borderLeft: i > 0 ? '1px solid #e2e2e2' : 'none', background: '#fafafa' }}>
            <div style={{ color: '#888', textTransform: 'uppercase', fontSize: 10 }}>{k}</div>
            <div style={{ fontWeight: 600, color: '#333' }}>{v}</div>
          </div>
        ))}
      </div>

      {invalidGrids.length > 0 && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c6c0', borderRadius: 6, padding: 12, fontSize: 13, color: '#c0392b' }}>
          {invalidGrids.map((g) => <div key={g.key}>{g.label}: {g.reason}</div>)}
        </div>
      )}

      {inverterSuggestion && (
        <div className="sld-no-print" style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, padding: 12, fontSize: 13, color: '#7a5c00' }}>
          💡 A smaller inverter would fit this site better: <strong>{inverterSuggestion.model}</strong> ({inverterSuggestion.acPowerKw} kW) needs the same {inverterSuggestion.numInverters} inverter{inverterSuggestion.numInverters === 1 ? '' : 's'} but runs at {(inverterSuggestion.suggestedUtilization * 100).toFixed(0)}% utilization instead of {(inverterSuggestion.currentUtilization * 100).toFixed(0)}% — switch it in Step 2's Inverter picker.
        </div>
      )}

      {inverters.length === 0 ? (
        <div style={{ fontSize: 14, color: '#888' }}>No panels placed yet - draw a roof and fill it with panels (steps 3-4) to generate an SLD.</div>
      ) : (
        <>
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
                return (
                  <g key={inv.id}>
                    <line x1={cx} y1={busY} x2={cx} y2={INV_BOX_Y} stroke="#333" strokeWidth={1.5} />
                    <rect x={cx - COL_WIDTH / 2 + 12} y={INV_BOX_Y} width={COL_WIDTH - 24} height={INV_BOX_H} fill="#fff" stroke="#333" strokeWidth={1.5} />
                    <text x={cx} y={INV_BOX_Y + 20} fontSize={14} fontWeight={700} fill="#1c2b4a" textAnchor="middle">{inv.id}</text>
                    <text x={cx} y={INV_BOX_Y + 36} fontSize={12} fill="#555" textAnchor="middle">{inverterChoice.model || `${inverterChoice.acPowerKw}kW`}</text>
                    <text x={cx} y={INV_BOX_Y + 50} fontSize={12} fill="#555" textAnchor="middle">{inverterChoice.acPowerKw} kW · {inverterChoice.phase}Ph</text>
                    <text x={cx} y={INV_BOX_Y + 65} fontSize={11} fontWeight={600} fill={inv.utilization < 0.6 ? '#c0392b' : '#2e7d32'} textAnchor="middle">
                      {inv.dcKw.toFixed(1)} kW DC · {(inv.utilization * 100).toFixed(0)}% utilized
                    </text>
                    <text x={cx} y={INV_BOX_Y + 81} fontSize={11} fill="#888" textAnchor="middle">
                      {inv.shared ? `Shared: ${inv.entries.map((e) => e.gridLabel).join(' + ')}` : inv.entries[0].gridLabel}
                    </text>
                    {inv.rows.map((row, ci) => (
                      <g key={ci}>
                        <line x1={cx} y1={INV_BOX_Y + INV_BOX_H} x2={cx} y2={MPPT_Y + ci * MPPT_ROW_H + 12} stroke="#999" strokeWidth={1} />
                        <text x={cx - COL_WIDTH / 2 + 16} y={MPPT_Y + ci * MPPT_ROW_H + 17} fontSize={12} fill="#333">M{ci + 1}</text>
                        <text x={cx} y={MPPT_Y + ci * MPPT_ROW_H + 17} fontSize={12} fill="#333" textAnchor="middle">
                          {row.lens.length}×{[...new Set(row.lens)].join('/')}{inv.shared && ` (${row.gridLabel})`}
                        </text>
                      </g>
                    ))}
                  </g>
                );
              })}
            </svg>
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 480px', minWidth: 360 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>STRING / MPPT SCHEDULE</div>
              <div style={{ overflowX: 'auto', border: '1px solid #e2e2e2', borderRadius: 6 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f4f6f8', textAlign: 'left' }}>
                      {['INV', 'Grid', 'MPPT', 'Strings', 'Mod/Str', 'Str Voc (V)', 'Str Isc (A)', 'DC kWp'].map((h) => (
                        <th key={h} style={{ padding: '7px 10px', borderBottom: '1px solid #e2e2e2' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inverters.flatMap((inv) => inv.rows.map((row, ci) => (
                      <tr key={`${inv.id}-${ci}`}>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0' }}>{inv.id}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0' }}>{row.gridLabel}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0' }}>{ci + 1}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0' }}>{row.lens.length}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0' }}>{[...new Set(row.lens)].join('–')}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0' }}>{(Math.max(...row.lens) * panelSpec.voc).toFixed(0)}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0' }}>{panelSpec.isc}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0' }}>{(row.lens.reduce((s, l) => s + l, 0) * panelSpec.wattage / 1000).toFixed(1)}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ flex: '1 1 300px', minWidth: 260 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>PLANT DETAILS</div>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, border: '1px solid #e2e2e2', borderRadius: 6 }}>
                <tbody>
                  {[
                    ['Total DC capacity', `${totalCapacityKW.toFixed(2)} kWp`],
                    ['Total AC capacity', `${(inverters.length * inverterChoice.acPowerKw).toFixed(1)} kW`],
                    ['DC/AC ratio', (totalCapacityKW / (inverters.length * inverterChoice.acPowerKw)).toFixed(2)],
                    ['Module qty', `${totalPanelCount} Nos`],
                    ['Module model', panelSpec.model || `${panelSpec.wattage}W custom`],
                    ['Total strings', `${inverters.reduce((s, inv) => s + inv.rows.reduce((s2, row) => s2 + row.lens.length, 0), 0)} Nos`],
                    ['Inverter qty', `${inverters.length} Nos`],
                    ['Inverter model', inverterChoice.model || `${inverterChoice.acPowerKw}kW custom`],
                    ['Shared inverters', `${inverters.filter((inv) => inv.shared).length} Nos`],
                    ['DISCOM', gridConnection.discom || '—'],
                    ['Sanctioned load', gridConnection.sanctionedLoadKw !== '' ? `${gridConnection.sanctionedLoadKw} kW` : '—'],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0', color: '#666' }}>{k}</td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ flex: '1 1 260px', minWidth: 240 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>MODULE — {panelSpec.model || `${panelSpec.wattage}W custom`}</div>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, border: '1px solid #e2e2e2', borderRadius: 6, marginBottom: 18 }}>
                <tbody>
                  {[
                    ['Pmax', `${panelSpec.wattage} Wp`],
                    ['Voc', `${panelSpec.voc} V`],
                    ['Vmp', `${panelSpec.vmp} V`],
                    ['Isc', `${panelSpec.isc} A`],
                    ['Imp', `${panelSpec.imp} A`],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0', color: '#666' }}>{k}</td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>INVERTER — {inverterChoice.model || `${inverterChoice.acPowerKw}kW custom`} (×{inverters.length})</div>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, border: '1px solid #e2e2e2', borderRadius: 6 }}>
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
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0', color: '#666' }}>{k}</td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 420px', minWidth: 320 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>LEGEND</div>
              <div style={{ border: '1px solid #e2e2e2', borderRadius: 6, padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12, color: '#333' }}>
                {[
                  ['grid', 'Grid'],
                  ['meter', 'Net (bi-dir) meter'],
                  ['panel', 'LT panel / busbar enclosure'],
                  ['busbar', 'AC busbar'],
                  ['inverter', 'String inverter'],
                  ['earth', 'Earthing'],
                ].map(([kind, label]) => (
                  <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <LegendIcon kind={kind} />
                    <span>{label}</span>
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#777', borderTop: '1px solid #f0f0f0', paddingTop: 8, marginTop: 2 }}>
                  <strong>M1, M2 …</strong> label an inverter's MPPT channels; <strong>n×m</strong> on one means n strings of m modules paralleled on that channel.
                </div>
              </div>
            </div>

            <div style={{ flex: '1 1 420px', minWidth: 320 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>NOTES</div>
              <ol style={{ border: '1px solid #e2e2e2', borderRadius: 6, padding: '10px 14px 10px 30px', margin: 0, fontSize: 12, color: '#333', lineHeight: 1.7 }}>
                <li>Plant: {totalCapacityKW.toFixed(2)} kWp DC, {totalPanelCount}× {panelSpec.wattage}Wp modules, {inverters.reduce((s, inv) => s + inv.rows.reduce((s2, row) => s2 + row.lens.length, 0), 0)} strings.</li>
                <li>Module: Voc {panelSpec.voc} V, Isc {panelSpec.isc} A, {panelSpec.model || `${panelSpec.wattage}W custom`}.</li>
                <li>Inverter: {inverterChoice.model || `${inverterChoice.acPowerKw}kW custom`}, {inverterChoice.mpptCount} MPPT, max {inverterChoice.maxCurrentPerMppt} A/MPPT.</li>
                <li>Grid: {gridConnection.voltage} V, {gridConnection.phase}-Phase. {gridConnection.sanctionedLoadKw !== '' && `Sanctioned load: ${gridConnection.sanctionedLoadKw} kW. `}{gridConnection.discom && `DISCOM: ${gridConnection.discom}.`}</li>
                <li>Earthing as per IS 3043; SPD as per IS/IEC 61643.</li>
                <li>Wiring &amp; protection as per IS 732, IE Rules &amp; CEA standards for grid-connected solar PV.</li>
                <li>DC/AC cable sizing and protective device (MCCB/isolator/fuse) ratings to be finalized in the detailed cable schedule — not yet computed by this tool.</li>
              </ol>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
