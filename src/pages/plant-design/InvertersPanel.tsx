import { useEffect, useState } from 'react';
import NumberField from '../../components/NumberField';
import ConfirmDialog from '../../components/ConfirmDialog';
import { SliderInput } from './PlantDesignControls';
import { CUSTOM_INVERTER_MAKE, inverterCatalogMakes, inverterCatalogModels, findInverter } from './inverterCatalog.js';
import { edgeInfo, type InverterPose, type PlacementRoof } from './inverterPlacement';
import {
  addInverters, removeInverter, disconnectGrid, setLinkPanels, autoAssignWiring, fillExistingInverters, inverterLabel,
  type DesignInverter, type InverterLink, type InverterSpec, type SiteGrid, type SitePlan,
} from './inverterWiring';

// The Inverters & wiring step's left panel: add inverters, connect grids to
// them, see capacity and problems. All edits go through the pure helpers in
// inverterWiring.ts; this component only holds transient UI state (which form
// is open). Same structure works on mobile - nothing here needs the canvas.

const STATUS_LABEL: Record<string, string> = { idle: 'No grids', ok: 'OK', warning: 'Warning', error: 'Error' };

export function InverterSpecFields({ spec, onChange }: { spec: InverterSpec; onChange: (s: InverterSpec) => void }) {
  const isCustom = spec.make === CUSTOM_INVERTER_MAKE;
  return (
    <>
      <div className={!isCustom ? 'pde-field-row' : undefined}>
        <div className="pde-field-sm">
          <label>Make</label>
          <select
            value={spec.make}
            onChange={(e) => {
              const make = e.target.value;
              if (make === CUSTOM_INVERTER_MAKE) onChange({ ...spec, make, model: '' });
              else onChange({ ...spec, ...inverterCatalogModels(make)[0] });
            }}
          >
            {inverterCatalogMakes().map((make) => <option key={make} value={make}>{make}</option>)}
            <option value={CUSTOM_INVERTER_MAKE}>{CUSTOM_INVERTER_MAKE}</option>
          </select>
        </div>
        {!isCustom && (
          <div className="pde-field-sm">
            <label>Model</label>
            <select
              value={spec.model}
              onChange={(e) => {
                const inv = findInverter(spec.make, e.target.value);
                if (inv) onChange({ ...spec, ...inv });
              }}
            >
              {inverterCatalogModels(spec.make).map((i) => <option key={i.model} value={i.model}>{i.model} · {i.acPowerKw}kW</option>)}
            </select>
          </div>
        )}
      </div>
      {isCustom ? (
        <>
          <div className="pde-field-sm"><label>Model name</label><input type="text" value={spec.model} onChange={(e) => onChange({ ...spec, model: e.target.value })} placeholder="e.g. My inverter 50kW" /></div>
          <div className="pde-field-row">
            <div className="pde-field-sm"><label>AC power (kW)</label><NumberField step="0.1" value={spec.acPowerKw} onCommit={(v) => onChange({ ...spec, acPowerKw: v })} /></div>
            <div className="pde-field-sm"><label>Max DC voltage (V)</label><NumberField step="1" value={spec.maxDcVoltage} onCommit={(v) => onChange({ ...spec, maxDcVoltage: v })} /></div>
          </div>
          <div className="pde-field-row">
            <div className="pde-field-sm"><label>MPPT channels</label><NumberField step="1" value={spec.mpptCount} onCommit={(v) => onChange({ ...spec, mpptCount: v })} /></div>
            <div className="pde-field-sm"><label>Max current/MPPT (A)</label><NumberField step="0.1" value={spec.maxCurrentPerMppt} onCommit={(v) => onChange({ ...spec, maxCurrentPerMppt: v })} /></div>
          </div>
          <div className="pde-field-row">
            <div className="pde-field-sm"><label>MPPT V min (V)</label><NumberField step="1" value={spec.mpptVoltageMin} onCommit={(v) => onChange({ ...spec, mpptVoltageMin: v })} /></div>
            <div className="pde-field-sm"><label>MPPT V max (V)</label><NumberField step="1" value={spec.mpptVoltageMax} onCommit={(v) => onChange({ ...spec, mpptVoltageMax: v })} /></div>
          </div>
          <div className="pde-field-row">
            <div className="pde-field-sm"><label>Max AC current (A)</label><NumberField step="0.1" value={spec.maxAcCurrent} onCommit={(v) => onChange({ ...spec, maxAcCurrent: v })} /></div>
            <div className="pde-field-sm"><label>AC voltage (V)</label><NumberField step="1" value={spec.acVoltage} onCommit={(v) => onChange({ ...spec, acVoltage: v })} /></div>
          </div>
          <div className="pde-field-sm"><label>Phase</label><NumberField step="1" value={spec.phase} onCommit={(v) => onChange({ ...spec, phase: v })} /></div>
        </>
      ) : (
        <div className="pde-field-sm-hint">
          {spec.acPowerKw} kW · {spec.phase}-Phase · {spec.acVoltage} V AC<br />
          Max DC {spec.maxDcVoltage} V · {spec.mpptCount} MPPT × {spec.maxCurrentPerMppt} A<br />
          MPPT window {spec.mpptVoltageMin}–{spec.mpptVoltageMax} V
        </div>
      )}
    </>
  );
}

