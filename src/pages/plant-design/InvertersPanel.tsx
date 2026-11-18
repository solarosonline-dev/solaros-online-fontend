import { useEffect, useState } from 'react';
import NumberField from '../../components/NumberField';
import ConfirmDialog from '../../components/ConfirmDialog';
import { CUSTOM_INVERTER_MAKE, inverterCatalogMakes, inverterCatalogModels, findInverter } from './inverterCatalog.js';
import { edgeInfo, type InverterPose, type PlacementRoof } from './inverterPlacement';
import {
  addInverters, removeInverterFromOwners, connectGrid, disconnectGridFromInverter, setGridPanelCount,
  suggestAssignment, inverterColor, inverterLabel,
  type DesignInverter, type InverterSpec, type PanelOwners, type SiteGrid, type SitePlan,
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
        <NumberField min={0} max={max} step="1" value={n} onCommit={(v) => setN(Math.max(0, Math.min(max, Math.floor(v))))} />
        <span className="pde-field-sm-hint">of {max}</span>
        <button className="pde-btn" onClick={() => onConfirm(n)}>Apply</button>
        <button className="pde-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// Floating over the plan/3D canvas: a legend of the inverter colours (click
// one to select it) and, while panels are picked on the plan, the bar that
// connects them to an inverter.
export function InverterCanvasOverlay({ inverters, unconnectedPanels, selectedCount, selectedInverterId, onSelectInverter, onConnect, onConnectNew, onDisconnect, onClear, selectMode, onSelectMode, moving, onCancelMove }: {
  inverters: { id: number; panels: number }[];
  unconnectedPanels: number;
  selectedCount: number;
  selectedInverterId: number | null;
  onSelectInverter: (id: number) => void;
  onConnect: (id: number) => void;
  onConnectNew: () => void;
  onDisconnect: () => void;
  onClear: () => void;
  selectMode: 'box' | 'row' | 'column' | 'grid' | 'brush';
  onSelectMode: (m: 'box' | 'row' | 'column' | 'grid' | 'brush') => void;
  moving: { id: number; info: string | null; issue: string | null } | null;
  onCancelMove: () => void;
}) {
  const modes: { id: 'box' | 'row' | 'column' | 'grid' | 'brush'; label: string; tip: string }[] = [
    { id: 'box', label: 'Box', tip: 'Drag a box (turned to the grid\'s angle) or click a panel' },
    { id: 'row', label: 'Row', tip: 'Click a panel to pick its whole row' },
    { id: 'column', label: 'Column', tip: 'Click a panel to pick its whole column' },
    { id: 'grid', label: 'Grid', tip: 'Click a panel to pick its whole grid' },
    { id: 'brush', label: 'Brush', tip: 'Drag across panels to pick them (Alt removes)' },
  ];
  if (moving) {
    return (
      <div className="pde-inv-movebar" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <strong>Placing INV-{moving.id}</strong>
        <span>Click a wall in 3D, or a spot on the plan · Esc to cancel</span>
        {moving.info && <span className="pde-inv-movebar-info">{moving.info}</span>}
        {moving.issue && <span className="pde-inv-movebar-issue">⚠ {moving.issue} (you can still place it)</span>}
        <button className="pde-inv-selbar-btn" onClick={onCancelMove}>Cancel</button>
      </div>
    );
  }
  return (
    <>
      <div className="pde-inv-modes" onMouseDown={(e) => e.stopPropagation()}>
        <span className="pde-inv-modes-label">Pick</span>
        {modes.map((m) => (
          <button key={m.id} className={`pde-inv-mode${selectMode === m.id ? ' active' : ''}`} title={m.tip} onClick={() => onSelectMode(m.id)}>{m.label}</button>
        ))}
      </div>
      {selectedCount > 0 && (
        <div className="pde-inv-selbar" onMouseDown={(e) => e.stopPropagation()}>
          <strong>{selectedCount} panel{selectedCount === 1 ? '' : 's'} selected</strong>
          <span className="pde-inv-selbar-label">Connect to</span>
          {inverters.map((i) => (
            <button key={i.id} className="pde-inv-selbar-chip" style={{ background: inverterColor(i.id) }} onClick={() => onConnect(i.id)} title={`Connect the selected panels to INV-${i.id}`}>{i.id}</button>
          ))}
          <button className="pde-inv-selbar-btn" onClick={onConnectNew}>+ New inverter</button>
          <button className="pde-inv-selbar-btn" onClick={onDisconnect}>Disconnect</button>
          <button className="pde-inv-selbar-btn" aria-label="Clear selection" onClick={onClear}>✕</button>
        </div>
      )}
      <div className="pde-inv-legend" onMouseDown={(e) => e.stopPropagation()}>
        {inverters.map((i) => (
          <button key={i.id} className={`pde-inv-legend-item${selectedInverterId === i.id ? ' selected' : ''}`} onClick={() => onSelectInverter(i.id)}>
            <span className="pde-inv-legend-swatch" style={{ background: inverterColor(i.id) }} />INV-{i.id} · {i.panels}
          </button>
        ))}
        {unconnectedPanels > 0 && (
          <span className="pde-inv-legend-item unconnected"><span className="pde-inv-legend-swatch" />Not connected · {unconnectedPanels}</span>
        )}
        <div className="pde-inv-legend-hint">⌘/Shift adds to the pick · Alt removes (brush)</div>
      </div>
    </>
  );
}

export default function InvertersPanel({
  inverters, owners, setInverters, setOwners, grids, sitePlan, defaultSpec, onDefaultSpecChange, planInputs, onNext, onBack,
  poses, placementRoofs, selectedInverterId, onSelectInverter, selectedPanelKeys, onClearPanelSelection, onMoveInverter,
}: {
  inverters: DesignInverter[];
  owners: PanelOwners;
  setInverters: (v: DesignInverter[]) => void;
  setOwners: (v: PanelOwners) => void;
  grids: SiteGrid[];
  sitePlan: SitePlan;
  defaultSpec: InverterSpec;
  onDefaultSpecChange: (s: InverterSpec) => void;
  planInputs: { module: any; designMinTempC: number; designMaxTempC: number; mpptVoltageUtilizationPct: number };
  onNext: () => void;
  onBack?: () => void;
  poses: InverterPose[];
  placementRoofs: PlacementRoof[];
  selectedInverterId: number | null;
  onSelectInverter: (id: number | null) => void;
  selectedPanelKeys: Set<string>;
  onClearPanelSelection: () => void;
  // Starts "click where to put it" on the canvas (desktop only).
  onMoveInverter?: (id: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState<{ text: string; level: 'info' | 'warning' } | null>(null);
  const [connectMenuFor, setConnectMenuFor] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ inverterId: number; gridKey: string; initial: number } | null>(null);
  const [changingSpecFor, setChangingSpecFor] = useState<number | null>(null);
  const [placingFor, setPlacingFor] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  // Selecting an inverter on the canvas brings its card into view.
  useEffect(() => {
    if (selectedInverterId == null) return;
    document.getElementById(`pde-inv-card-${selectedInverterId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedInverterId]);

  const gridByKey = new Map(grids.map((g) => [g.key, g]));
  const perGridByKey = new Map(sitePlan.perGrid.map((g) => [g.key, g]));
  const ratio = sitePlan.totalAcKw > 0 ? sitePlan.totalDcKw / sitePlan.totalAcKw : 0;
  const free = sitePlan.unconnected;
  const hasGrids = grids.length > 0;

  function connect(inverterId: number, gridKey: string) {
    const g = gridByKey.get(gridKey);
    if (!g) return;
    setConnectMenuFor(null);
    setOwners(connectGrid(owners, g, inverterId));
  }

  // Suggested assignment: only panels with no inverter yet, only onto the
  // inverters already added - and says so when they don't have room.
  function suggest() {
    setAdding(false);
    if (inverters.length === 0) {
      setNote({ level: 'warning', text: 'Add an inverter first - suggestions use the inverters you have added.' });
      return;
    }
    const res = suggestAssignment({
      inverters, owners, grids, module: planInputs.module, designMinTempC: planInputs.designMinTempC, designMaxTempC: planInputs.designMaxTempC,
      mpptVoltageUtilizationPct: planInputs.mpptVoltageUtilizationPct,
      positions: new Map(poses.map((p) => [p.id, { x: p.x, y: p.y }])),
    });
    setOwners(res.owners);
    const how = res.assigned > 0
      ? `Connected ${res.assigned} panels in whole strings along rows (${res.wholeRows} row${res.wholeRows === 1 ? '' : 's'} kept on one inverter${res.splitRows > 0 ? `, ${res.splitRows} split between inverters` : ''}).`
      : '';
    if (res.unplaced.length > 0) {
      const lines = res.unplaced.map((u) => `${u.label}: ${u.panels} panels - ${u.reason}`).join('; ');
      setNote({ level: 'warning', text: `${how} Not connected: ${lines}.${res.unplaced.some((u) => u.reason.startsWith('no inverter has MPPT')) ? ' Add another inverter for those.' : ''}`.trim() });
    } else if (res.assigned > 0) {
      setNote({ level: 'info', text: how });
    } else {
      setNote({ level: 'info', text: 'Every panel is already connected.' });
    }
  }

  return (
    <div className="pde-inv-panel">
      <div className="pde-step1-heading">Inverters & wiring</div>
      <div className="pde-field-sm-hint" style={{ marginBottom: 10 }}>
        Add inverters, then connect panels to them: pick panels on the plan (drag, or ⌘-click) or connect whole grids below.
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

      {selectedPanelKeys.size > 0 && (
        <div className="pde-inv-selection">
          <strong>{selectedPanelKeys.size} panel{selectedPanelKeys.size === 1 ? '' : 's'} selected</strong>
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              setOwners({ ...owners, ...Object.fromEntries([...selectedPanelKeys].map((k) => [k, Number(e.target.value)])) });
              onClearPanelSelection();
            }}
            aria-label="Connect the selected panels to an inverter"
          >
            <option value="">Connect to…</option>
            {inverters.map((i) => <option key={i.id} value={i.id}>INV-{i.id} · {inverterLabel(i.spec)}</option>)}
          </select>
          <button className="pde-btn" onClick={onClearPanelSelection}>Clear</button>
        </div>
      )}

      <div className="pde-inv-actions">
        <button className="pde-btn pde-btn-primary" onClick={() => { setAdding((v) => !v); setNote(null); }} disabled={!hasGrids}>+ Add inverter</button>
        <button className="pde-btn" onClick={() => { setNote(null); suggest(); }} disabled={!hasGrids} title="Connect panels that have no inverter yet to the inverters you've added">Suggest assignment</button>
        <button className="pde-btn" onClick={() => { setNote(null); setConfirmClear(true); }} disabled={sitePlan.inverters.every((e) => e.entries.length === 0)} title="Disconnect every panel from its inverter (the inverters stay)">Clear assignments</button>
        <button className="pde-btn pde-btn-danger" onClick={() => { setNote(null); setConfirmDeleteAll(true); }} disabled={inverters.length === 0} title="Remove every inverter and all connections">Delete all inverters</button>
      </div>
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

      {note && (note.level === 'warning'
        ? <div className="pde-field-error" style={{ marginTop: 6 }}>{note.text}</div>
        : <div className="pde-field-sm-hint" style={{ marginTop: 6 }}>{note.text}</div>)}

      {inverters.length === 0 && hasGrids && (
        <div className="pde-inv-empty">No inverters yet. Add one, then connect panels to it.</div>
      )}

      {sitePlan.inverters.map((ev) => {
        const inv = inverters.find((i) => i.id === ev.id)!;
        const color = inverterColor(ev.id);
        const otherGrids = grids.filter((g) => !ev.entries.some((en) => en.gridKey === g.key));
        return (
          <div
            key={ev.id}
            id={`pde-inv-card-${ev.id}`}
            className={`pde-inv-card ${ev.status}${selectedInverterId === ev.id ? ' selected' : ''}`}
            style={{ borderLeftColor: color }}
            onClick={() => onSelectInverter(ev.id)}
          >
            <div className="pde-inv-card-head">
              <span className="pde-inv-badge" style={{ background: color }}>{ev.id}</span>
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
                <div key={en.gridKey} className="pde-inv-entry" onClick={(e) => e.stopPropagation()}>
                  <div className="pde-inv-entry-main">
                    <span>{en.gridLabel}</span>
                    <span className="pde-field-sm-hint">
                      {en.panels}{isSplit ? ` of ${g.panelCount}` : ''} panels{en.strings.length > 0 && <> · {en.strings.length} string{en.strings.length === 1 ? '' : 's'} ({[...en.strings].sort((a, b) => a - b).join(', ')} panels)</>}
                    </span>
                  </div>
                  <div className="pde-inv-entry-actions">
                    <button className="pde-btn pde-btn-sm" onClick={() => setEditing({ inverterId: ev.id, gridKey: en.gridKey, initial: en.panels })}>Panels</button>
                    <button className="pde-btn pde-btn-sm" aria-label={`Disconnect ${en.gridLabel}`} onClick={() => setOwners(disconnectGridFromInverter(owners, g, ev.id))}>✕</button>
                  </div>
                  {editing && editing.inverterId === ev.id && editing.gridKey === en.gridKey && (
                    <PanelCountEditor
                      max={g.panelCount}
                      initial={editing.initial}
                      label={`How many of ${g.panelCount} panels does INV-${ev.id} take?`}
                      onConfirm={(n) => { setOwners(setGridPanelCount(owners, g, ev.id, n)); setEditing(null); }}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                </div>
              );
            })}

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
                  <button className="pde-btn pde-btn-sm" onClick={(e) => { e.stopPropagation(); setPlacingFor(open ? null : ev.id); }}>
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
                  {otherGrids.map((g) => {
                    const info = perGridByKey.get(g.key)!;
                    return <option key={g.key} value={g.key}>{g.label} · {g.panelCount} panels{info.unconnected === g.panelCount ? '' : info.unconnected > 0 ? ` (${info.unconnected} free)` : ' (all connected - moves it)'}</option>;
                  })}
                </select>
              ) : (
                <button className="pde-btn" onClick={() => setConnectMenuFor(ev.id)} disabled={otherGrids.length === 0}>+ Connect grid</button>
              )}
              {onMoveInverter && <button className="pde-btn" onClick={() => onMoveInverter(ev.id)} title="Then click a wall in 3D, or a spot on the plan">Move…</button>}
              <button className="pde-btn" onClick={() => setChangingSpecFor(changingSpecFor === ev.id ? null : ev.id)}>Change model</button>
              <button className="pde-btn danger" onClick={() => { setInverters(inverters.filter((i) => i.id !== ev.id)); setOwners(removeInverterFromOwners(owners, ev.id)); }}>Delete</button>
            </div>
            {changingSpecFor === ev.id && (
              <div className="pde-inv-form" onClick={(e) => e.stopPropagation()}>
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

      <ConfirmDialog
        open={confirmDeleteAll}
        title="Delete all inverters?"
        message="Every inverter is removed along with all panel connections. You can undo this."
        confirmLabel="Delete all"
        cancelLabel="Keep them"
        onConfirm={() => { setInverters([]); setOwners({}); onClearPanelSelection(); onSelectInverter(null); setConfirmDeleteAll(false); }}
        onCancel={() => setConfirmDeleteAll(false)}
      />
      <ConfirmDialog
        open={confirmClear}
        title="Clear all connections?"
        message="Every panel is disconnected from its inverter. Your inverters stay, and you can undo this."
        confirmLabel="Clear assignments"
        cancelLabel="Keep them"
        onConfirm={() => { setOwners({}); onClearPanelSelection(); setConfirmClear(false); }}
        onCancel={() => setConfirmClear(false)}
      />

      <div className="pde-inv-nav">
        {onBack && <button className="pde-btn" onClick={onBack}>← Back</button>}
        <button className="pde-primary-btn" onClick={onNext}>Next: Output estimate →</button>
      </div>
    </div>
  );
}