function PanelCountEditor({ max, initial, label, onConfirm, onCancel }: { max: number; initial: number; label: string; onConfirm: (n: number) => void; onCancel: () => void }) {
  const [n, setN] = useState(initial);
  return (
    <div className="pde-inv-inline">
      <div className="pde-field-sm-hint" style={{ marginBottom: 4 }}>{label}</div>
      <div className="pde-inv-inline-row">
        <NumberField min={1} max={max} step="1" value={n} onCommit={(v) => setN(Math.max(0, Math.min(max, Math.floor(v))))} />
        <span className="pde-field-sm-hint">of {max}</span>
        <button className="pde-btn" onClick={() => onConfirm(n)} disabled={n < 1}>Apply</button>
        <button className="pde-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function InvertersPanel({
  inverters, links, setInverters, setLinks, grids, sitePlan, defaultSpec, onDefaultSpecChange,
  targetDcAcRatio, onTargetDcAcRatioChange, planInputs, onNext, onBack,
  poses, placementRoofs, selectedInverterId, onSelectInverter,
}: {
  inverters: DesignInverter[];
  links: InverterLink[];
  setInverters: (v: DesignInverter[]) => void;
  setLinks: (v: InverterLink[]) => void;
  grids: SiteGrid[];
  sitePlan: SitePlan;
  defaultSpec: InverterSpec;
  onDefaultSpecChange: (s: InverterSpec) => void;
  targetDcAcRatio: number;
  onTargetDcAcRatioChange: (v: number) => void;
  planInputs: { module: any; designMinTempC: number; designMaxTempC: number; mpptVoltageUtilizationPct: number };
  onNext: () => void;
  onBack?: () => void;
  poses: InverterPose[];
  placementRoofs: PlacementRoof[];
  selectedInverterId: number | null;
  onSelectInverter: (id: number | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [autoOpen, setAutoOpen] = useState(false);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [confirmRebalance, setConfirmRebalance] = useState(false);
  const [autoNote, setAutoNote] = useState<{ text: string; level: 'info' | 'warning' } | null>(null);
  const [connectMenuFor, setConnectMenuFor] = useState<number | null>(null);
  // An open "how many panels" editor: either splitting a grid onto an
  // inverter, or changing an existing link's count.
  const [editing, setEditing] = useState<{ inverterId: number; gridKey: string; initial: number } | null>(null);
  const [changingSpecFor, setChangingSpecFor] = useState<number | null>(null);
  const [placingFor, setPlacingFor] = useState<number | null>(null);

  // Selecting an inverter on the canvas brings its card into view.
  useEffect(() => {
    if (selectedInverterId == null) return;
    document.getElementById(`pde-inv-card-${selectedInverterId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedInverterId]);

  const gridByKey = new Map(grids.map((g) => [g.key, g]));
  const perGridByKey = new Map(sitePlan.perGrid.map((g) => [g.key, g]));
  const ratio = sitePlan.totalAcKw > 0 ? sitePlan.totalDcKw / sitePlan.totalAcKw : 0;

  function connect(inverterId: number, gridKey: string) {
    const g = gridByKey.get(gridKey);
    const info = perGridByKey.get(gridKey);
    if (!g || !info) return;
    setConnectMenuFor(null);
    if (info.unconnected > 0) {
      // Free panels exist: take them all (an 'all' link is the remainder).
      setLinks(setLinkPanels(links, gridKey, inverterId, g.panelCount, info.unconnected));
      return;
    }
    // Fully connected elsewhere: ask how many to move here.
    setEditing({ inverterId, gridKey, initial: Math.max(1, Math.floor(g.panelCount / 2)) });
  }

  function runAutoAssign() {
    const res = autoAssignWiring({ grids, module: planInputs.module, spec: defaultSpec, designMinTempC: planInputs.designMinTempC, designMaxTempC: planInputs.designMaxTempC, targetDcAcRatio, mpptVoltageUtilizationPct: planInputs.mpptVoltageUtilizationPct });
    setInverters(res.inverters);
    setLinks(res.links);
    setAutoOpen(false);
    setConfirmAuto(false);
    setAutoNote(res.failures.length > 0
      ? { level: 'warning', text: `Couldn't place: ${res.failures.map((f) => `${f.label} (${f.reason})`).join('; ')}` }
      : null);
  }

  // With inverters already on the site, Auto-assign just connects the
  // unconnected grids to them - no model prompt, nothing replaced.
  function fillExisting(rebalance = false) {
    setAdding(false);
    setAutoOpen(false);
    const res = fillExistingInverters({ inverters, links: rebalance ? [] : links, grids, module: planInputs.module, designMinTempC: planInputs.designMinTempC, designMaxTempC: planInputs.designMaxTempC, mpptVoltageUtilizationPct: planInputs.mpptVoltageUtilizationPct, balance: rebalance });
    setLinks(res.links);
    if (rebalance && res.unplaced.length === 0) {
      setAutoNote({ level: 'info', text: `Re-balanced: all ${res.connectedPanels} panels spread across ${inverters.length} inverter${inverters.length === 1 ? '' : 's'}.` });
      return;
    }
    if (res.unplaced.length > 0) {
      setAutoNote({ level: 'warning', text: `Connected ${res.connectedPanels} panels. ${res.unplaced.map((u) => `${u.label}: ${u.panels} panels`).join('; ')} didn't fit on the current inverters - add another inverter.` });
    } else if (res.connectedPanels > 0) {
      setAutoNote({ level: 'info', text: `Connected ${res.connectedPanels} panels to your existing inverters.` });
    } else {
      setAutoNote({ level: 'info', text: 'Every grid is already connected.' });
    }
  }

  const free = sitePlan.unconnected;
  const hasGrids = grids.length > 0;

  return (
    <div className="pde-inv-panel">
      <div className="pde-step1-heading">Inverters & wiring</div>
      <div className="pde-field-sm-hint" style={{ marginBottom: 10 }}>
        Add inverters, then connect each grid to one. A grid can be split across inverters.
      </div>

      <div className="pde-inv-summary">
        <div>
          <strong>{inverters.length}</strong> inverter{inverters.length === 1 ? '' : 's'}
          {inverters.length > 0 && <> · {sitePlan.totalAcKw.toFixed(1)} kW AC · {sitePlan.totalDcKw.toFixed(1)} kW DC{ratio > 0 && <> · DC:AC {ratio.toFixed(2)}</>}</>}
        </div>
        <div className="pde-inv-chips">
          {sitePlan.errorCount > 0 && <span className="pde-inv-chip error">{sitePlan.errorCount} error{sitePlan.errorCount === 1 ? '' : 's'}</span>}
          {sitePlan.warningCount > 0 && <span className="pde-inv-chip warning">{sitePlan.warningCount} warning{sitePlan.warningCount === 1 ? '' : 's'}</span>}
          {free.length > 0 && <span className="pde-inv-chip warning">{sitePlan.unconnectedPanels} panel{sitePlan.unconnectedPanels === 1 ? '' : 's'} not connected</span>}
          {sitePlan.errorCount === 0 && sitePlan.warningCount === 0 && free.length === 0 && inverters.length > 0 && <span className="pde-inv-chip ok">All connected</span>}
        </div>
      </div>

      <div className="pde-inv-actions">
        <button className="pde-btn" onClick={() => { setAdding((v) => !v); setAutoOpen(false); }} disabled={!hasGrids}>+ Add inverter</button>
        <button className="pde-btn" onClick={() => { setAutoNote(null); if (inverters.length > 0) fillExisting(); else { setAutoOpen((v) => !v); setAdding(false); } }} disabled={!hasGrids}>Auto-assign</button>
        {inverters.length > 0 && <button className="pde-btn" onClick={() => { setAutoNote(null); setConfirmRebalance(true); }} disabled={!hasGrids} title="Re-spread every grid across your current inverters">Re-balance</button>}
      </div>
      {inverters.length > 0 && hasGrids && !autoOpen && (
        <button className="pde-inv-link-btn" style={{ marginBottom: 8 }} onClick={() => { setAutoNote(null); setAutoOpen(true); setAdding(false); }}>Clear all &amp; auto-assign from scratch…</button>
      )}
      {!hasGrids && <div className="pde-field-sm-hint">Place panels first (Panel/Grid setup) - there is nothing to connect yet.</div>}

      {adding && (
        <div className="pde-inv-form">
          <InverterSpecFields spec={defaultSpec} onChange={onDefaultSpecChange} />
          <div className="pde-field-sm"><label>Quantity</label><NumberField min={1} max={10} step="1" value={quantity} onCommit={(v) => setQuantity(Math.max(1, Math.min(10, Math.floor(v))))} /></div>
          <div className="pde-inv-inline-row">
            <button className="pde-btn" onClick={() => { setInverters(addInverters(inverters, defaultSpec, quantity)); setAdding(false); }}>Add</button>
            <button className="pde-btn" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {autoOpen && (
        <div className="pde-inv-form">
          <div className="pde-field-sm-hint" style={{ marginBottom: 6 }}>Starts over: sizes new inverters and connects every grid as a starting point you can then edit.</div>
          <InverterSpecFields spec={defaultSpec} onChange={onDefaultSpecChange} />
          <div className="pde-field-sm"><label>Target DC:AC ratio</label><SliderInput min={0.8} max={1.5} hardMax={2.5} step={0.01} value={targetDcAcRatio} onChange={onTargetDcAcRatioChange} /></div>
          <div className="pde-inv-inline-row">
            <button className="pde-btn" onClick={() => (inverters.length > 0 || links.length > 0 ? setConfirmAuto(true) : runAutoAssign())}>Run</button>
            <button className="pde-btn" onClick={() => setAutoOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {autoNote && (autoNote.level === 'warning'
        ? <div className="pde-field-error" style={{ marginTop: 6 }}>{autoNote.text}</div>
        : <div className="pde-field-sm-hint" style={{ marginTop: 6 }}>{autoNote.text}</div>)}

      {inverters.length === 0 && hasGrids && (
        <div className="pde-inv-empty">No inverters yet. Add one, or use Auto-assign to start from a suggestion.</div>
      )}

      {sitePlan.inverters.map((ev) => {
        const inv = inverters.find((i) => i.id === ev.id)!;
        const unconnectedForMenu = grids.filter((g) => !ev.entries.some((en) => en.gridKey === g.key));
        return (
          <div key={ev.id} id={`pde-inv-card-${ev.id}`} className={`pde-inv-card ${ev.status}${selectedInverterId === ev.id ? ' selected' : ''}`} onClick={() => onSelectInverter(ev.id)}>
            <div className="pde-inv-card-head">
              <span className="pde-inv-badge">{ev.id}</span>
              <div className="pde-inv-card-title">
                <strong>{inverterLabel(ev.spec)}</strong>
                <span className="pde-field-sm-hint">{ev.spec.acPowerKw} kW AC · {ev.spec.mpptCount} MPPT</span>
              </div>
              <span className={`pde-inv-status ${ev.status}`}>{STATUS_LABEL[ev.status]}</span>
            </div>

            <div className="pde-inv-metrics">
              <span>DC {ev.dcKw.toFixed(1)} / AC {ev.acKw.toFixed(1)} kW</span>
              <span>DC:AC {ev.acKw > 0 && ev.dcKw > 0 ? ev.dcAcRatio.toFixed(2) : '-'}</span>
            </div>
            <div className="pde-inv-mppt" title={`${ev.mpptUsed} of ${ev.mpptTotal} MPPT inputs used`}>
              {Array.from({ length: Math.max(ev.mpptTotal, ev.mpptUsed) }).map((_, i) => (
                <span key={i} className={`pde-inv-mppt-cell${i < ev.mpptUsed ? ' used' : ''}${i >= ev.mpptTotal ? ' over' : ''}`} />
              ))}
              <span className="pde-field-sm-hint">{ev.mpptUsed} of {ev.mpptTotal} MPPT</span>
            </div>

            {ev.entries.map((en) => {
              const g = gridByKey.get(en.gridKey)!;
              const isSplit = en.panels < g.panelCount;
              return (
                <div key={en.gridKey} className="pde-inv-entry">
                  <div className="pde-inv-entry-main">
                    <span>{en.gridLabel}</span>
                    <span className="pde-field-sm-hint">
                      {en.panels}{isSplit ? ` of ${g.panelCount}` : ''} panels{en.strings.length > 0 && <> · {en.strings.length} string{en.strings.length === 1 ? '' : 's'} ({[...new Set(en.strings)].join('/')})</>}
                    </span>
                  </div>
                  <div className="pde-inv-entry-actions">
                    <button className="pde-inv-link-btn" onClick={() => setEditing({ inverterId: ev.id, gridKey: en.gridKey, initial: en.panels })}>Panels</button>
                    <button className="pde-inv-link-btn" aria-label={`Disconnect ${en.gridLabel}`} onClick={() => setLinks(disconnectGrid(links, ev.id, en.gridKey))}>✕</button>
                  </div>
                  {editing && editing.inverterId === ev.id && editing.gridKey === en.gridKey && (
                    <PanelCountEditor
                      max={g.panelCount}
                      initial={editing.initial}
                      label={`How many of ${g.panelCount} panels go to INV-${ev.id}?`}
                      onConfirm={(n) => { setLinks(setLinkPanels(links, en.gridKey, ev.id, g.panelCount, n)); setEditing(null); }}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                </div>
              );
            })}

            {editing && editing.inverterId === ev.id && !ev.entries.some((en) => en.gridKey === editing.gridKey) && (() => {
              const g = gridByKey.get(editing.gridKey)!;
              return (
                <PanelCountEditor
                  max={g.panelCount}
                  initial={editing.initial}
                  label={`${g.label}: how many of ${g.panelCount} panels go to INV-${ev.id}?`}
                  onConfirm={(n) => { setLinks(setLinkPanels(links, editing.gridKey, ev.id, g.panelCount, n)); setEditing(null); }}
                  onCancel={() => setEditing(null)}
                />
              );
            })()}

            {ev.issues.map((issue, i) => (
              <div key={i} className={`pde-inv-issue ${issue.level}`}>{issue.level === 'error' ? '⛔' : '⚠'} {issue.message}</div>
            ))}

            {(() => {
              const pose = poses.find((p) => p.id === ev.id);
              if (!pose) return null;
              const m: any = pose.mount;
              const roof = pose.kind === 'wall' ? placementRoofs.find((r) => String(r.id) === String(m.roofId)) : null;
              const open = placingFor === ev.id;
              return (
                <div className="pde-inv-place">
                  <button className="pde-inv-link-btn" onClick={(e) => { e.stopPropagation(); setPlacingFor(open ? null : ev.id); }}>
                    {pose.kind === 'wall' ? `Wall-mounted · wall ${m.edge + 1}` : 'Ground-mounted'}{pose.autoPlaced ? ' (auto)' : ''} {open ? '▴' : '▾'}
                  </button>
                  {open && (
                    <div className="pde-inv-place-body" onClick={(e) => e.stopPropagation()}>
                      {pose.kind === 'wall' && roof ? (
                        <>
                          {placementRoofs.length > 1 && (
                            <div className="pde-field-sm"><label>Roof</label>
                              <select value={String(m.roofId)} onChange={(e) => { const r = placementRoofs.find((x) => String(x.id) === e.target.value)!; setInverters(inverters.map((i) => (i.id === ev.id ? { ...i, mount: { ...m, roofId: r.id, edge: 0, t: 0.5 } } : i))); }}>
                                {placementRoofs.map((r, idx) => <option key={String(r.id)} value={String(r.id)}>{`Roof ${idx + 1}`}</option>)}
                              </select>
                            </div>
                          )}
                          <div className="pde-field-sm"><label>Wall</label>
                            <select value={m.edge} onChange={(e) => setInverters(inverters.map((i) => (i.id === ev.id ? { ...i, mount: { ...m, edge: Number(e.target.value) } } : i)))}>
                              {roof.polygon.map((_, idx) => <option key={idx} value={idx}>{`Wall ${idx + 1} (${edgeInfo(roof.polygon, idx).len.toFixed(1)} m)`}</option>)}
                            </select>
                          </div>
                          <div className="pde-field-sm"><label>Along the wall ({Math.round(m.t * 100)}%)</label>
                            <input type="range" min={0} max={100} value={Math.round(m.t * 100)} onChange={(e) => setInverters(inverters.map((i) => (i.id === ev.id ? { ...i, mount: { ...m, t: Number(e.target.value) / 100 } } : i)))} />
                          </div>
                          <div className="pde-field-sm"><label>Height above ground (m){m.height == null ? ' - auto, just below the roof edge' : ''}</label>
                            <NumberField step="0.1" value={Math.round(pose.baseZ * 10) / 10} onCommit={(v) => setInverters(inverters.map((i) => (i.id === ev.id ? { ...i, mount: { ...m, height: Math.max(0, v) } } : i)))} />
                          </div>
                          <button className="pde-btn" onClick={() => setInverters(inverters.map((i) => (i.id === ev.id ? { ...i, mount: { kind: 'ground', x: pose.x + pose.facing.x * 1.5, y: pose.y + pose.facing.y * 1.5 } } : i)))}>Put on the ground</button>
                        </>
                      ) : (
                        <div className="pde-field-sm-hint">Drag it on the plan, near a wall to hang it there.</div>
                      )}
                      {!pose.autoPlaced && (
                        <button className="pde-btn" style={{ marginTop: 6 }} onClick={() => setInverters(inverters.map((i) => (i.id === ev.id ? { ...i, mount: undefined } : i)))}>Reset to auto</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="pde-inv-card-foot" onClick={(e) => e.stopPropagation()}>
              {connectMenuFor === ev.id ? (
                <select
                  autoFocus
                  value=""
                  onChange={(e) => { if (e.target.value) connect(ev.id, e.target.value); }}
                  onBlur={() => setConnectMenuFor(null)}
                >
                  <option value="">Choose a grid…</option>
                  {unconnectedForMenu.map((g) => {
                    const info = perGridByKey.get(g.key)!;
                    return <option key={g.key} value={g.key}>{g.label} · {g.panelCount} panels{info.unconnected === g.panelCount ? '' : info.unconnected > 0 ? ` (${info.unconnected} free)` : ' (connected elsewhere)'}</option>;
                  })}
                </select>
              ) : (
                <button className="pde-btn" onClick={() => setConnectMenuFor(ev.id)} disabled={unconnectedForMenu.length === 0}>+ Connect grid</button>
              )}
              <button className="pde-btn" onClick={() => setChangingSpecFor(changingSpecFor === ev.id ? null : ev.id)}>Change model</button>
              <button className="pde-btn danger" onClick={() => { const r = removeInverter(inverters, links, ev.id); setInverters(r.inverters); setLinks(r.links); }}>Delete</button>
            </div>
            {changingSpecFor === ev.id && (
              <div className="pde-inv-form">
                <InverterSpecFields spec={inv.spec} onChange={(s) => setInverters(inverters.map((i) => (i.id === ev.id ? { ...i, spec: s } : i)))} />
                <button className="pde-btn" onClick={() => setChangingSpecFor(null)}>Done</button>
              </div>
            )}
          </div>
        );
      })}

      {free.length > 0 && (
        <div className="pde-inv-unconnected">
          <div className="pde-inv-section-title">Not connected</div>
          {free.map((g) => (
            <div key={g.key} className="pde-inv-entry">
              <div className="pde-inv-entry-main">
                <span>⚠ {g.label}</span>
                <span className="pde-field-sm-hint">{g.unconnected === g.panelCount ? `${g.panelCount} panels` : `${g.unconnected} of ${g.panelCount} panels`}</span>
              </div>
              {inverters.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) connect(Number(e.target.value), g.key); }}
                  aria-label={`Connect ${g.label} to an inverter`}
                >
                  <option value="">Connect to…</option>
                  {inverters.map((i) => <option key={i.id} value={i.id}>INV-{i.id} · {inverterLabel(i.spec)}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="pde-inv-nav">
        {onBack && <button className="pde-btn" onClick={onBack}>← Back</button>}
        <button className="pde-primary-btn" onClick={onNext}>Next: Output estimate →</button>
      </div>

      <ConfirmDialog
        open={confirmRebalance}
        title="Re-balance connections?"
        message="This replaces every grid connection you have now, re-spreading the grids across your current inverters (including any empty ones). Your inverters are kept. You can undo it."
        confirmLabel="Re-balance"
        cancelLabel="Keep mine"
        danger={false}
        onConfirm={() => { setConfirmRebalance(false); fillExisting(true); }}
        onCancel={() => setConfirmRebalance(false)}
      />
      <ConfirmDialog
        open={confirmAuto}
        title="Replace current inverters?"
        message="Auto-assign replaces every inverter and connection you have now with a fresh suggestion."
        confirmLabel="Replace"
        cancelLabel="Keep mine"
        onConfirm={runAutoAssign}
        onCancel={() => setConfirmAuto(false)}
      />
    </div>
  );
}
