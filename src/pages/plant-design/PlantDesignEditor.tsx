import React, { useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import type { PlantDesignData, PlantDesignEditorProps } from './types.js';
import './PlantDesignEditor.css';
import { getRoofPolygon, polygonBounds, reflectPointAcrossLine, pointInPolygon, toSlopeLocal, toSlopeWorld, roofUsablePolygon, slopeDirectionAzimuth } from './geometry.js';
import { solarPosition } from './solarMath.js';
import { metersPerPixel } from './geoConvert.js';
import { buildLocationPreviewImage, buildWideLocationPreviewImage } from './staticMap.js';
import { fetchMonthlyGHI, fetchDesignTemperatureRange } from './irradiance.js';
import {
  SAMPLE_MONTHLY_GHI,
  OBSTACLE_PRESETS,
  generateLayout,
  getInstantShading,
  computeOutput,
  computeCost,
  computeStructure,
  STRUCTURE_STRATEGIES,
  computeAutoTilt,
  computeAutoRowSpacing,
  resolvedGridPanels,
  resolvedGrid,
  gridPivot,
  rotateAroundPivot,
  suggestMaxPanelsPerRow,
  gridLocalBounds,
  addGridRow,
  addGridColumn,
  deleteGridRow,
  deleteGridColumn,
  deleteGridPanel,
  columnIndexMatch,
  bestRoofForGrid,
  reparentGridToRoof,
} from './layoutEngine.js';
import SiteMap from './SiteMap.jsx';
// Lazy-loaded: three/@react-three/fiber/@react-three/drei alone push the
// main bundle well past the PWA plugin's 2MB precache limit, and the 3D
// view is opt-in (most sessions never toggle it) - splitting it into its
// own chunk keeps the everyday bundle lean without dropping the feature.
const Scene3D = React.lazy(() => import('./Scene3D.jsx'));
import SldView from './SldView.jsx';
import { MODULE_CATALOG, CUSTOM_MODULE_MAKE, moduleCatalogMakes, moduleCatalogModels, findModule } from './moduleCatalog.js';
import { INVERTER_CATALOG, CUSTOM_INVERTER_MAKE, inverterCatalogMakes, inverterCatalogModels, findInverter } from './inverterCatalog.js';
import { sizeStrings } from './stringSizing.js';
import { assignSiteToInverters } from './gridInverterAssignment.js';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const TREE_CANOPIES = ['cone', 'round', 'bushy'];

// Template for every new roof/building traced on the 2D plan — a site can
// have any number of these, each independently configured and laid out.
// `pitchDeg` is the building's own roof slope (drives the sloped roof deck
// in Scene3D); `panelTiltDeg` is the panel array's own mounting angle,
// independent of it - a rack can be tilted steeper or shallower than the
// roof it sits on, not just laid flush against it.
// `edgeMargin` is the default panel setback applied to every edge of the
// roof's own polygon (matches the previous hardcoded 0.5m constant, so a
// fresh roof behaves exactly as before); `edgeMarginOverrides` is a sparse
// `{ [edgeIndex]: meters }` map for edges pulled back individually via the
// 2D plan's margin-edit mode (see the "Roof / site configuration" README
// entry and generateLayout's own use of both in layoutEngine.js).
// Panel tilt, row spacing, mounting/structure strategy and panels-per-row
// used to live here too - they're now per-grid instead (see the "Panel
// grids" README entry), each grid keeping its own copy once it's created.
// `grids: []` is set explicitly wherever a roof is actually created
// (finishRoofDraw, mirrorRoof) rather than here, since this object is
// shared by every new roof and an array literal on it would otherwise be
// the same reference for all of them.
const ROOF_DEFAULTS = { width: 14, length: 10, type: 'flat', pitchDeg: 15, slopeDirection: 'S', polygon: null, buildingHeight: 3, minPillarHeight: 0.15, structureStrategy: 'truss', boundaryHeight: 0, edgeMargin: 0.5, edgeMarginOverrides: {} };

function toDateInputValue(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const collapsibleSectionStyle = { background: '#fff', border: '1px solid #e2e2e2', borderRadius: 8, padding: '6px 10px', marginBottom: 6 };

function CollapsibleSection({ title, defaultOpen = false, open: openProp, onToggle, children }: any) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  // Controlled when the parent passes `open` (used to auto-collapse/expand
  // steps as the user progresses through the workflow) — otherwise each
  // section just tracks its own toggle state as before.
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : internalOpen;
  const toggle = () => (controlled ? onToggle?.(!open) : setInternalOpen((o) => !o));
  return (
    <div style={collapsibleSectionStyle}>
      <div
        onClick={toggle}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 600, fontSize: 12, padding: '4px 0', marginBottom: open ? 6 : 0, userSelect: 'none' }}
      >
        <span>{title}</span>
        <span style={{ color: '#888', fontSize: 10 }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && children}
    </div>
  );
}

// Display-layer only - every roof/panel/obstacle field and every
// calculation stays in meters internally (see AGENTS.md). `unit` in
// SliderInput/formatLength below is the *display* unit ('m' | 'ft'); the
// value passed in/out of those is always meters.
const METERS_PER_FOOT = 1 / 3.28084;
function metersToFeet(m) {
  return m * 3.28084;
}
function feetToMeters(ft) {
  return ft * METERS_PER_FOOT;
}
// Feet shown as decimal (e.g. `12.5 ft`), not feet+inches - simpler and
// consistent with the rest of the app's precision level (see README's
// "Input UX" entry).
function formatLength(meters, units, decimals = 1) {
  const v = units === 'ft' ? metersToFeet(meters) : meters;
  return `${v.toFixed(decimals)} ${units}`;
}

// A `<input type="range">` paired with a plain number box, kept in sync -
// dragging the slider updates the number box and vice versa. `min`/`max`
// only bound the *slider* thumb, not the value itself: the number box
// still accepts anything (someone typing 120 into a 0-50 building-height
// field isn't rejected), the slider just pins to whichever end is closer
// when the real value falls outside its own range, rather than the two
// controls disagreeing or one silently clamping the other.
//
// `value`/`onChange`/`min`/`max`/`step` are always in meters when `unit`
// is given (a length field) - conversion to/from the display unit happens
// entirely inside this component (both the slider's own range and the
// number box), so callers never juggle units themselves. Omit `unit` (or
// pass 'm') for a non-length field (wattage, degrees, a fraction, ₹) -
// the app-wide meter/feet toggle shouldn't touch those.
function SliderInput({ value, onChange, min, max, step = 1, disabled = false, numberWidth = 62, unit = 'm' }: any) {
  const numeric = Number.isFinite(value) ? value : 0;
  const isFeet = unit === 'ft';
  const toDisplay = (m) => (isFeet ? metersToFeet(m) : m);
  const toMeters = (d) => (isFeet ? feetToMeters(d) : d);
  const displayMin = toDisplay(min);
  const displayMax = toDisplay(max);
  const displayStep = isFeet ? step * 3.28084 : step;
  const displayValue = toDisplay(numeric);
  const sliderDisplayValue = Math.min(displayMax, Math.max(displayMin, displayValue));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
      <input
        type="range" min={displayMin} max={displayMax} step={displayStep} value={sliderDisplayValue} disabled={disabled}
        onChange={(e) => onChange(toMeters(+e.target.value))}
        style={{ flex: 1, minWidth: 0 }}
      />
      <input
        type="number" step={displayStep} value={isFeet ? +displayValue.toFixed(2) : value} disabled={disabled}
        onChange={(e) => onChange(toMeters(+e.target.value))}
        style={{ width: numberWidth, padding: '2px 4px', border: '1px solid #ccc', borderRadius: 4, fontSize: 11, color: '#222', background: disabled ? '#f2f2f2' : '#fff', flexShrink: 0 }}
      />
    </div>
  );
}

// The right-side properties rail's popovers (see the rail's own comment
// further down) all anchor to their trigger icon with `right: 48, top: 0`
// - fine for icons near the top of the rail, but an icon further down
// (e.g. a grid's own "Rack settings", several icons into that list) could
// have a popover tall enough to run off the bottom of the screen, since
// nothing accounted for how much room was actually left below it.
// Renders normally first, then (via a layout effect, so it happens before
// the browser paints - no visible jump) measures its own actual on-screen
// position and nudges itself up with a translateY just far enough to fit
// within the viewport, never pushing its own top above a small margin
// either (a popover taller than the viewport itself still scroll
// internally - see the `overflowY: 'auto'` this keeps from the old inline
// style).
function RailPopover({ open, width = 260, children }) {
  const ref = useRef<any>(null);
  const [shiftY, setShiftY] = useState(0);

  useLayoutEffect(() => {
    if (!open) { setShiftY(0); return; }
    const el = ref.current;
    if (!el) return;
    const margin = 12;
    const rect = el.getBoundingClientRect();
    const overflowBelow = rect.bottom - (window.innerHeight - margin);
    if (overflowBelow <= 0) { setShiftY(0); return; }
    const maxShift = rect.top - margin;
    setShiftY(-Math.min(overflowBelow, Math.max(maxShift, 0)));
    // Re-measure whenever the popover's own content changes size (e.g.
    // picking a roof edge to override reveals a new block) - `children`
    // itself isn't a stable dependency, but that's fine here: we only
    // care that *some* render happened while open, not what changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, children]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', right: 48, top: 0, transform: shiftY ? `translateY(${shiftY}px)` : undefined,
        background: '#fff', border: '1px solid #e2e2e2', borderRadius: 8, padding: 10,
        boxShadow: '0 4px 18px rgba(0,0,0,0.18)', width, maxHeight: '70vh', overflowY: 'auto', zIndex: 5,
      }}
    >
      {children}
    </div>
  );
}

// ============================================================
// Component
// ============================================================
export default function PlantDesignEditor({ initialDesignData, onSave }: PlantDesignEditorProps) {
  const svgRef = useRef<any>(null);

  // Every roof/building traced on the 2D plan — each is an independent
  // roof with its own type/pitch/azimuth/height and its own panel layout
  // (see regenerateLayouts). `selectedRoofId` drives which one's
  // properties are shown/edited in the left panel and which one's corner
  // handles are draggable on the plan.
  const [roofs, setRoofs] = useState<any[]>(initialDesignData?.roofs ?? []);
  // A grid-drag's own mouseup handler (see startGridDrag/handleMouseUp
  // below) needs the *latest* roofs - including every position update the
  // drag's own mousemove handler just applied - to correctly detect which
  // roof a grid was dropped on. That handler's closure is fixed for the
  // whole drag (its effect only re-subscribes on `movingGrids`, not on
  // every `roofs` change mid-drag), so reading the `roofs` state variable
  // directly there would see whatever it was *before* the drag started.
  // This ref stays synced to the latest value instead.
  const roofsRef = useRef(roofs);
  useEffect(() => { roofsRef.current = roofs; }, [roofs]);
  const [selectedRoofId, setSelectedRoofId] = useState<any>(null);
  // The site-wide satellite captures taken right after confirming a
  // location (see handleLocationConfirm) — shared backdrop for every roof,
  // not per-roof imagery.
  const [siteImages, setSiteImages] = useState<{ locationImage: any; locationImageWide: any }>(initialDesignData?.siteImages ?? { locationImage: null, locationImageWide: null });
  const [location, setLocation] = useState(initialDesignData?.location ?? { lat: 12.9716, lon: 77.5946, tz: 5.5 });
  const [obstacles, setObstacles] = useState<any[]>(initialDesignData?.obstacles ?? []);
  const [placingShape, setPlacingShape] = useState<any>(null);
  // Whether the "+ Add obstacle" icon rail button's type-picker popover is
  // open (step 3's icon rail - see the main return below). Collapses the
  // old always-visible 10-button obstacle palette into one icon.
  const [obstaclePickerOpen, setObstaclePickerOpen] = useState(false);
  // Points (world coords) traced so far for a "drawable" obstacle (see
  // OBSTACLE_PRESETS' `drawable` flag) — freehand, any number of points,
  // closed the same way a roof outline is (click back on the first point,
  // or double-click). Empty before the first click and again once the
  // shape's finished.
  const [obstacleDrawPoints, setObstacleDrawPoints] = useState<any[]>([]);
  const [drawingRoof, setDrawingRoof] = useState(false);
  const [roofDrawPoints, setRoofDrawPoints] = useState<any[]>([]);
  // Freehand polygon tracing for the "place a grid" tool (see README's
  // "Panel grids" entry) - same click-to-add-point/close-on-first-point
  // pattern as drawingRoof/roofDrawPoints above and a drawable obstacle's
  // own obstacleDrawPoints, just building a grid instead.
  const [placingGrid, setPlacingGrid] = useState(false);
  const [gridDrawPoints, setGridDrawPoints] = useState<any[]>([]);
  // Set when a just-closed grid polygon didn't land on any roof (see
  // addGridFromPolygon) - shown inline near the "+ Place grid" button so
  // that failure isn't silent, cleared on the next attempt.
  const [gridPlacementError, setGridPlacementError] = useState<any>(null);
  // Whether the map picker is currently shown in place of the center pane
  // ('location' — the only map mode now; shape tracing happens on the 2D
  // plan itself, see startRoofDraw).
  const [mapMode, setMapMode] = useState<any>(null);
  // Nothing to show in the center pane until a location's been picked —
  // before that, the app is just the left panel (see the main return below).
  const [locationConfirmed, setLocationConfirmed] = useState(initialDesignData?.locationConfirmed ?? false);
  // Monthly GHI (kWh/m^2/day) actually used by computeOutput below - starts
  // as the illustrative SAMPLE_MONTHLY_GHI and gets replaced with this
  // site's own values once handleLocationConfirm's fetchMonthlyGHI call
  // resolves (falls back to the sample again on any failure, so Output
  // estimate always has *something* to compute against). ghiStatus drives
  // the small status line in the Output estimate step further down.
  const [monthlyGHI, setMonthlyGHI] = useState(initialDesignData?.monthlyGHI ?? SAMPLE_MONTHLY_GHI);
  const [ghiStatus, setGhiStatus] = useState('idle'); // idle | loading | ready | error
  // Ignores a stale fetch's response if the location was confirmed again
  // (a new request started) before the previous one resolved.
  const ghiRequestIdRef = useRef(0);
  // Same pattern as ghiStatus/monthlyGHI above, for the design temperature
  // range stringSizing.js needs - see handleLocationConfirm.
  const [designTempStatus, setDesignTempStatus] = useState('idle'); // idle | loading | ready | error
  const designTempRequestIdRef = useRef(0);
  // Drives which of steps 1/2 is expanded — set explicitly once location is
  // confirmed so the workflow visibly advances instead of leaving both (or
  // neither) open. Left undefined initially so each section just falls
  // back to its own defaultOpen.
  const [locationOpen, setLocationOpen] = useState<any>(undefined);
  // The 6-step wizard (Project Setup / Location / Roof setup / Panel & grid
  // setup / Output estimate / Cost estimate) replacing the old
  // always-all-visible sidebar accordion. `currentStep` is just "what's
  // showing right now" (freely settable backward); `maxUnlockedStep` is the
  // high-water mark - a step tab is only clickable up to this, so the
  // wizard is strictly gated going forward but never re-locks a step once
  // reached, even if its own data is edited later (e.g. redrawing the roof
  // from step 3 after already reaching step 4 doesn't kick the user back -
  // step 4 just shows fewer/no grids again until re-filled).
  const [currentStep, setCurrentStep] = useState(initialDesignData?.currentStep ?? 1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(initialDesignData?.maxUnlockedStep ?? 1);
  const [projectName, setProjectName] = useState(initialDesignData?.projectName ?? '');
  const [capacityNote, setCapacityNote] = useState(initialDesignData?.capacityNote ?? '');
  // Static facts about the grid connection - flow into the SLD's title
  // block/AC side later, no calculation depends on them (unlike designTemp).
  const [gridConnection, setGridConnection] = useState(initialDesignData?.gridConnection ?? { voltage: 415, phase: 3, sanctionedLoadKw: '', discom: '' });
  // A roof/obstacle's selection only has anywhere to show itself in Roof
  // setup's own right rail, and a grid's only in Panel/Grid setup's - see
  // the roof polygon's click handler and the right rail's per-step gating
  // just past this component's other selection state. Carrying either
  // selection into a step that can't display or act on it just leaves it
  // stuck (e.g. a roof still shown "selected" - with corner handles still
  // draggable - after moving on to placing grids), so clear whichever
  // doesn't belong on the step being left.
  function clearSelectionForStep(step) {
    if (step !== 3) { setSelectedRoofId(null); setSelectedObstacleId(null); }
    if (step !== 4) setSelectedGridKeys(new Set());
  }
  function goToStep(step) {
    if (step > maxUnlockedStep) return;
    // Leaving step 1 with the map picker still open (mapMode==='location')
    // would otherwise leave it open in the background - it's only ever
    // meant to be visible while actually on step 1 (see the render gate
    // below), so close it on the way out rather than leaving stale state
    // that happens to render again if the user comes back to step 1 later
    // expecting a fresh "Set location on map…" click to have opened it.
    if (step !== 1) setMapMode(null);
    clearSelectionForStep(step);
    setCurrentStep(step);
  }
  function advanceToStep(step) {
    if (step !== 1) setMapMode(null);
    clearSelectionForStep(step);
    setCurrentStep(step);
    setMaxUnlockedStep((m) => Math.max(m, step));
  }
  const [selectedObstacleId, setSelectedObstacleId] = useState<any>(null);
  // Index of the roof.polygon vertex currently being dragged on the 2D plan
  // (null when not dragging). Lets the shape be resized right where it's
  // already being viewed — with this view's own zoom — instead of needing
  // the separate map tool for anything beyond the initial trace.
  const [draggingVertexIndex, setDraggingVertexIndex] = useState<any>(null);
  // Which vertex handle the pointer is currently over (not necessarily
  // dragging) — drives the point's fill color, the only feedback that
  // distinguishes "about to grab this point" from just hovering the map
  // underneath, since both use a pointer cursor.
  const [hoveredVertexIndex, setHoveredVertexIndex] = useState<any>(null);
  // Index of the polygon edge (between vertex i and i+1) currently being
  // dragged — moves both of that edge's endpoints together, i.e. drags the
  // whole side rather than reshaping just one corner.
  const [draggingEdgeIndex, setDraggingEdgeIndex] = useState<any>(null);
  // The polygon's own points at the moment an edge-drag started, plus the
  // world-space point the pointer started at — every subsequent mousemove
  // just re-applies the same delta to those two original points, rather
  // than accumulating per-pixel rounding error the way the vertex drag's
  // direct set-to-cursor-position approach would if used for two points at
  // once.
  const edgeDragStartRef = useRef<any>(null);
  // The roof currently in "pick a side to mirror across" mode (null when
  // not mirroring) - while set, the 2D plan swaps its edge-drag hit areas
  // for mirror-pick ones on that roof's own polygon (see the edges block
  // below), highlighting whichever one the pointer is over.
  const [mirrorRoofId, setMirrorRoofId] = useState<any>(null);
  const [hoveredMirrorEdge, setHoveredMirrorEdge] = useState<any>(null);
  // The roof currently in "click edges to override their margin" mode
  // (null when not editing margins) - same "swap this one roof's edges for
  // pickable hit-lines" pattern as mirror mode above, but a click toggles
  // an edge in/out of `selectedMarginEdges` (multi-select, so one margin
  // value can be applied to several edges at once) instead of taking an
  // immediate action.
  const [marginEditRoofId, setMarginEditRoofId] = useState<any>(null);
  const [hoveredMarginEdge, setHoveredMarginEdge] = useState<any>(null);
  const [selectedMarginEdges, setSelectedMarginEdges] = useState<Set<any>>(new Set());
  const [viewMode, setViewMode] = useState('plan');
  const [planZoom, setPlanZoom] = useState(1);
  // Screen-space pan offset (in viewBox pixels) for the 2D plan — without
  // this, zooming in always keeps the same center point in view with no
  // way to shift focus to the parts of the shape that scrolled off-screen.
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<any>(null);
  // Selected grids, keyed `${roofId}:${gridId}` - clicking any panel
  // selects every panel in its own grid (see README's "Panel grids" entry),
  // not just that one panel, so selection is tracked at the grid level.
  const [selectedGridKeys, setSelectedGridKeys] = useState<Set<any>>(() => new Set());
  // A marquee or grid-move drag that actually moved ends with a native
  // "click" firing right after mouseup, targeting whatever's now under the
  // pointer - almost always the roof polygon it was dragged across (or,
  // failing that, the svg's own empty-space background). Both of those
  // have their own onClick (select the roof / deselect everything) that
  // would otherwise immediately overwrite the selection the drag just
  // made. Set true right when such a drag finishes with real movement;
  // whichever onClick actually fires consumes and clears it.
  const swallowClickAfterDragRef = useRef(false);
  function gridKey(roofId, gridId) { return `${roofId}:${gridId}`; }
  function parseGridKey(key) { const i = key.indexOf(':'); return { roofId: Number(key.slice(0, i)), gridId: Number(key.slice(i + 1)) }; }
  // A drag-select rectangle in world coordinates, live while dragging
  // (rendered as the marquee below) - null the rest of the time. Only one
  // roof at a time (the one the drag started inside) is ever the source of
  // a single marquee drag.
  const [boxSelectRect, setBoxSelectRect] = useState<any>(null);
  const boxSelectRef = useRef<any>(null);
  // Live drag state for moving the currently selected grid(s) - screen-space
  // start point for the click-vs-drag threshold, plus every selected grid's
  // own starting panel positions/footprint so every subsequent mousemove
  // re-applies the same delta rather than accumulating rounding error. Move
  // is a plain translation applied directly to the grid's own packed data
  // (safe - see layoutEngine.js's comment above gridPivot for why rotation
  // can't be done the same way).
  const gridMoveRef = useRef<any>(null);
  const [movingGrids, setMovingGrids] = useState(false);
  // Live drag state for moving a whole selected roof - same shape/pattern
  // as gridMoveRef above, but also snapshots that roof's own grids (panels
  // + footprintPolygon) and any obstacle whose center sits inside the
  // roof's polygon at drag-start, so dragging the roof carries its
  // equipment along with it rather than leaving it behind at its old
  // position (both roof.polygon and an obstacle's x/y are plain world
  // coordinates, not roof-relative - see isOnRoof/getRoofPolygon in
  // geometry.js).
  const roofMoveRef = useRef<any>(null);
  const [movingRoof, setMovingRoof] = useState(false);
  // Holds the auto-fit view span (see combinedExtent below) frozen for the
  // duration of a roof drag, so the plan doesn't rescale live as the
  // dragged roof moves toward or away from the origin.
  const frozenExtentRef = useRef<any>(null);
  // Live drag state for the rotate handle - `pivot` is the selected grid's
  // own footprint center, `startAngle` the pointer's angle from it when the
  // drag began. Rotation is presentation-only (grid.rotation, see
  // layoutEngine.js's resolvedGridPanels) - every subsequent mousemove just
  // sets each selected grid's `rotation` to its own starting rotation plus
  // the delta.
  const rotateDragRef = useRef<any>(null);
  const [rotatingGrids, setRotatingGrids] = useState(false);
  // "Add row"/"Add column" side-picking (see README's "Panel grids"
  // entry) - while set, the selected grid's own front/back (row) or
  // left/right (column) edges become pickable on the 2D plan, same
  // "click an edge" pattern as mirror mode. `axis` picks which pair of
  // edges gets shown.
  const [addSideMode, setAddSideMode] = useState<any>(null); // { roofId, gridId, axis: 'row' | 'column' } | null
  const [hoveredAddSide, setHoveredAddSide] = useState<any>(null); // 'front' | 'back' | 'left' | 'right' | null
  // Delete row/column/panel mode for the currently selected (single) grid
  // - a mode button in the grid popup arms one of these, which changes
  // what clicking a panel in that grid does (select a row/column/panel
  // for deletion, instead of the usual whole-grid select/move).
  const [gridDeleteMode, setGridDeleteMode] = useState<any>(null); // 'row' | 'column' | 'panel' | null
  const [gridDeleteSelection, setGridDeleteSelection] = useState<any>(null); // { rackY } | { panelId } | { panelIds } | null

  function findGrid(roofId, gridId) {
    const roof = roofs.find((r) => r.id === roofId);
    return roof?.grids.find((g) => g.id === gridId) ?? null;
  }

  // Applies `updater` to one roof's own grids array - every grid edit
  // (move, rotate, delete, duplicate, settings change) goes through this.
  function updateRoofGrids(roofId, updater) {
    setRoofs((rs) => rs.map((r) => (r.id === roofId ? { ...r, grids: updater(r.grids) } : r)));
  }

  function deleteSelectedGrids() {
    if (selectedGridKeys.size === 0) return;
    const idsByRoof = new Map();
    selectedGridKeys.forEach((key) => {
      const { roofId, gridId } = parseGridKey(key);
      if (!idsByRoof.has(roofId)) idsByRoof.set(roofId, new Set());
      idsByRoof.get(roofId).add(gridId);
    });
    idsByRoof.forEach((ids, roofId) => {
      updateRoofGrids(roofId, (grids) => grids.filter((g) => !ids.has(g.id)));
    });
    setSelectedGridKeys(new Set());
  }

  // Clones every selected grid, offset one panel-width to the side and
  // immediately selected so it can be dragged into place (see README's
  // "Panel grids" entry). The clone gets a fresh id but otherwise carries
  // over its source grid's own settings (tilt, structure, row spacing...)
  // exactly, same as duplicating any other object in this app.
  function duplicateSelectedGrids() {
    if (selectedGridKeys.size === 0) return;
    const idsByRoof = new Map();
    selectedGridKeys.forEach((key) => {
      const { roofId, gridId } = parseGridKey(key);
      if (!idsByRoof.has(roofId)) idsByRoof.set(roofId, []);
      idsByRoof.get(roofId).push(gridId);
    });
    // Built from the current `roofs` directly, not from inside the setRoofs
    // updater below - React doesn't guarantee that updater runs before the
    // very next statement, so newKeys wouldn't reliably be populated yet by
    // the time setSelectedGridKeys read it if it were pushed to in there.
    let newKeys: any[] = [];
    const clonesByRoof = new Map();
    idsByRoof.forEach((ids, roofId) => {
      const roof = roofs.find((r) => r.id === roofId);
      if (!roof) return;
      const direction = roof.type === 'pitched' ? (roof.slopeDirection || 'S') : 'S';
      const clones = ids.map((gridId) => {
        const g = roof.grids.find((gg) => gg.id === gridId);
        if (!g) return null;
        const offsetX = (g.panels[0]?.w || 1) + 0.5;
        const newId = Date.now() + Math.floor(Math.random() * 1000);
        const panels = g.panels.map((p) => {
          const nx = p.x + offsetX, ny = p.y;
          const local = toSlopeLocal({ x: nx, y: ny }, direction);
          return { ...p, x: nx, y: ny, rackX: local.x, rackY: local.y };
        });
        const footprintPolygon = g.footprintPolygon.map((pt) => ({ x: pt.x + offsetX, y: pt.y }));
        newKeys.push(gridKey(roofId, newId));
        return { ...g, id: newId, panels, footprintPolygon, rotation: 0 };
      }).filter(Boolean);
      clonesByRoof.set(roofId, clones);
    });
    setRoofs((rs) => rs.map((roof) => {
      const clones = clonesByRoof.get(roof.id);
      return clones ? { ...roof, grids: [...roof.grids, ...clones] } : roof;
    }));
    setSelectedGridKeys(new Set(newKeys));
  }

  // Re-packs one grid in place from its own footprintPolygon after a
  // settings change (tilt/row spacing/structure/panels-per-row) - unlike
  // the old roof-level fields, editing a grid's own settings doesn't clear
  // it and wait for "Generate Layout" again; it just re-runs the packer
  // right away with the new settings, same footprint.
  function updateGridSettings(roofId, gridId, patch) {
    setRoofs((rs) => rs.map((roof) => {
      if (roof.id !== roofId) return roof;
      const grids = roof.grids.map((g) => {
        if (g.id !== gridId) return g;
        const gridSettings = {
          panelTiltDeg: patch.panelTiltDeg !== undefined ? patch.panelTiltDeg : g.panelTiltDeg,
          rowSpacing: patch.rowSpacing !== undefined ? patch.rowSpacing : g.rowSpacing,
          structureStrategy: patch.structureStrategy ?? g.structureStrategy,
          panelsPerRow: patch.panelsPerRow ?? g.panelsPerRow,
          orientation: patch.orientation ?? g.orientation,
        };
        const next = generateLayout({ roof, footprintPolygon: g.footprintPolygon, gridSettings, panelSpec, obstacles, location });
        // `source` isn't set by generateLayout itself - carry it over so a
        // later "Generate Layout" run (see regenerateAllGrids) still finds
        // and replaces this grid instead of treating it as untouched and
        // appending a duplicate.
        return { ...next, id: g.id, source: g.source, rotation: g.rotation || 0 };
      });
      return { ...roof, grids };
    }));
    setOutputResult(null);
    setCost(null);
  }

  // "Add row"/"Add column" - see addSideMode's own state comment above.
  // Force-added (no roof-boundary/obstacle checks - see README's "Panel
  // grids" entry): addGridRow/addGridColumn don't call generateLayout, so
  // this never touches the roof's own obstacle list or edge margin at all.
  function startAddRowMode(roofId, gridId) {
    setAddSideMode({ roofId, gridId, axis: 'row' });
  }
  function startAddColumnMode(roofId, gridId) {
    setAddSideMode({ roofId, gridId, axis: 'column' });
  }
  function cancelAddSideMode() {
    setAddSideMode(null);
  }
  function handleAddSide(side) {
    if (!addSideMode) return;
    const { roofId, gridId, axis } = addSideMode;
    const roof = roofs.find((r) => r.id === roofId);
    if (!roof) { setAddSideMode(null); return; }
    updateRoofGrids(roofId, (grids) => grids.map((g) => {
      if (g.id !== gridId) return g;
      return axis === 'row' ? addGridRow(g, roof, side) : addGridColumn(g, roof, side);
    }));
    setAddSideMode(null);
    setOutputResult(null);
    setCost(null);
  }

  // deleteGridRow/deleteGridColumn return an array (one grid normally, two
  // when the deleted row/column was interior and split the grid in half -
  // see their own comments in layoutEngine.js). That file stays free of
  // Date.now()/Math.random(), so whichever extra piece isn't the first
  // gets a fresh id here instead, the same way duplicateSelectedGrids'
  // clones do.
  function withFreshIdsForSplit(pieces) {
    if (pieces.length <= 1) return pieces;
    return pieces.map((g, i) => (i === 0 ? g : { ...g, id: Date.now() + Math.floor(Math.random() * 1000) + i }));
  }

  // Delete row/column/panel mode - see gridDeleteMode's own state comment
  // above. Clicking a panel in the mode's own grid sets
  // gridDeleteSelection (see the panel rendering below, where a click is
  // intercepted differently while a delete mode is active for that grid);
  // Delete/Backspace applies it here, same shortcut whole-grid delete
  // already uses. Panel mode collects a whole array of ids (Cmd/Ctrl+click
  // multi-select - see the click handler below), applied by folding
  // deleteGridPanel over each one in turn.
  function applyGridDeleteSelection() {
    if (!gridDeleteSelection || !selectedGrid || !gridOwnerRoof) return;
    if (gridDeleteMode === 'panel' && !gridDeleteSelection.panelIds?.length) return;
    updateRoofGrids(gridOwnerRoof.id, (grids) => grids.flatMap((g) => {
      if (g.id !== selectedGrid.id) return [g];
      if (gridDeleteMode === 'row') return withFreshIdsForSplit(deleteGridRow(g, gridDeleteSelection.rackY, gridOwnerRoof));
      if (gridDeleteMode === 'column') return withFreshIdsForSplit(deleteGridColumn(g, gridDeleteSelection.panelId, gridOwnerRoof));
      return [gridDeleteSelection.panelIds.reduce((acc, id) => deleteGridPanel(acc, id, gridOwnerRoof), g)];
    }));
    setGridDeleteSelection(null);
    setOutputResult(null);
    setCost(null);
  }

  useEffect(() => {
    if (viewMode !== 'plan') return;
    function handleKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        if (addSideMode) { setAddSideMode(null); return; }
        if (gridDeleteMode) { setGridDeleteMode(null); setGridDeleteSelection(null); }
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (gridDeleteSelection) { e.preventDefault(); applyGridDeleteSelection(); return; }
      if (selectedGridKeys.size === 0) return;
      e.preventDefault();
      deleteSelectedGrids();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedGridKeys, addSideMode, gridDeleteMode, gridDeleteSelection]);
  // Set right before closing a roof trace by clicking back on its own first
  // point (see onSvgClick) — a real double-click landing there fires a
  // second click event a moment later that would otherwise immediately
  // deselect the roof the first click just finished and selected.
  const suppressNextClickRef = useRef(false);

  // Every "start a freehand/placement tool" entry point (draw a roof, place
  // an obstacle, place a grid) should call this first. `swallowClickAfter
  // DragRef`/`suppressNextClickRef` are meant to consume exactly one
  // upcoming native click that follows a drag/double-click they already
  // saw - normally that click arrives (and clears the flag) within the
  // same gesture it was set for. But entering a new tool is a plain click
  // on a *sidebar* button, not the svg, so if the drag that set one of
  // these flags ended without its own natural follow-up click ever
  // reaching the svg (mouseup landing outside it, or a fast double
  // interaction), the flag stays stuck true - and the next real svg click,
  // whenever it comes, silently gets eaten by it instead of doing what the
  // user just clicked to do. Cost real debugging time once ("place grid"'s
  // first click never registering, every click after it fine) before this
  // existed.
  function resetClickSuppression() {
    swallowClickAfterDragRef.current = false;
    suppressNextClickRef.current = false;
    panStartRef.current = null;
  }

  const [showPanels, setShowPanels] = useState(true);
  // `panelsPerRow` and `orientation` used to live here too - both are
  // per-grid now (see README's "Panel grids" entry), editable once a grid
  // is selected (orientation's own default lives in generateLayout, see
  // layoutEngine.js).
  const [panelSpec, setPanelSpec] = useState(() => initialDesignData?.panelSpec ?? ({
    make: MODULE_CATALOG[0].make,
    model: MODULE_CATALOG[0].model,
    width: MODULE_CATALOG[0].width,
    height: MODULE_CATALOG[0].height,
    wattage: MODULE_CATALOG[0].wattage,
    voc: MODULE_CATALOG[0].voc,
    vmp: MODULE_CATALOG[0].vmp,
    isc: MODULE_CATALOG[0].isc,
    imp: MODULE_CATALOG[0].imp,
    tempCoeffVoc: MODULE_CATALOG[0].tempCoeffVoc,
  }));

  // Project-wide default inverter model. Per-grid overrides land with the
  // grid->inverter assignment step (see ROADMAP.md's electrical design
  // phase) - for now this is just the catalog pick that feeds string sizing.
  const [inverterChoice, setInverterChoice] = useState(() => initialDesignData?.inverterChoice ?? ({
    make: INVERTER_CATALOG[0].make,
    model: INVERTER_CATALOG[0].model,
    acPowerKw: INVERTER_CATALOG[0].acPowerKw,
    maxDcVoltage: INVERTER_CATALOG[0].maxDcVoltage,
    mpptCount: INVERTER_CATALOG[0].mpptCount,
    maxCurrentPerMppt: INVERTER_CATALOG[0].maxCurrentPerMppt,
    mpptVoltageMin: INVERTER_CATALOG[0].mpptVoltageMin,
    mpptVoltageMax: INVERTER_CATALOG[0].mpptVoltageMax,
    maxAcCurrent: INVERTER_CATALOG[0].maxAcCurrent,
    acVoltage: INVERTER_CATALOG[0].acVoltage,
    phase: INVERTER_CATALOG[0].phase,
  }));

  // Design ambient temperature extremes for temperature-corrected string
  // sizing. Manual placeholder for now - the site electrical fields step
  // (ROADMAP.md) will replace this with a value derived from the site's
  // fetched historical temperature data.
  const [designTemp, setDesignTemp] = useState(initialDesignData?.designTemp ?? { min: 0, max: 50 });

  // How many inverters a grid's panel count gets sized for, before MPPT
  // capacity alone would force more - see gridInverterAssignment.js.
  const [targetDcAcRatio, setTargetDcAcRatio] = useState(initialDesignData?.targetDcAcRatio ?? 1.05);

  // Undo/redo over the site's actual document state (roofs, obstacles,
  // their generated layouts, and the shared panel spec) - not view state
  // like which roof is selected, the plan's own pan/zoom, or the sun
  // date/time, none of which anyone would think of as an "edit" to undo.
  // `past`/`future` hold full snapshots rather than diffs - simple, and
  // this app's state is small enough that the cost of copying it on every
  // edit is negligible.
  const historyRef = useRef<{ past: any[]; future: any[] }>({ past: [], future: [] });
  // The most recently seen (and already-recorded) snapshot - compared
  // against on every change to know what to push onto `past`. Starts null
  // so the very first render doesn't get recorded as a change from nothing.
  const lastSnapshotRef = useRef<any>(null);
  // Set for the one render triggered by undo()/redo() itself restoring
  // state, so the watcher effect below treats it as "now caught up" rather
  // than a new edit to record (which would immediately clobber the redo
  // stack right after every undo).
  const isRestoringHistoryRef = useRef(false);
  // Set for the duration of a multi-step drag (dragging a roof vertex/edge,
  // moving or rotating selected panels) so the dozens of intermediate
  // state updates a single drag gesture produces collapse into one undo
  // step, taken once the drag actually ends - rather than one step per
  // mousemove, which would make undo nearly useless during a drag.
  const suspendHistoryRef = useRef(false);
  // Unused value - its setter just forces a re-render whenever historyRef
  // mutates (past/future.length), since mutating a ref alone doesn't.
  const [, setHistoryVersion] = useState(0);

  useEffect(() => {
    // Grids live on the roof itself now (roof.grids), so `roofs` alone
    // already covers every generated layout - no separate layoutsByRoof to
    // snapshot.
    const snapshot = { roofs, obstacles, panelSpec, inverterChoice };
    if (isRestoringHistoryRef.current) {
      isRestoringHistoryRef.current = false;
      lastSnapshotRef.current = snapshot;
      return;
    }
    if (suspendHistoryRef.current) return;
    if (lastSnapshotRef.current) {
      const h = historyRef.current;
      h.past.push(lastSnapshotRef.current);
      if (h.past.length > 50) h.past.shift();
      h.future = [];
      setHistoryVersion((v) => v + 1);
    }
    lastSnapshotRef.current = snapshot;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roofs, obstacles, panelSpec, inverterChoice]);

  function applyHistorySnapshot(snapshot) {
    isRestoringHistoryRef.current = true;
    setRoofs(snapshot.roofs);
    setObstacles(snapshot.obstacles);
    setPanelSpec(snapshot.panelSpec);
    setInverterChoice(snapshot.inverterChoice);
    setSelectedRoofId(null);
    setSelectedObstacleId(null);
    setSelectedGridKeys(new Set());
    setOutputResult(null);
    setCost(null);
  }

  function undo() {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const prev = h.past.pop();
    h.future.push(lastSnapshotRef.current);
    applyHistorySnapshot(prev);
    setHistoryVersion((v) => v + 1);
  }

  function redo() {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const next = h.future.pop();
    h.past.push(lastSnapshotRef.current);
    applyHistorySnapshot(next);
    setHistoryVersion((v) => v + 1);
  }

  useEffect(() => {
    function handleKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedDate, setSelectedDate] = useState(new Date(2026, 5, 21));
  const [selectedHour, setSelectedHour] = useState(12);
  const [mode, setMode] = useState('day');
  const [outputResult, setOutputResult] = useState<any>(null);

  const [sunPlaying, setSunPlaying] = useState(false);
  // Which of the right-side properties rail's grouped popovers is open
  // (a string key like 'dimensions'/'rackSettings', or null) - see the
  // right rail's own comment near the bottom of the return below. Reset
  // to null whenever the selection changes, in the same effect that
  // already resets addSideMode/gridDeleteMode.
  const [rightPanelOpenGroup, setRightPanelOpenGroup] = useState<any>(null);

  // Display-only - every roof/panel/obstacle field and every calculation
  // stays in meters regardless of this (see metersToFeet/feetToMeters
  // above); toggling this just changes how lengths are shown/entered.
  const [units, setUnits] = useState('m');

  // Solar efficiency analysis - 2D plan only (see README's "Using the app"
  // and AGENTS.md's "Panel selection & editing" for why panel-level
  // features stay 2D-only in this app).
  const [efficiencyView, setEfficiencyView] = useState(false);
  // Roof-wide sun exposure heatmap (see roofSunSamples/sunExposureColor
  // below) - independent of efficiencyView, which is per-panel and needs
  // an actual grid to exist first.
  const [shadowAnalysis, setShadowAnalysis] = useState(false);
  // Which sun-exposure cell the pointer is currently over (see
  // onSunHeatmapMouseMove below) - {pct, clientX, clientY} in viewport
  // pixels (not SVG/world coords) so the floating readout can be rendered
  // as a plain fixed-position HTML label, or null when the pointer isn't
  // over any cell/the view isn't showing the heatmap at all.
  const [sunHoverInfo, setSunHoverInfo] = useState<any>(null);

  // Animates selectedHour through the 3D view's own 5:00-19:00 range while
  // playing, looping back to the start rather than stopping dead at 19:00 -
  // a continuous shading/output preview instead of only one manually-picked
  // time at a time (see README's "View layout" entry).
  useEffect(() => {
    if (!sunPlaying) return;
    const id = setInterval(() => {
      setSelectedHour((h) => (h >= 19 ? 5 : h + 0.5));
    }, 400);
    return () => clearInterval(id);
  }, [sunPlaying]);

  const [assumptions, setAssumptions] = useState({ systemDerate: 0.85, diffuseFraction: 0.3 });
  const [pricing, setPricing] = useState({ panelPricePerW: 20, structureRatePerMeter: 600, mountCostPerPanel: 400 });
  const [cost, setCost] = useState<any>(null);

  // Every roof's own polygon, kept in world (site-local-meters) coordinates
  // — the same coordinate system obstacles already use, so panels/racks
  // generated for one roof never need translating relative to another.
  const roofPolygons = useMemo(() => roofs.map((r) => ({ id: r.id, polygon: getRoofPolygon(r) })), [roofs]);
  // The margin band highlight (2D plan below, and Scene3D's own copy) needs
  // each roof's *usable* (inset-by-edge-margin) polygon alongside its outer
  // one - kept as a separate map rather than folding into roofPolygons
  // above, since that one's also passed straight into Scene3D as `roofs`
  // and every other reader of it only ever wants the plain outer polygon.
  const roofUsablePolygons = useMemo(() => roofs.map((r) => ({ id: r.id, polygon: roofUsablePolygon(r) })), [roofs]);
  const liveCombinedExtent = useMemo(() => {
    if (roofPolygons.length === 0) return 40; // default view span before anything's drawn
    const xs = roofPolygons.flatMap((r) => r.polygon.map((p) => Math.abs(p.x)));
    const ys = roofPolygons.flatMap((r) => r.polygon.map((p) => Math.abs(p.y)));
    return Math.max(...xs, ...ys) * 2;
  }, [roofPolygons]);
  // The auto-fit view span above is recomputed from every roof's *current*
  // polygon on every render - fine normally (it only changes when a roof's
  // shape/count actually changes), but a roof drag moves that same polygon
  // on every single mousemove, which fed straight back into this and made
  // the whole plan visibly zoom in/out as the roof got nearer to or farther
  // from the origin mid-drag. Freeze it to whatever it was the instant the
  // drag started (see startRoofDrag) and hold that until the drag ends, so
  // panning the roof around never rescales the view out from under it.
  const combinedExtent = (movingRoof && frozenExtentRef.current != null) ? frozenExtentRef.current : liveCombinedExtent;
  const halfExtent = combinedExtent / 2 + 8;
  const scale = (520 / (halfExtent * 2)) * planZoom;
  const center = 280;
  const toScreen = (x, y) => ({ sx: center + panOffset.x + x * scale, sy: center + panOffset.y - y * scale });

  function onPlanWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setPlanZoom((z) => Math.min(6, Math.max(minPlanZoom, z * factor)));
  }

  // Where the site-wide satellite captures (see handleLocationConfirm) sit
  // in the engine's local-meters space, so they can be drawn under the plan
  // view / textured onto the 3D ground plane at the right size and
  // position. Centered on `location` itself, which is by construction the
  // local-meters origin (0,0) — shared backdrop for every roof, not
  // recaptured per roof.
  function computeLocationImagePlacement(mi) {
    if (!mi) return null;
    const mpp = metersPerPixel(mi.centerLat, mi.zoom, 1);
    const widthMeters = mi.sizePx * mpp;
    return { cx: 0, cy: 0, widthMeters, heightMeters: widthMeters, url: mi.url };
  }
  const backdropPlacement = useMemo(
    () => computeLocationImagePlacement(siteImages.locationImage),
    [siteImages.locationImage]
  );
  const backdropWidePlacement = useMemo(
    () => computeLocationImagePlacement(siteImages.locationImageWide),
    [siteImages.locationImageWide]
  );

  // Zooming out shrinks everything toward the view's center, so past a
  // point the (finite) captured image no longer covers the full viewBox
  // and plain background peeks out around it. Without a map image the
  // background already fills the whole view at any zoom, so 0.3x is fine;
  // with one, floor the zoom-out so the image's own span still covers the
  // widest the view can get.
  let minPlanZoom = 0.3;
  if (backdropPlacement) {
    const baseScale = 520 / (halfExtent * 2);
    const viewSpanAt1x = 560 / baseScale;
    const imageSpan = Math.min(backdropPlacement.widthMeters, backdropPlacement.heightMeters);
    minPlanZoom = Math.max(0.3, Math.min(1, viewSpanAt1x / imageSpan));
  }

  // Sun position doesn't depend on any particular roof, just location/time —
  // computed once and shared by every roof's own shading calc below.
  const sunPos = useMemo(
    () => solarPosition(location.lat, location.lon, selectedDate, selectedHour, location.tz),
    [location, selectedDate, selectedHour]
  );

  // Each grid's own live shading (drives the plan view + "shaded right now"
  // readout), keyed by gridKey — obstacles are shared/global, but which of
  // them can reach a given roof (and how long their shadow is once they do)
  // depends on that roof's own elevation, so this can't be computed once
  // for the whole site. Uses resolvedGridPanels so a rotated grid's panels
  // are shaded/shown where they actually are, not their pre-rotation
  // packed position (see layoutEngine.js's comment above gridPivot).
  const instantByGrid = useMemo(() => {
    const m: Record<string, any> = {};
    roofs.forEach((roof) => {
      roof.grids.forEach((grid) => {
        m[gridKey(roof.id, grid.id)] = getInstantShading({
          location, date: selectedDate, hour: selectedHour, obstacles,
          panels: resolvedGridPanels(grid), roofs, targetBuildingHeight: roof.buildingHeight,
        });
      });
    });
    return m;
  }, [location, selectedDate, selectedHour, obstacles, roofs]);

  // Mounting structure per grid, keyed by gridKey - computed from the
  // grid's own unrotated packed geometry (rackX/rackY), since a grid's
  // `rotation` is a presentation-only transform applied at render time in
  // Scene3D, not baked into the packed data (see layoutEngine.js).
  const structuresByGrid = useMemo(() => {
    const m: Record<string, any> = {};
    roofs.forEach((roof) => {
      roof.grids.forEach((grid) => {
        m[gridKey(roof.id, grid.id)] = computeStructure({ roof, layout: grid });
      });
    });
    return m;
  }, [roofs]);

  // Solar efficiency analysis (2D plan only, see the efficiencyView toggle
  // below): each panel's own *annual* output (full-year aggregate, same
  // mode Output estimate's own "Year" button uses) as a % of whichever
  // panel on the whole site gets the most energy - a panel shaded only in
  // one season reads correctly as "mostly fine" rather than being judged
  // against a single arbitrary day. Only computed while the view is
  // actually on - computeOutput's per-panel loop isn't free, and nothing
  // else needs perPanelKWh.
  // Keyed by gridKey -> { [panelId]: pct } - both the 2D plan and Scene3D
  // look this up per grid now that a roof can (eventually) hold more than
  // one. Uses resolvedGrid so a rotated grid's own facing is accounted for
  // in the output math, not just its pre-rotation azimuth.
  const efficiencyByGrid = useMemo(() => {
    const byGrid: Record<string, any> = {};
    if (!efficiencyView) return byGrid;
    let maxKWh = 0;
    const perGridKWh: Record<string, any> = {};
    roofs.forEach((roof) => {
      roof.grids.forEach((grid) => {
        if (!grid || grid.count === 0) return;
        const r = computeOutput({
          layout: resolvedGrid(grid), obstacles, location, mode: 'year', date: selectedDate,
          monthlyGHI, panelSpec,
          systemDerate: assumptions.systemDerate, diffuseFraction: assumptions.diffuseFraction,
          roofs, targetBuildingHeight: roof.buildingHeight,
        });
        perGridKWh[gridKey(roof.id, grid.id)] = r.perPanelKWh || {};
        Object.values(r.perPanelKWh || {}).forEach((kwh) => { if (kwh > maxKWh) maxKWh = kwh; });
      });
    });
    roofs.forEach((roof) => {
      roof.grids.forEach((grid) => {
        const key = gridKey(roof.id, grid.id);
        const kWhMap = perGridKWh[key];
        if (!kWhMap) return;
        const pctMap: Record<string, number> = {};
        Object.entries(kWhMap).forEach(([panelId, kwh]: [string, any]) => {
          pctMap[panelId] = maxKWh > 0 ? Math.round((100 * kwh) / maxKWh) : 0;
        });
        byGrid[key] = pctMap;
      });
    });
    return byGrid;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [efficiencyView, roofs, obstacles, location, selectedDate, panelSpec, assumptions]);

  // Green (100%, full sun) to yellow to red (least output) - a plain hue
  // sweep from green's hue (120) down to red's (0) is enough to read as a
  // gradient without needing a lookup table.
  function efficiencyColor(pct) {
    const hue = Math.max(0, Math.min(100, pct)) * 1.2;
    return `hsl(${hue}, 75%, 45%)`;
  }

  // Roof-wide shadow analysis (see the toolbar toggle further down): a
  // heatmap of annual sun exposure across the roof's own *surface* -
  // independent of any grid/panel, so it's usable right after Roof setup
  // to judge where panels are even worth placing before placing any. Each
  // sample point is treated as a synthetic 1m^2 "panel" (SUN_SAMPLE_SPEC
  // below gives efficiency exactly 1, so computeOutput's own per-panel kWh
  // *is* the point's raw annual irradiance in kWh/m^2 - not scaled by any
  // real panel's own wattage) sharing its roof's own tilt/azimuth (a flat
  // roof's auto-tilt/south-facing default, or a pitched roof's own
  // pitch/slope direction - every point on one roof shares the same
  // tilt/azimuth, only shading differs point to point) and run through the
  // exact same shading + incidence-angle math a real panel there would get,
  // for a full year (see computeOutput's own 'year' comment).
  //
  // Each point is colored by its own output as a % of *that same roof's own
  // clear-sky baseline* (same tilt/azimuth, zero obstacles) - not relative
  // to whatever the darkest/brightest point *elsewhere on site* happens to
  // be. Two earlier attempts tried a shared, relative scale (plain min/max,
  // then a 5th/95th percentile stretch) and both had the same underlying
  // problem: a single obstacle's own severity anywhere on site changed how
  // every *other* obstacle's real, unrelated shading looked, since they were
  // all being judged against each other rather than against a fixed
  // reference. A tank sitting directly on the roof legitimately blocks far
  // more of *its own* immediate surroundings than a modest building well off
  // the roof ever blocks of its - that's real and correct - but a shared
  // scale then had to choose whose severity anchored the whole gradient,
  // and adding the tank always won that fight, since its own worst point is
  // always going to be darker than a distant building's. Comparing each
  // point only to its own unobstructed potential sidesteps the whole
  // category of bug: adding an obstacle anywhere can only ever change the
  // color of points *it* actually shades, never anything else's.
  const SUN_SAMPLE_SPEC = { width: 1, height: 1, wattage: 1000 };
  const roofSunSamples = useMemo(() => {
    const byRoof: Record<string, any> = {};
    if (!shadowAnalysis) return byRoof;
    const cellW = Math.max(0.5, Math.min(3, panelSpec.width));
    const cellH = Math.max(0.5, Math.min(3, panelSpec.height));
    roofs.forEach((roof) => {
      const usable = roofUsablePolygon(roof);
      if (!usable || usable.length < 3) return;
      const xs = usable.map((p) => p.x), ys = usable.map((p) => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      let points: any[] = [];
      let cols: any[] = [];
      // Overscans the bounding box by a cell in every direction and skips
      // the old "only if this cell's own center is inside the polygon"
      // filter - for anything but a perfectly rectangular roof (see this
      // whole feature's own request: a hand-traced/trapezoidal outline),
      // that filter left ragged notches wherever the roof's real edge cut
      // between two grid cells' centers, since a fully-excluded cell just
      // isn't there for the actual smooth edge (drawn via the clipPath
      // below, at render time) to trim - it can only cut down what's
      // already rendered, not fill in a gap. Rendering every cell in the
      // (overscanned) bounding box and letting the clip path do all the
      // shape-conforming instead guarantees full coverage right up to the
      // roof's real, possibly non-rectangular edge. Kept as a column-major
      // `cols` grid (not just a flat list) so the smoothing pass below can
      // average each cell with its actual grid neighbors.
      let nextId = 0;
      for (let x = minX - cellW / 2; x < maxX + cellW; x += cellW) {
        let col: any[] = [];
        for (let y = minY - cellH / 2; y < maxY + cellH; y += cellH) {
          const p = { id: nextId++, x, y };
          points.push(p);
          col.push(p);
        }
        cols.push(col);
      }
      if (points.length === 0) return;
      const tilt = roof.type === 'pitched' ? roof.pitchDeg : computeAutoTilt(location);
      const azimuth = roof.type === 'pitched' ? slopeDirectionAzimuth(roof.slopeDirection || 'S') : (location.lat >= 0 ? 180 : 0);
      const r = computeOutput({
        layout: { tilt, azimuth, panels: points },
        obstacles, location, mode: 'year', date: selectedDate,
        monthlyGHI, panelSpec: SUN_SAMPLE_SPEC,
        systemDerate: 1, diffuseFraction: assumptions.diffuseFraction,
        roofs, targetBuildingHeight: roof.buildingHeight,
      });
      // This roof's own clear-sky ceiling - same tilt/azimuth, zero
      // obstacles, so every point on the roof would read identically (no
      // shading to differ by); one point is enough. Each point's color
      // below is this roof's own actual/baseline ratio, not a comparison
      // to any other point on site (see this whole memo's own comment).
      const baselineResult = computeOutput({
        layout: { tilt, azimuth, panels: [{ id: 'baseline', x: 0, y: 0 }] },
        obstacles: [], location, mode: 'year', date: selectedDate,
        monthlyGHI, panelSpec: SUN_SAMPLE_SPEC,
        systemDerate: 1, diffuseFraction: assumptions.diffuseFraction,
        roofs, targetBuildingHeight: roof.buildingHeight,
      });
      const baselineKWh = baselineResult.perPanelKWh?.baseline || 0;
      // The annual total is itself only ever an approximation - it samples
      // 12 representative days (one per month, see computeOutput's own
      // 'year' comment), not the full 365, and a real obstacle's shadow
      // is often narrower than one grid cell. Whether a *particular* cell
      // gets grazed by that thin, moving shadow band on any of the exact
      // 12 sampled dates is close to arbitrary, so two neighboring cells
      // just 1-2m apart could land on opposite sides of that lottery and
      // read as wildly different annual totals - real per-point noise,
      // but at a finer grain than a shadow's own edge actually resolves
      // to. A 3x3 box-average against each cell's own grid neighbors
      // smooths exactly that sampling noise back out into the same
      // continuous-looking gradient the shadow itself actually sweeps,
      // without needing to sample far more (and far more expensive) dates
      // per year just to get the same effect.
      const rawKWhById = r.perPanelKWh || {};
      const kWhById: Record<string, any> = {};
      cols.forEach((col, ci) => {
        col.forEach((p, ri) => {
          let sum = 0, count = 0;
          for (let dc = -1; dc <= 1; dc++) {
            const nc = cols[ci + dc];
            if (!nc) continue;
            for (let dr = -1; dr <= 1; dr++) {
              const np = nc[ri + dr];
              if (!np) continue;
              sum += rawKWhById[np.id] || 0;
              count++;
            }
          }
          kWhById[p.id] = count > 0 ? sum / count : (rawKWhById[p.id] || 0);
        });
      });
      byRoof[roof.id] = { points, cellW, cellH, kWhById, baselineKWh };
    });
    return byRoof;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shadowAnalysis, roofs, obstacles, location, selectedDate, monthlyGHI, assumptions.diffuseFraction, panelSpec.width, panelSpec.height]);

  // Classic blue (least sun) -> cyan -> green -> yellow -> orange -> red
  // (most) "jet" scale, matching how dedicated insolation-analysis tools
  // (PVsyst, Sefaira, Ladybug...) usually show this exact kind of map -
  // red reads as "hottest"/most exposed far more intuitively than yellow
  // ever did, and six stops spread real variation across visibly distinct
  // colors instead of one smooth blend between two.
  const SUN_EXPOSURE_STOPS = [
    [0, 20, 130], [0, 190, 220], [40, 200, 90], [255, 230, 20], [255, 140, 0], [214, 30, 30],
  ];
  function sunExposureColor(pct) {
    const raw = Math.max(0, Math.min(100, pct)) / 100;
    // A real obstacle's worst annual impact - even one that's tall, wide,
    // and close - still routinely lands in the 60-90% range at a low
    // latitude like this (see this feature's own history: the sun sits
    // high overhead most of the year here, so shadows are short for most
    // of it even from a substantial obstacle). Cubing first pulls that
    // same practically-relevant range much further toward the low end of
    // the scale before mapping to a color, so a genuine (if not total)
    // reduction actually lands somewhere visibly distinct (green/yellow
    // territory) instead of every real case bunching up in red - still
    // reaching pure red at 100% and pure blue at 0%, unchanged.
    const t = raw ** 3;
    const segments = SUN_EXPOSURE_STOPS.length - 1;
    const scaled = t * segments;
    const i = Math.min(segments - 1, Math.floor(scaled));
    const localT = scaled - i;
    const a = SUN_EXPOSURE_STOPS[i], b = SUN_EXPOSURE_STOPS[i + 1];
    const rgb = a.map((c, k) => Math.round(c + (b[k] - c) * localT));
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  const selectedRoof = roofs.find((r) => r.id === selectedRoofId) ?? null;
  const selectedObstacle = obstacles.find((o) => o.id === selectedObstacleId) ?? null;
  // Grid settings (tilt/row spacing/structure/panels-per-row) are only
  // editable when exactly one grid is selected (see README's "Panel grids"
  // entry) - `gridOwnerRoof` is that grid's own roof, used both for those
  // settings and for the roof-level "min pillar height" field, which stays
  // reachable whether the roof itself or one of its grids is selected.
  const selectedGridEntry = selectedGridKeys.size === 1 ? parseGridKey([...selectedGridKeys][0]) : null;
  const gridOwnerRoof = selectedGridEntry ? roofs.find((r) => r.id === selectedGridEntry.roofId) ?? null : null;
  const selectedGrid = selectedGridEntry ? findGrid(selectedGridEntry.roofId, selectedGridEntry.gridId) : null;

  // Switching what's selected (a different grid, a different roof/
  // obstacle, or deselecting entirely) exits whatever add/delete mode was
  // active and closes whichever right-rail popover was open - both are
  // only ever meaningful for the specific object whose own rail armed
  // them.
  useEffect(() => {
    setAddSideMode(null);
    setGridDeleteMode(null);
    setGridDeleteSelection(null);
    setRightPanelOpenGroup(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGrid?.id, selectedRoofId, selectedObstacleId]);

  const totalPanelCount = roofs.reduce((s, r) => s + r.grids.reduce((s2, g) => s2 + g.count, 0), 0);

  // Site-wide inverter assignment (see gridInverterAssignment.js): a grid
  // too big for one inverter gets its own dedicated inverter(s), but a grid
  // that fits within a single inverter's spare capacity is bin-packed
  // alongside other such grids so two or more small grids can share one
  // inverter's separate MPPT channels instead of each getting a mostly-idle
  // inverter of its own - preferring physically nearby grids over distant
  // ones, using each grid's centroid in the same site-wide plan coordinates
  // as everything else on the canvas.
  function buildSiteGrids() {
    let grids: any[] = [];
    roofs.forEach((roof, roofIdx) => {
      roof.grids.forEach((grid, gridIdx) => {
        if (grid.count <= 0) return;
        const pts = grid.footprintPolygon;
        const centroid = pts && pts.length > 0
          ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }
          : null;
        grids.push({ key: gridKey(roof.id, grid.id), label: `${roof.label || `Roof ${roofIdx + 1}`} · Grid ${gridIdx + 1}`, panelCount: grid.count, centroid });
      });
    });
    return grids;
  }

  const sitePlan = useMemo(() => {
    return assignSiteToInverters({
      grids: buildSiteGrids(), module: panelSpec, inverter: inverterChoice,
      designMinTempC: designTemp.min, designMaxTempC: designTemp.max, targetDcAcRatio,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roofs, panelSpec, inverterChoice, designTemp, targetDcAcRatio]);
  const totalCapacityKW = roofs.reduce((s, r) => s + r.grids.reduce((s2, g) => s2 + g.capacityKW, 0), 0);

  // If a smaller catalog inverter (same make - keeps the voltage class/
  // window consistent) would size the whole site into the same or fewer
  // inverters with meaningfully better DC:AC utilization, surface it here
  // rather than leaving every grid stuck on whatever's picked in step 2 -
  // see gridInverterAssignment.js's own comment for the "why" behind this.
  const inverterSuggestion = useMemo(() => {
    if (!sitePlan.valid || sitePlan.inverters.length === 0) return null;
    const currentUtilization = totalCapacityKW / (sitePlan.inverters.length * inverterChoice.acPowerKw);
    const alternatives = inverterCatalogModels(inverterChoice.make)
      .filter((m) => m.acPowerKw < inverterChoice.acPowerKw)
      .sort((a, b) => a.acPowerKw - b.acPowerKw);
    for (const candidate of alternatives) {
      const trial = assignSiteToInverters({
        grids: buildSiteGrids(), module: panelSpec, inverter: candidate,
        designMinTempC: designTemp.min, designMaxTempC: designTemp.max, targetDcAcRatio,
      });
      if (!trial.valid || trial.inverters.length > sitePlan.inverters.length) continue;
      const suggestedUtilization = totalCapacityKW / (trial.inverters.length * candidate.acPowerKw);
      if (suggestedUtilization - currentUtilization >= 0.1) {
        return { ...candidate, numInverters: trial.inverters.length, currentUtilization, suggestedUtilization };
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitePlan, panelSpec, inverterChoice, designTemp, targetDcAcRatio, totalCapacityKW]);
  const structureTotals = useMemo(() => {
    const totals: Record<string, any> = {};
    Object.values(structuresByGrid as Record<string, any>).forEach((s: any) => {
      Object.entries(s.totals || {}).forEach(([kind, t]: [string, any]) => {
        if (!totals[kind]) totals[kind] = { length: 0, count: 0 };
        totals[kind].length += t.length;
        totals[kind].count += t.count;
      });
    });
    return totals;
  }, [structuresByGrid]);

  function addObstacle(kind, x, y) {
    const preset = OBSTACLE_PRESETS[kind];
    const extra = kind === 'tree' ? { canopy: TREE_CANOPIES[Math.floor(Math.random() * TREE_CANOPIES.length)] } : {};
    const id = Date.now();
    setObstacles((obs) => [...obs, { id, ...preset, ...extra, x, y }]);
    setPlacingShape(null);
    selectObstacle(id);
  }

  // A "drawable" obstacle (see OBSTACLE_PRESETS) is traced freehand on the
  // 2D plan instead of click-placed at one fixed default size/shape - its
  // footprint becomes exactly the polygon traced.
  function addDrawnObstacle(kind, points) {
    if (points.length < 3) return;
    const preset = OBSTACLE_PRESETS[kind];
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const id = Date.now();
    setObstacles((obs) => [...obs, { id, ...preset, polygon: points, x: Number(cx.toFixed(1)), y: Number(cy.toFixed(1)) }]);
    setPlacingShape(null);
    setObstacleDrawPoints([]);
    selectObstacle(id);
  }

  function updateObstacle(id, field, value) {
    setObstacles((obs) => obs.map((o) => (o.id === id ? { ...o, [field]: value } : o)));
  }

  function removeObstacle(id) {
    setObstacles((obs) => obs.filter((o) => o.id !== id));
    setSelectedObstacleId((sel) => (sel === id ? null : sel));
  }

  // Roof and obstacle selection are mutually exclusive — selecting either
  // one (from either list, the 2D plan, or the 3D view) is what drives
  // which one's properties show in the footer below the plan, so only one
  // can be "the" current selection at a time.
  function selectRoof(id) {
    setSelectedRoofId(id);
    setSelectedObstacleId(null);
    setSelectedGridKeys(new Set());
  }

  function selectObstacle(id) {
    setSelectedObstacleId(id);
    setSelectedRoofId(null);
    setSelectedGridKeys(new Set());
  }

  // Only these fields actually change what generateLayout would pack -
  // see its own roof-field reads in layoutEngine.js: getRoofPolygon (width/
  // length/polygon), edgeMargin/edgeMarginOverrides, type, slopeDirection,
  // and pitchDeg (which a pitched roof's auto-tilt grids store into their
  // own `tilt` - not a packing/position change by itself, but leaving it
  // stale there would disagree with computeStructure's own live read of
  // the roof's *current* pitchDeg). Every other roof field - buildingHeight,
  // boundaryHeight, minPillarHeight - is read fresh off the roof at
  // render time by Scene3D/computeStructure, never baked into a grid, so
  // changing it doesn't invalidate any existing grid at all.
  const ROOF_FIELDS_NEEDING_REPACK = new Set(['width', 'length', 'type', 'pitchDeg', 'slopeDirection', 'edgeMargin']);

  function updateRoof(id, field, value) {
    // A whole-roof grid's footprint/packing is derived from *some* of the
    // fields changed here (see ROOF_FIELDS_NEEDING_REPACK just above) -
    // clearing its grids for those keeps it from silently going stale
    // rather than reflecting a shape it was never actually packed
    // against. Matches this app's existing "settings change -> Generate
    // Layout again" pattern. Bug once here: this used to clear grids for
    // *every* field, including ones like minPillarHeight that don't
    // affect packing at all - reported as "the grid disappears" the
    // moment that slider (exposed in the grid's own popup, even though
    // it's a roof-level field) was touched.
    const needsRepack = ROOF_FIELDS_NEEDING_REPACK.has(field);
    setRoofs((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value, ...(needsRepack ? { grids: [] } : {}) } : r)));
    if (needsRepack) {
      setSelectedGridKeys((keys) => new Set([...keys].filter((k) => parseGridKey(k).roofId !== id)));
    }
    setOutputResult(null);
    setCost(null);
  }

  // Sets `roof.edgeMarginOverrides[edgeIndex]` for every edge currently in
  // `edgeIndices` to `value` (or, when `value` is null, deletes those
  // entries so those edges fall back to the roof's own default margin) -
  // shared by the margin-editor UI's "apply to selected edges" field and
  // its "reset" action.
  function setEdgeMarginOverrides(id, edgeIndices, value) {
    setRoofs((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      const overrides = { ...(r.edgeMarginOverrides || {}) };
      edgeIndices.forEach((i) => {
        if (value == null) delete overrides[i];
        else overrides[i] = value;
      });
      return { ...r, edgeMarginOverrides: overrides, grids: [] };
    }));
    setSelectedGridKeys((keys) => new Set([...keys].filter((k) => parseGridKey(k).roofId !== id)));
    setOutputResult(null);
    setCost(null);
  }

  function toggleMarginEdge(edgeIndex, additive) {
    setSelectedMarginEdges((sel) => {
      const next = additive ? new Set(sel) : new Set();
      if (next.has(edgeIndex)) next.delete(edgeIndex);
      else next.add(edgeIndex);
      return next;
    });
  }

  function removeRoof(id) {
    setRoofs((rs) => rs.filter((r) => r.id !== id));
    setSelectedRoofId((sel) => (sel === id ? null : sel));
    setSelectedGridKeys((keys) => new Set([...keys].filter((k) => parseGridKey(k).roofId !== id)));
    setOutputResult(null);
    setCost(null);
  }

  // A roof's shown name — its own explicit `label` once mirroring has set
  // one (see mirrorRoof below), otherwise the plain 1-based position it
  // still falls back to everywhere else in this file.
  function roofLabel(roof, index) {
    return roof.label || `Roof ${index + 1}`;
  }

  // Mirrors a roof across one of its own polygon edges: a new roof is
  // inserted right after it in the list, its polygon reflected across that
  // edge's line (see reflectPointAcrossLine), otherwise an exact copy of
  // the original's own settings (type, pitch, building height, boundary,
  // mounting...). This is a one-time copy, not a live link - each half is
  // independently editable afterward, same as any other roof. Both halves
  // get a "-left"/"-right" label off the pair's shared base name so they
  // read as a matched set in the roof list.
  function mirrorRoof(id, edgeIndex) {
    const idx = roofs.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const roof = roofs[idx];
    const poly = getRoofPolygon(roof);
    const a = poly[edgeIndex], b = poly[(edgeIndex + 1) % poly.length];
    const mirroredPolygon = poly.map((p) => reflectPointAcrossLine(p, a, b));
    const baseLabel = (roof.label || roofLabel(roof, idx)).replace(/-(left|right)$/, '');
    const original = { ...roof, polygon: poly, label: `${baseLabel}-left` };
    const mirroredRoofBase = { ...roof, id: Date.now(), polygon: mirroredPolygon, label: `${baseLabel}-right`, grids: [] };
    // Regenerate the mirrored roof's own grid(s) against its own (reflected)
    // footprint, carrying over each source grid's own tilt/row-spacing/
    // structure/panels-per-row/orientation settings exactly - a one-time
    // copy, not a live link, same as every other field mirrorRoof
    // duplicates.
    const mirroredGrids = roof.grids.map((g) => {
      const gridSettings = { panelTiltDeg: g.panelTiltDeg, rowSpacing: g.rowSpacing, structureStrategy: g.structureStrategy, panelsPerRow: g.panelsPerRow, orientation: g.orientation };
      const footprintPolygon = g.footprintPolygon === poly ? mirroredPolygon : g.footprintPolygon.map((p) => reflectPointAcrossLine(p, a, b));
      const next = generateLayout({ roof: mirroredRoofBase, footprintPolygon, gridSettings, panelSpec, obstacles, location });
      return { ...next, id: Date.now() + Math.floor(Math.random() * 1000), source: g.source };
    });
    const mirrored = { ...mirroredRoofBase, grids: mirroredGrids };
    setRoofs((rs) => {
      const next = [...rs];
      next[idx] = original;
      next.splice(idx + 1, 0, mirrored);
      return next;
    });
    selectRoof(mirrored.id);
    setMirrorRoofId(null);
    setHoveredMirrorEdge(null);
  }

  function startRoofDraw() {
    resetClickSuppression();
    setDrawingRoof(true);
    setRoofDrawPoints([]);
    setPlacingShape(null);
  }

  function cancelRoofDraw() {
    setDrawingRoof(false);
    setRoofDrawPoints([]);
  }

  function finishRoofDraw(points) {
    if (points.length < 3) return;
    const id = Date.now();
    setRoofs((rs) => [...rs, { ...ROOF_DEFAULTS, id, polygon: points, grids: [] }]);
    selectRoof(id);
    setDrawingRoof(false);
    setRoofDrawPoints([]);
    setOutputResult(null);
    setCost(null);
  }

  function handleLocationConfirm({ lat, lon }) {
    // "Next: Configuration" calls this every time it's clicked, including
    // when the user has already confirmed this exact location and just
    // navigated back to step 1 - only redo the heavy side effects (wiping
    // roofs, refetching site data) when the location is actually new.
    if (locationConfirmed && lat === location.lat && lon === location.lon) return;
    setLocation((loc) => ({ ...loc, lat, lon }));
    // Any existing roofs/imagery were captured relative to the old location
    // — moving the site invalidates them, so clear the roofs rather than
    // leave outlines silently pointing at the wrong place on a future 3D
    // texture.
    const locationImage = GOOGLE_MAPS_API_KEY ? buildLocationPreviewImage({ apiKey: GOOGLE_MAPS_API_KEY, lat, lon }) : null;
    const locationImageWide = GOOGLE_MAPS_API_KEY ? buildWideLocationPreviewImage({ apiKey: GOOGLE_MAPS_API_KEY, lat, lon }) : null;
    setSiteImages({ locationImage, locationImageWide });
    setRoofs([]);
    setSelectedRoofId(null);
    setOutputResult(null);
    setCost(null);
    // Location's confirmed — the center pane now switches from the map to
    // the (still empty) 2D plan, backed by the real imagery just captured,
    // while staying on step 1 - the user reviews Configuration (step 2)
    // next, then explicitly moves on to Roof setup (step 3) themselves;
    // see the "Next: Configuration" / "Next: Roof setup" buttons below.
    setLocationOpen(false);
    setViewMode('plan');
    setMapMode(null);
    setLocationConfirmed(true);

    // Kick off this site's own irradiance fetch right away rather than
    // waiting for Output estimate (step 5) - by the time the user gets
    // there (after drawing a roof and placing panels) it's almost always
    // already resolved. See irradiance.js's own comment for why NASA
    // POWER specifically, and why it's a single swappable function.
    const requestId = ++ghiRequestIdRef.current;
    setGhiStatus('loading');
    fetchMonthlyGHI({ lat, lon })
      .then((values) => {
        if (ghiRequestIdRef.current !== requestId) return; // superseded by a later location confirm
        setMonthlyGHI(values);
        setGhiStatus('ready');
      })
      .catch(() => {
        if (ghiRequestIdRef.current !== requestId) return;
        setMonthlyGHI(SAMPLE_MONTHLY_GHI);
        setGhiStatus('error');
      });

    // Same fetch-on-confirm pattern for the design min/max temperature that
    // feeds stringSizing.js. On failure the manual designTemp value the user
    // already had (or its 0/50 default) is left in place rather than reset.
    const tempRequestId = ++designTempRequestIdRef.current;
    setDesignTempStatus('loading');
    fetchDesignTemperatureRange({ lat, lon })
      .then((range) => {
        if (designTempRequestIdRef.current !== tempRequestId) return;
        setDesignTemp(range);
        setDesignTempStatus('ready');
      })
      .catch(() => {
        if (designTempRequestIdRef.current !== tempRequestId) return;
        setDesignTempStatus('error');
      });
  }

  // The svg's container isn't square, but its viewBox is — with
  // preserveAspectRatio="xMidYMid meet" the content is scaled to fit the
  // limiting dimension and letterboxed (centered) along the other axis.
  // Naively dividing by rect.width/rect.height ignores that letterbox
  // offset, so clicks land off from the visible point whenever the
  // container's aspect ratio isn't 1:1 (the normal case).
  function svgContentScale() {
    const rect = svgRef.current.getBoundingClientRect();
    const vbSize = 560;
    return Math.min(rect.width / vbSize, rect.height / vbSize);
  }

  function clientToWorld(clientX, clientY) {
    const rect = svgRef.current.getBoundingClientRect();
    const vbSize = 560;
    const contentScale = svgContentScale();
    const offsetX = (rect.width - vbSize * contentScale) / 2;
    const offsetY = (rect.height - vbSize * contentScale) / 2;
    const sx = (clientX - rect.left - offsetX) / contentScale;
    const sy = (clientY - rect.top - offsetY) / contentScale;
    return { sx, sy, worldX: (sx - center - panOffset.x) / scale, worldY: (center + panOffset.y - sy) / scale };
  }

  // Live "N% sun" readout while the pointer sits over the sun-exposure
  // heatmap (see the "Shadow analysis" toggle and roofSunSamples) - the
  // heatmap's own cells are pointerEvents:'none' (so they never steal a
  // click meant for the roof/panels beneath - see that group's own
  // comment), so hover has to be tracked here instead, on the svg itself,
  // by converting the pointer's position to world coords and finding
  // whichever roof's sample cell it currently falls within. Cheap enough
  // to do on every mousemove - a few hundred points at most, and it exits
  // as soon as it finds a match.
  function onSunHeatmapMouseMove(e) {
    if (!shadowAnalysis) return;
    const { worldX, worldY } = clientToWorld(e.clientX, e.clientY);
    for (const { points, cellW, cellH, kWhById, baselineKWh } of Object.values(roofSunSamples)) {
      for (const p of points) {
        if (Math.abs(p.x - worldX) <= cellW / 2 && Math.abs(p.y - worldY) <= cellH / 2) {
          const pct = baselineKWh > 0 ? Math.round((100 * Math.min(baselineKWh, kWhById[p.id] || 0)) / baselineKWh) : 0;
          setSunHoverInfo({ pct, clientX: e.clientX, clientY: e.clientY });
          return;
        }
      }
    }
    setSunHoverInfo(null);
  }

  // A plain click on the plan starts a potential pan (see the mousemove/up
  // handlers below) rather than acting immediately — onSvgClick checks
  // whether the mouseup that follows actually moved the view, and only
  // then treats it as a pan instead of a click.
  function onSvgMouseDown(e) {
    if (drawingRoof || placingShape || placingGrid || draggingVertexIndex !== null || draggingEdgeIndex !== null) return;

    // Starting a drag inside a roof that actually has grids marquee-selects
    // them instead of panning the view - panning the background is still
    // available everywhere else (outside any roof, or a roof with no
    // generated grid yet).
    const { worldX, worldY } = clientToWorld(e.clientX, e.clientY);
    const hitRoof = roofs.find((r) => pointInPolygon({ x: worldX, y: worldY }, getRoofPolygon(r)));
    if (hitRoof && hitRoof.grids.some((g) => g.count > 0)) {
      boxSelectRef.current = {
        roofId: hitRoof.id, clientX: e.clientX, clientY: e.clientY, moved: false,
        x0: worldX, y0: worldY, x1: worldX, y1: worldY, additive: e.shiftKey,
      };
      setBoxSelectRect({ x0: worldX, y0: worldY, x1: worldX, y1: worldY });
      return;
    }

    panStartRef.current = { clientX: e.clientX, clientY: e.clientY, offsetX: panOffset.x, offsetY: panOffset.y, moved: false };
    setIsPanning(true);
  }

  useEffect(() => {
    if (!boxSelectRect) return;

    function handleMouseMove(e) {
      const start = boxSelectRef.current;
      if (!start) return;
      if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) > 3) start.moved = true;
      const { worldX, worldY } = clientToWorld(e.clientX, e.clientY);
      start.x1 = worldX;
      start.y1 = worldY;
      setBoxSelectRect({ x0: start.x0, y0: start.y0, x1: worldX, y1: worldY });
    }
    function handleMouseUp() {
      const r = boxSelectRef.current;
      if (r?.moved) {
        const minX = Math.min(r.x0, r.x1), maxX = Math.max(r.x0, r.x1);
        const minY = Math.min(r.y0, r.y1), maxY = Math.max(r.y0, r.y1);
        const roof = roofs.find((rr) => rr.id === r.roofId);
        // Any panel of a grid falling inside the marquee selects that
        // grid's every panel, not just the ones actually inside the box -
        // clicking/dragging over a grid means "this grid", not a partial
        // pick (see README's "Panel grids" entry).
        const hits = (roof?.grids || [])
          .filter((g) => resolvedGridPanels(g).some((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY))
          .map((g) => gridKey(r.roofId, g.id));
        setSelectedRoofId(null);
        setSelectedObstacleId(null);
        setSelectedGridKeys((prev) => (r.additive ? new Set([...prev, ...hits]) : new Set(hits)));
        swallowClickAfterDragRef.current = true;
      } else if (r?.clickFallbackGridKey) {
        // The drag started right on a panel (see startPanelDrag) but never
        // actually moved - a plain click, so it selects just that panel's
        // whole grid rather than an empty marquee.
        setSelectedRoofId(null);
        setSelectedObstacleId(null);
        setSelectedGridKeys(new Set([r.clickFallbackGridKey]));
      }
      boxSelectRef.current = null;
      setBoxSelectRect(null);
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!boxSelectRect]);

  useEffect(() => {
    if (!isPanning) return;

    function handleMouseMove(e) {
      const start = panStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.clientX;
      const dy = e.clientY - start.clientY;
      if (Math.hypot(dx, dy) > 3) start.moved = true;
      const contentScale = svgContentScale();
      setPanOffset({ x: start.offsetX + dx / contentScale, y: start.offsetY + dy / contentScale });
    }
    function handleMouseUp() {
      setIsPanning(false);
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanning]);

  function onSvgClick(e) {
    // A drag that actually moved the view was a pan, not a click — swallow
    // the click that naturally follows mouseup so it doesn't also deselect/
    // place/draw at the drop point.
    if (panStartRef.current?.moved) {
      panStartRef.current = null;
      return;
    }
    panStartRef.current = null;

    // Same idea for a marquee or panel-move drag that actually moved -
    // the click that follows mouseup would otherwise deselect everything
    // the drag just selected (see swallowClickAfterDragRef above).
    if (swallowClickAfterDragRef.current) {
      swallowClickAfterDragRef.current = false;
      return;
    }

    // Clicking back on the trace's own first point closes it immediately
    // (below) — but a real double-click landing there fires two separate
    // click events at that same spot, and the second one would otherwise
    // land here a moment later and immediately deselect the roof the first
    // click just finished and selected. Swallow exactly that one follow-up
    // click rather than treating it as a click on empty space.
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }

    const { sx, sy, worldX, worldY } = clientToWorld(e.clientX, e.clientY);

    if (drawingRoof) {
      if (roofDrawPoints.length >= 3) {
        const first = roofDrawPoints[0];
        const firstScreen = toScreen(first.x, first.y);
        if (Math.hypot(sx - firstScreen.sx, sy - firstScreen.sy) < 12) {
          suppressNextClickRef.current = true;
          finishRoofDraw(roofDrawPoints);
          return;
        }
      }
      setRoofDrawPoints((pts) => [...pts, { x: Number(worldX.toFixed(2)), y: Number(worldY.toFixed(2)) }]);
      return;
    }

    if (placingShape) {
      if (OBSTACLE_PRESETS[placingShape]?.drawable) {
        if (obstacleDrawPoints.length >= 3) {
          const first = obstacleDrawPoints[0];
          const firstScreen = toScreen(first.x, first.y);
          if (Math.hypot(sx - firstScreen.sx, sy - firstScreen.sy) < 12) {
            suppressNextClickRef.current = true;
            addDrawnObstacle(placingShape, obstacleDrawPoints);
            return;
          }
        }
        setObstacleDrawPoints((pts) => [...pts, { x: Number(worldX.toFixed(2)), y: Number(worldY.toFixed(2)) }]);
        return;
      }
      addObstacle(placingShape, Number(worldX.toFixed(1)), Number(worldY.toFixed(1)));
      return;
    }

    if (placingGrid) {
      if (gridDrawPoints.length >= 3) {
        const first = gridDrawPoints[0];
        const firstScreen = toScreen(first.x, first.y);
        if (Math.hypot(sx - firstScreen.sx, sy - firstScreen.sy) < 12) {
          suppressNextClickRef.current = true;
          addGridFromPolygon(gridDrawPoints);
          return;
        }
      }
      setGridDrawPoints((pts) => [...pts, { x: Number(worldX.toFixed(2)), y: Number(worldY.toFixed(2)) }]);
      return;
    }

    if (mirrorRoofId) {
      setMirrorRoofId(null);
      setHoveredMirrorEdge(null);
      return;
    }

    if (marginEditRoofId) {
      setMarginEditRoofId(null);
      setHoveredMarginEdge(null);
      setSelectedMarginEdges(new Set());
      return;
    }

    if (addSideMode) {
      setAddSideMode(null);
      setHoveredAddSide(null);
      return;
    }

    setSelectedObstacleId(null);
    setSelectedRoofId(null);
    setSelectedGridKeys(new Set());
  }

  function onSvgDoubleClick() {
    if (drawingRoof && roofDrawPoints.length >= 3) finishRoofDraw(roofDrawPoints);
    if (placingShape && OBSTACLE_PRESETS[placingShape]?.drawable && obstacleDrawPoints.length >= 3) {
      addDrawnObstacle(placingShape, obstacleDrawPoints);
    }
    if (placingGrid && gridDrawPoints.length >= 3) {
      addGridFromPolygon(gridDrawPoints);
    }
  }

  function startVertexDrag(e, index) {
    e.stopPropagation();
    suspendHistoryRef.current = true;
    setDraggingVertexIndex(index);
  }

  useEffect(() => {
    if (draggingVertexIndex === null || selectedRoofId === null) return;

    function handleMouseMove(e) {
      const { worldX, worldY } = clientToWorld(e.clientX, e.clientY);
      setRoofs((rs) => rs.map((r) => {
        if (r.id !== selectedRoofId || !r.polygon) return r;
        const next = r.polygon.slice();
        next[draggingVertexIndex] = { x: Number(worldX.toFixed(2)), y: Number(worldY.toFixed(2)) };
        return { ...r, polygon: next };
      }));
    }
    function handleMouseUp() {
      setDraggingVertexIndex(null);
      // The roof's own footprint just changed shape - its whole-roof grid
      // was packed against the old one, so it goes stale the same way
      // updateRoof's field changes do (see its own comment above).
      setRoofs((rs) => rs.map((r) => (r.id === selectedRoofId ? { ...r, grids: [] } : r)));
      setSelectedGridKeys((keys) => new Set([...keys].filter((k) => parseGridKey(k).roofId !== selectedRoofId)));
      setOutputResult(null);
      setCost(null);
      suspendHistoryRef.current = false;
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingVertexIndex, selectedRoofId]);

  // Dragging an edge moves the whole side — both its endpoints — by the
  // same delta, rather than reshaping just one corner the way a vertex drag
  // does.
  function startEdgeDrag(e, index) {
    e.stopPropagation();
    const { worldX, worldY } = clientToWorld(e.clientX, e.clientY);
    edgeDragStartRef.current = { startX: worldX, startY: worldY, origPolygon: selectedRoof.polygon.map((p) => ({ ...p })) };
    suspendHistoryRef.current = true;
    setDraggingEdgeIndex(index);
  }

  useEffect(() => {
    if (draggingEdgeIndex === null || selectedRoofId === null) return;

    function handleMouseMove(e) {
      const start = edgeDragStartRef.current;
      if (!start) return;
      const { worldX, worldY } = clientToWorld(e.clientX, e.clientY);
      const dx = worldX - start.startX;
      const dy = worldY - start.startY;
      const n = start.origPolygon.length;
      const i1 = draggingEdgeIndex;
      const i2 = (draggingEdgeIndex + 1) % n;
      setRoofs((rs) => rs.map((r) => {
        if (r.id !== selectedRoofId || !r.polygon) return r;
        const next = r.polygon.slice();
        next[i1] = { x: Number((start.origPolygon[i1].x + dx).toFixed(2)), y: Number((start.origPolygon[i1].y + dy).toFixed(2)) };
        next[i2] = { x: Number((start.origPolygon[i2].x + dx).toFixed(2)), y: Number((start.origPolygon[i2].y + dy).toFixed(2)) };
        return { ...r, polygon: next };
      }));
    }
    function handleMouseUp() {
      setDraggingEdgeIndex(null);
      edgeDragStartRef.current = null;
      setRoofs((rs) => rs.map((r) => (r.id === selectedRoofId ? { ...r, grids: [] } : r)));
      setSelectedGridKeys((keys) => new Set([...keys].filter((k) => parseGridKey(k).roofId !== selectedRoofId)));
      setOutputResult(null);
      setCost(null);
      suspendHistoryRef.current = false;
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingEdgeIndex, selectedRoofId]);

  // Mousedown on a panel's own rect selects its whole grid (see README's
  // "Panel grids" entry) - a grid that's already selected instead arms a
  // move-drag of every currently selected grid (so you can grab any one of
  // several selected grids to drag the group). Otherwise, since the roof is
  // usually packed edge-to-edge with panels, there's rarely any genuinely
  // empty roof area left to start a marquee drag from (see onSvgMouseDown)
  // - so a mousedown on an unselected grid's panel starts a marquee too,
  // and only falls back to selecting just that one grid if the drag never
  // actually moved (see the box-select mouseup handler's
  // `clickFallbackGridKey` branch).
  function startGridDrag(e, roofId, gridId) {
    e.stopPropagation();
    const key = gridKey(roofId, gridId);
    if (e.shiftKey) {
      setSelectedGridKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
      return;
    }

    if (!selectedGridKeys.has(key)) {
      const { worldX, worldY } = clientToWorld(e.clientX, e.clientY);
      boxSelectRef.current = {
        roofId, clientX: e.clientX, clientY: e.clientY, moved: false,
        x0: worldX, y0: worldY, x1: worldX, y1: worldY, additive: false,
        clickFallbackGridKey: key,
      };
      setSelectedRoofId(null);
      setSelectedObstacleId(null);
      setBoxSelectRect({ x0: worldX, y0: worldY, x1: worldX, y1: worldY });
      return;
    }

    const keys = selectedGridKeys;
    let origins: any[] = [];
    keys.forEach((k) => {
      const { roofId: rId, gridId: gId } = parseGridKey(k);
      const grid = findGrid(rId, gId);
      if (grid) origins.push({ roofId: rId, gridId: gId, panels: grid.panels.map((p) => ({ id: p.id, x: p.x, y: p.y })), footprintPolygon: grid.footprintPolygon.map((pt) => ({ ...pt })) });
    });
    gridMoveRef.current = {
      clientX: e.clientX, clientY: e.clientY, moved: false, origins,
      collapseOnClick: selectedGridKeys.size > 1, clickKey: key,
    };
    setSelectedRoofId(null);
    setSelectedObstacleId(null);
    suspendHistoryRef.current = true;
    setMovingGrids(true);
  }

  useEffect(() => {
    if (!movingGrids) return;

    function handleMouseMove(e) {
      const start = gridMoveRef.current;
      if (!start) return;
      if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) > 3) start.moved = true;
      if (!start.moved) return;
      const { worldX: curX, worldY: curY } = clientToWorld(e.clientX, e.clientY);
      const { worldX: startX, worldY: startY } = clientToWorld(start.clientX, start.clientY);
      const dx = curX - startX, dy = curY - startY;
      // A plain translation - safe to apply directly to the grid's own
      // packed panel positions/rackX/rackY and footprint (see
      // layoutEngine.js's comment above gridPivot for why rotation can't be
      // done the same way). Free move, no roof-boundary/collision checks
      // (see README's "Panel grids" entry).
      start.origins.forEach((o) => {
        const roof = roofs.find((r) => r.id === o.roofId);
        const direction = roof?.type === 'pitched' ? (roof.slopeDirection || 'S') : 'S';
        updateRoofGrids(o.roofId, (grids) => grids.map((g) => {
          if (g.id !== o.gridId) return g;
          const panelById = new Map(o.panels.map((p) => [p.id, p]) as [any, any][]);
          const panels = g.panels.map((p) => {
            const origin: any = panelById.get(p.id);
            if (!origin) return p;
            const nx = origin.x + dx, ny = origin.y + dy;
            const local = toSlopeLocal({ x: nx, y: ny }, direction);
            return { ...p, x: nx, y: ny, rackX: local.x, rackY: local.y };
          });
          const footprintPolygon = o.footprintPolygon.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
          return { ...g, panels, footprintPolygon };
        }));
      });
    }

    function handleMouseUp() {
      const start = gridMoveRef.current;
      if (start?.moved) {
        swallowClickAfterDragRef.current = true;
        // Now that the drag has actually ended, re-derive which roof each
        // moved grid belongs to from where it actually landed (see
        // layoutEngine.js's own comment on bestRoofForGrid/
        // reparentGridToRoof for why this only happens at drop time, not
        // live during the drag) and move it into that roof's own grids
        // array if it's not the one it started on. Reads roofsRef, not
        // the `roofs` closure - see roofsRef's own comment.
        const latestRoofs = roofsRef.current;
        let reassignments: any[] = [];
        start.origins.forEach((o) => {
          const oldRoof = latestRoofs.find((r) => r.id === o.roofId);
          const grid = oldRoof?.grids.find((g) => g.id === o.gridId);
          if (!grid) return;
          const bestRoof = bestRoofForGrid(grid, latestRoofs);
          if (!bestRoof || bestRoof.id === o.roofId) return;
          reassignments.push({ fromRoofId: o.roofId, toRoofId: bestRoof.id, grid, bestRoof });
        });
        if (reassignments.length > 0) {
          setRoofs((rs) => rs.map((r) => {
            const removeIds = reassignments.filter((a) => a.fromRoofId === r.id).map((a) => a.grid.id);
            const additions = reassignments.filter((a) => a.toRoofId === r.id).map((a) => reparentGridToRoof(a.grid, a.bestRoof, location));
            if (removeIds.length === 0 && additions.length === 0) return r;
            const grids = r.grids.filter((g) => !removeIds.includes(g.id)).concat(additions);
            return { ...r, grids };
          }));
          setSelectedGridKeys((prev) => {
            const next = new Set(prev);
            reassignments.forEach((a) => {
              next.delete(gridKey(a.fromRoofId, a.grid.id));
              next.add(gridKey(a.toRoofId, a.grid.id));
            });
            return next;
          });
        }
      } else if (start && start.collapseOnClick) {
        // A plain click (no drag) landing on a grid that was already part
        // of a bigger selection collapses the selection to just this one,
        // matching how most multi-select UIs treat an un-dragged click.
        setSelectedGridKeys(new Set([start.clickKey]));
      }
      gridMoveRef.current = null;
      setMovingGrids(false);
      suspendHistoryRef.current = false;
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movingGrids]);

  // Starts a whole-roof drag - only once the roof is already selected (a
  // plain click on an unselected roof just selects it, same as ever; see
  // the roof polygon's own onMouseDown below), matching the click-then-
  // drag pattern startGridDrag uses for grids.
  function startRoofDrag(e, roofId) {
    const roof = roofs.find((r) => r.id === roofId);
    if (!roof?.polygon) return;
    e.stopPropagation();
    const originObstacles = obstacles
      .filter((o) => pointInPolygon({ x: o.x, y: o.y }, roof.polygon))
      .map((o) => ({ id: o.id, x: o.x, y: o.y, polygon: o.polygon ? o.polygon.map((p) => ({ ...p })) : null }));
    const originGrids = roof.grids.map((g) => ({
      id: g.id,
      panels: g.panels.map((p) => ({ id: p.id, x: p.x, y: p.y })),
      footprintPolygon: g.footprintPolygon.map((p) => ({ ...p })),
    }));
    roofMoveRef.current = {
      clientX: e.clientX, clientY: e.clientY, moved: false,
      roofId, polygon: roof.polygon.map((p) => ({ ...p })), obstacles: originObstacles, grids: originGrids,
    };
    suspendHistoryRef.current = true;
    frozenExtentRef.current = liveCombinedExtent;
    setMovingRoof(true);
  }

  useEffect(() => {
    if (!movingRoof) return;

    function handleMouseMove(e) {
      const start = roofMoveRef.current;
      if (!start) return;
      if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) > 3) start.moved = true;
      if (!start.moved) return;
      const { worldX: curX, worldY: curY } = clientToWorld(e.clientX, e.clientY);
      const { worldX: startX, worldY: startY } = clientToWorld(start.clientX, start.clientY);
      const dx = curX - startX, dy = curY - startY;

      setRoofs((rs) => rs.map((r) => {
        if (r.id !== start.roofId) return r;
        const direction = r.type === 'pitched' ? (r.slopeDirection || 'S') : 'S';
        const gridById = new Map(start.grids.map((g) => [g.id, g]) as [any, any][]);
        const grids = r.grids.map((g) => {
          const origin: any = gridById.get(g.id);
          if (!origin) return g;
          const panelById = new Map(origin.panels.map((p) => [p.id, p]) as [any, any][]);
          const panels = g.panels.map((p) => {
            const o: any = panelById.get(p.id);
            if (!o) return p;
            const nx = o.x + dx, ny = o.y + dy;
            const local = toSlopeLocal({ x: nx, y: ny }, direction);
            return { ...p, x: nx, y: ny, rackX: local.x, rackY: local.y };
          });
          const footprintPolygon = origin.footprintPolygon.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
          return { ...g, panels, footprintPolygon };
        });
        return { ...r, polygon: start.polygon.map((p) => ({ x: p.x + dx, y: p.y + dy })), grids };
      }));

      if (start.obstacles.length > 0) {
        const obstacleById = new Map(start.obstacles.map((o) => [o.id, o]) as [any, any][]);
        setObstacles((obs) => obs.map((o) => {
          const origin: any = obstacleById.get(o.id);
          if (!origin) return o;
          return {
            ...o,
            x: origin.x + dx,
            y: origin.y + dy,
            polygon: origin.polygon ? origin.polygon.map((p) => ({ x: p.x + dx, y: p.y + dy })) : o.polygon,
          };
        }));
      }
    }

    function handleMouseUp() {
      const start = roofMoveRef.current;
      if (start?.moved) swallowClickAfterDragRef.current = true;
      roofMoveRef.current = null;
      frozenExtentRef.current = null;
      setMovingRoof(false);
      suspendHistoryRef.current = false;
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movingRoof]);

  // The rotate handle's own drag - `pivot` is the (single) selected grid's
  // own footprint center, `startAngle` the pointer's angle from it when the
  // drag began. Rotation is presentation-only (see layoutEngine.js's
  // comment above gridPivot) - every subsequent mousemove just sets each
  // selected grid's own `rotation` to its own starting rotation plus the
  // delta from the drag's own starting angle, each rotating about its own
  // pivot.
  function startGridRotate(e) {
    e.stopPropagation();
    const keys = [...selectedGridKeys];
    if (keys.length === 0) return;
    const grids = keys.map((k) => {
      const { roofId, gridId } = parseGridKey(k);
      return { key: k, roofId, gridId, grid: findGrid(roofId, gridId) };
    }).filter((g) => g.grid);
    if (grids.length === 0) return;
    // The handle itself is drawn at the (possibly multi-grid) selection's
    // combined centroid (see the rotate-handle render below) - the drag's
    // own starting angle is measured from that same point so the handle
    // tracks the cursor exactly, even though each grid still rotates about
    // its own individual pivot once the drag is applied.
    const pivots = grids.map((g) => gridPivot(g.grid));
    const cx = pivots.reduce((s, p) => s + p.x, 0) / pivots.length;
    const cy = pivots.reduce((s, p) => s + p.y, 0) / pivots.length;
    const { worldX, worldY } = clientToWorld(e.clientX, e.clientY);
    rotateDragRef.current = {
      pivot: { x: cx, y: cy },
      startAngle: Math.atan2(worldY - cy, worldX - cx),
      origins: grids.map((g) => ({ roofId: g.roofId, gridId: g.gridId, rotation: g.grid.rotation || 0 })),
    };
    suspendHistoryRef.current = true;
    setRotatingGrids(true);
  }

  useEffect(() => {
    if (!rotatingGrids) return;

    function handleMouseMove(e) {
      const start = rotateDragRef.current;
      if (!start) return;
      const { worldX, worldY } = clientToWorld(e.clientX, e.clientY);
      const angle = Math.atan2(worldY - start.pivot.y, worldX - start.pivot.x);
      const deltaDeg = ((angle - start.startAngle) * 180) / Math.PI;
      const byRoof = new Map();
      start.origins.forEach((o) => {
        if (!byRoof.has(o.roofId)) byRoof.set(o.roofId, new Map());
        byRoof.get(o.roofId).set(o.gridId, o.rotation + deltaDeg);
      });
      byRoof.forEach((rotations, roofId) => {
        updateRoofGrids(roofId, (grids) => grids.map((g) => (rotations.has(g.id) ? { ...g, rotation: rotations.get(g.id) } : g)));
      });
    }
    function handleMouseUp() {
      if (rotateDragRef.current) swallowClickAfterDragRef.current = true;
      rotateDragRef.current = null;
      setRotatingGrids(false);
      suspendHistoryRef.current = false;
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotatingGrids]);

  function startGridPlacement() {
    resetClickSuppression();
    setPlacingGrid(true);
    setGridDrawPoints([]);
    setGridPlacementError(null);
    setPlacingShape(null);
    setDrawingRoof(false);
  }

  function cancelGridPlacement() {
    setPlacingGrid(false);
    setGridDrawPoints([]);
  }

  // Adds a new grid to whichever roof the drawn polygon sits on - a second
  // (or third...) grid on that roof, alongside anything already there,
  // rather than replacing it (only "Generate Layout" replaces the
  // whole-roof grid - see regenerateAllGrids below). Picks whichever roof
  // contains the *most* of the drawn polygon's own vertices, not just the
  // raw vertex average (a concave or unevenly-pointed shape can have its
  // centroid land outside the roof it's actually drawn on, or even inside
  // a neighboring one) - this used to fail silently when that centroid
  // missed every roof, which is exactly what a shape drawn right up
  // against a roof's own edge tends to do.
  function addGridFromPolygon(points) {
    if (points.length < 3) { setPlacingGrid(false); setGridDrawPoints([]); return; }
    let roof: any = null, bestCount = 0;
    roofs.forEach((r) => {
      const poly = getRoofPolygon(r);
      const count = points.filter((p) => pointInPolygon(p, poly)).length;
      if (count > bestCount) { bestCount = count; roof = r; }
    });
    setPlacingGrid(false);
    setGridDrawPoints([]);
    if (!roof) {
      setGridPlacementError("That shape doesn't overlap any roof - draw it over a roof's outline.");
      return;
    }
    setGridPlacementError(null);
    const panelsPerRow = suggestMaxPanelsPerRow({ roof, footprintPolygon: points, panelSpec, location });
    const grid = generateLayout({ roof, footprintPolygon: points, gridSettings: { panelsPerRow }, panelSpec, obstacles, location });
    grid.id = Date.now() + Math.floor(Math.random() * 1000);
    grid.source = 'drawn';
    setRoofs((rs) => rs.map((r) => (r.id === roof.id ? { ...r, grids: [...r.grids, grid] } : r)));
    setSelectedGridKeys(new Set([gridKey(roof.id, grid.id)]));
    setOutputResult(null);
    setCost(null);
  }

  // (Re)generates every roof's own whole-roof grid from its own
  // polygon/type, sharing the one panel spec and the global obstacle list.
  // Only ever touches each roof's whole-roof grid (source of a plain
  // "Generate Layout" run) - a grid placed via the polygon tool is left
  // alone, same as the "Replace the existing grid" decision recorded in
  // README's "Panel grids" entry. Re-generating an existing whole-roof grid
  // keeps its own tilt/row-spacing/structure/panels-per-row settings rather
  // than resetting them, since this is also what re-packs a roof after an
  // obstacle moved or a roof was resized, not just a first-time run.
  function regenerateAllGrids(specOverride?: any) {
    const spec = specOverride ?? panelSpec;
    setRoofs((rs) => rs.map((roof) => {
      const existing = roof.grids.find((g) => g.source === 'wholeRoof');
      const gridSettings = existing
        ? { panelTiltDeg: existing.panelTiltDeg, rowSpacing: existing.rowSpacing, structureStrategy: existing.structureStrategy, panelsPerRow: existing.panelsPerRow, orientation: existing.orientation }
        : {};
      const grid = generateLayout({ roof, footprintPolygon: getRoofPolygon(roof), gridSettings, panelSpec: spec, obstacles, location });
      grid.id = existing?.id ?? Date.now() + Math.floor(Math.random() * 1000);
      grid.source = 'wholeRoof';
      const grids = existing ? roof.grids.map((g) => (g.id === existing.id ? grid : g)) : [...roof.grids, grid];
      return { ...roof, grids };
    }));
    setSelectedGridKeys(new Set());
    setOutputResult(null);
    setCost(null);
  }

  function handleGenerate() {
    regenerateAllGrids();
  }

  function handleCalculate() {
    const gridsWithPanels = roofs.flatMap((roof) => roof.grids.filter((g) => g.count > 0).map((grid) => ({ roof, grid })));
    if (gridsWithPanels.length === 0) return;

    let totalKWh = 0, shadedWeighted = 0, panelSamples = 0, label = '';
    let panelCost = 0, structureCost = 0, totalRailLength = 0, hasRail = false;
    gridsWithPanels.forEach(({ roof, grid }) => {
      const layout = resolvedGrid(grid);
      const r = computeOutput({
        layout, obstacles, location, mode, date: selectedDate,
        monthlyGHI, panelSpec,
        systemDerate: assumptions.systemDerate, diffuseFraction: assumptions.diffuseFraction,
        roofs, targetBuildingHeight: roof.buildingHeight,
      });
      totalKWh += r.totalKWh;
      shadedWeighted += r.avgShadedPct * layout.count;
      panelSamples += layout.count;
      label = r.label;

      const c = computeCost({ layout, roofType: roof.type, ...pricing });
      panelCost += c.panelCost;
      structureCost += c.structureCost;
      if (c.totalRailLength) { totalRailLength += c.totalRailLength; hasRail = true; }
    });

    setOutputResult({
      totalKWh, label,
      avgShadedPct: panelSamples ? Math.round(shadedWeighted / panelSamples) : 0,
    });
    setCost({
      panelCost, structureCost, totalCost: panelCost + structureCost,
      totalRailLength: hasRail ? totalRailLength : null,
    });
  }

  // Persistence: gathers exactly the content state identified as the
  // round-trippable shape (see types.ts's PlantDesignData) and hands it to
  // the host page's onSave, which does the actual POST/PATCH. idle |
  // saving | saved | error, mirrored back to "idle" a few seconds after a
  // successful save so the indicator doesn't sit stale.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  async function handleSave() {
    const data: PlantDesignData = {
      roofs, obstacles, siteImages, location, locationConfirmed, monthlyGHI,
      projectName, capacityNote, gridConnection, panelSpec, inverterChoice,
      designTemp, targetDcAcRatio, currentStep, maxUnlockedStep,
    };
    setSaveStatus('saving');
    try {
      await onSave(data, {
        name: projectName.trim() || 'Untitled project',
        capacityKw: totalCapacityKW > 0 ? totalCapacityKW : null,
        latitude: location.lat,
        longitude: location.lon,
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 3000);
    } catch (err) {
      console.error('Failed to save plant design', err);
      setSaveStatus('error');
    }
  }

  // One entry per wizard step - `complete` gates whether advanceToStep can
  // move past it (see the "Next" button rendered under each step's content
  // below). Steps 5/6 have no real completion requirement - they're just
  // read-only/editable results once reached.
  const STEPS = [
    { n: 1, label: 'Project & Location', complete: projectName.trim().length > 0 && Number(capacityNote) > 0 && locationConfirmed },
    { n: 2, label: 'Configuration', complete: true },
    { n: 3, label: 'Roof setup', complete: roofs.length > 0 },
    { n: 4, label: 'Panel/Grid setup', complete: totalPanelCount > 0 },
    { n: 5, label: 'Output estimate', complete: true },
    { n: 6, label: 'Cost estimate', complete: true },
    { n: 7, label: 'Electrical Design (SLD)', complete: true },
  ];

  const inputStyle = { width: 62, padding: '2px 4px', border: '1px solid #ccc', borderRadius: 4, fontSize: 11, color: '#222', background: '#fff' };
  const sectionStyle = { background: '#fff', border: '1px solid #e2e2e2', borderRadius: 8, padding: 10, marginBottom: 8 };
  const labelStyle = { fontSize: 11, color: '#555', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, gap: 6 };
  const btn = (active) => ({ padding: '4px 8px', borderRadius: 6, border: active ? '1px solid #2f6fed' : '1px solid #ccc', background: active ? '#e8f0ff' : '#fff', color: '#222', fontSize: 11, cursor: 'pointer' });
  // Icon rail buttons (steps 3-6's left-edge shortcuts, replacing the old
  // sidebar's full text sections) - square, symbol-only, `title` gives the
  // hover tooltip per the design brief ("user sees what it does on hover").
  const iconBtn = (active, disabled = false) => ({
    width: 40, height: 40, borderRadius: 8, flexShrink: 0,
    border: active ? '1px solid #2f6fed' : '1px solid #ccc',
    background: disabled ? '#f2f2f2' : active ? '#e8f0ff' : '#fff',
    color: disabled ? '#bbb' : '#333', fontSize: 17,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });
  const compassBtn = (active) => ({ width: 22, height: 22, padding: 0, borderRadius: '50%', border: active ? '1px solid #2f6fed' : '1px solid #ccc', background: active ? '#2f6fed' : '#fff', color: active ? '#fff' : '#555', fontSize: 10, fontWeight: 600, cursor: 'pointer', lineHeight: '20px' });

  return (
    <div className="plant-design-editor" style={{ display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', color: '#222', height: '100vh', boxSizing: 'border-box' }}>
      {/* Thin step bar - always visible. A step is clickable once reached
          (maxUnlockedStep), never re-locked by later edits (see
          maxUnlockedStep's own comment above). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', borderBottom: '1px solid #e2e2e2', background: '#fff', flexShrink: 0 }}>
        {STEPS.map((s, i) => {
          const unlocked = s.n <= maxUnlockedStep;
          const active = currentStep === s.n;
          return (
            <React.Fragment key={s.n}>
              {i > 0 && <span style={{ color: '#ccc', fontSize: 12 }}>›</span>}
              <button
                onClick={() => goToStep(s.n)}
                disabled={!unlocked}
                title={unlocked ? s.label : `Finish step ${s.n - 1} first`}
                style={{
                  border: 'none', background: active ? '#e8f0ff' : 'transparent',
                  color: active ? '#2f6fed' : unlocked ? '#333' : '#bbb',
                  fontWeight: active ? 700 : 500, fontSize: 12, borderRadius: 6,
                  padding: '5px 10px', cursor: unlocked ? 'pointer' : 'not-allowed',
                }}
              >
                {s.n}. {s.label}
              </button>
            </React.Fragment>
          );
        })}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {saveStatus === 'saved' && <span style={{ fontSize: 11, color: '#2e7d32' }}>Saved</span>}
          {saveStatus === 'error' && <span style={{ fontSize: 11, color: '#c0392b' }}>Save failed - try again</span>}
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none',
              background: '#2f6fed', color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
              opacity: saveStatus === 'saving' ? 0.7 : 1,
            }}
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, boxSizing: 'border-box', padding: 16 }}>
      {currentStep <= 2 ? (
      /* LEFT: steps 1-2's own input form (Project & Location, then
         Configuration). Before location's confirmed this is the whole
         screen (step 1's map picker, when open, takes the right half - see
         mapMode below); once confirmed, the plan view already renders
         alongside it too (see the CENTER block's own condition), so the
         user can see the empty canvas while still reviewing Configuration. */
      <div style={{ width: 300, flexShrink: 0, overflowY: 'auto', height: '100%' }}>
        {currentStep === 1 && (
          <div style={sectionStyle}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Project</div>
            <div style={labelStyle}><span>Project name</span><input style={{ ...inputStyle, width: 140 }} type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Untitled project" /></div>
            <div style={labelStyle}><span>Capacity (kW)</span><input style={{ ...inputStyle, width: 140 }} type="number" min="0.01" step="any" value={capacityNote} onChange={(e) => setCapacityNote(e.target.value)} placeholder="e.g. 100" /></div>
            {capacityNote !== '' && !(Number(capacityNote) > 0) && (
              <div style={{ fontSize: 11, color: '#c0392b', marginTop: -3, marginBottom: 6 }}>Enter a positive number.</div>
            )}
            <div style={labelStyle}>
              <span>Units</span>
              <span>
                <button style={btn(units === 'm')} onClick={() => setUnits('m')}>Meters</button>{' '}
                <button style={btn(units === 'ft')} onClick={() => setUnits('ft')}>Feet</button>
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>Display only - every value stays stored in meters underneath.</div>
          </div>
        )}
        {currentStep === 1 && (
          <div style={{ fontSize: 11, color: '#888', margin: '0 0 8px 2px' }}>Enter coordinates directly, or use the map - Next confirms and continues.</div>
        )}
        {currentStep === 1 && (
        <CollapsibleSection title="Location" defaultOpen open={locationOpen} onToggle={setLocationOpen}>
          <div style={labelStyle}><span>Latitude</span><input style={inputStyle} type="number" value={location.lat} onChange={(e) => setLocation({ ...location, lat: +e.target.value })} /></div>
          <div style={labelStyle}><span>Longitude</span><input style={inputStyle} type="number" value={location.lon} onChange={(e) => setLocation({ ...location, lon: +e.target.value })} /></div>
          <div style={labelStyle}><span>Timezone (UTC+)</span><input style={inputStyle} type="number" value={location.tz} onChange={(e) => setLocation({ ...location, tz: +e.target.value })} /></div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Default: Bengaluru, IN</div>
          <button style={btn(false)} onClick={() => setMapMode('location')}>Set location on map…</button>
        </CollapsibleSection>
        )}
        {currentStep === 1 && (
          <button
            onClick={() => { handleLocationConfirm({ lat: location.lat, lon: location.lon }); advanceToStep(2); }}
            style={{ width: '100%', padding: 6, borderRadius: 6, border: 'none', background: '#1c2b4a', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            Next: Configuration →
          </button>
        )}
        {currentStep === 2 && (
        <>
        <CollapsibleSection title="Grid connection">
          <div style={labelStyle}><span>Grid voltage (V)</span><input style={inputStyle} type="number" step="1" value={gridConnection.voltage} onChange={(e) => setGridConnection({ ...gridConnection, voltage: +e.target.value })} /></div>
          <div style={labelStyle}>
            <span>Phase</span>
            <select style={{ ...inputStyle, width: 62 }} value={gridConnection.phase} onChange={(e) => setGridConnection({ ...gridConnection, phase: +e.target.value })}>
              <option value={1}>1-Phase</option>
              <option value={3}>3-Phase</option>
            </select>
          </div>
          <div style={labelStyle}><span>Sanctioned load (kW)</span><input style={{ ...inputStyle, width: 140 }} type="number" min="0" step="any" value={gridConnection.sanctionedLoadKw} onChange={(e) => setGridConnection({ ...gridConnection, sanctionedLoadKw: e.target.value })} placeholder="e.g. 140" /></div>
          <div style={labelStyle}><span>DISCOM</span><input style={{ ...inputStyle, width: 140 }} type="text" value={gridConnection.discom} onChange={(e) => setGridConnection({ ...gridConnection, discom: e.target.value })} placeholder="e.g. DHBVN" /></div>
        </CollapsibleSection>
        <CollapsibleSection title="Panel configuration" defaultOpen>
          <div style={labelStyle}>
            <span>Make</span>
            <select
              style={{ ...inputStyle, width: 140 }}
              value={panelSpec.make}
              onChange={(e) => {
                const make = e.target.value;
                if (make === CUSTOM_MODULE_MAKE) {
                  setPanelSpec({ ...panelSpec, make, model: '' });
                  return;
                }
                const first = moduleCatalogModels(make)[0];
                setPanelSpec({ ...panelSpec, make, model: first.model, width: first.width, height: first.height, wattage: first.wattage, voc: first.voc, vmp: first.vmp, isc: first.isc, imp: first.imp, tempCoeffVoc: first.tempCoeffVoc });
              }}
            >
              {moduleCatalogMakes().map((make) => <option key={make} value={make}>{make}</option>)}
              <option value={CUSTOM_MODULE_MAKE}>{CUSTOM_MODULE_MAKE}</option>
            </select>
          </div>
          {panelSpec.make !== CUSTOM_MODULE_MAKE && (
            <div style={labelStyle}>
              <span>Model</span>
              <select
                style={{ ...inputStyle, width: 140 }}
                value={panelSpec.model}
                onChange={(e) => {
                  const mod = findModule(panelSpec.make, e.target.value);
                  if (!mod) return;
                  setPanelSpec({ ...panelSpec, model: mod.model, width: mod.width, height: mod.height, wattage: mod.wattage, voc: mod.voc, vmp: mod.vmp, isc: mod.isc, imp: mod.imp, tempCoeffVoc: mod.tempCoeffVoc });
                }}
              >
                {moduleCatalogModels(panelSpec.make).map((m) => <option key={m.model} value={m.model}>{m.model} · {m.wattage}W</option>)}
              </select>
            </div>
          )}
          {panelSpec.make === CUSTOM_MODULE_MAKE ? (
            <>
              <div style={labelStyle}><span>Model name</span><input style={{ ...inputStyle, width: 140 }} type="text" value={panelSpec.model} onChange={(e) => setPanelSpec({ ...panelSpec, model: e.target.value })} placeholder="e.g. My module 550W" /></div>
              <div style={labelStyle}><span>Width ({units})</span><SliderInput unit={units} min={0.3} max={2.5} step={0.05} value={panelSpec.width} onChange={(v) => setPanelSpec({ ...panelSpec, width: v })} /></div>
              <div style={labelStyle}><span>Height ({units})</span><SliderInput unit={units} min={0.3} max={2.5} step={0.05} value={panelSpec.height} onChange={(v) => setPanelSpec({ ...panelSpec, height: v })} /></div>
              <div style={labelStyle}><span>Wattage (W)</span><SliderInput min={100} max={800} step={10} value={panelSpec.wattage} onChange={(v) => setPanelSpec({ ...panelSpec, wattage: v })} /></div>
              <div style={labelStyle}><span>Voc (V)</span><input style={inputStyle} type="number" step="0.01" value={panelSpec.voc} onChange={(e) => setPanelSpec({ ...panelSpec, voc: +e.target.value })} /></div>
              <div style={labelStyle}><span>Vmp (V)</span><input style={inputStyle} type="number" step="0.01" value={panelSpec.vmp} onChange={(e) => setPanelSpec({ ...panelSpec, vmp: +e.target.value })} /></div>
              <div style={labelStyle}><span>Isc (A)</span><input style={inputStyle} type="number" step="0.01" value={panelSpec.isc} onChange={(e) => setPanelSpec({ ...panelSpec, isc: +e.target.value })} /></div>
              <div style={labelStyle}><span>Imp (A)</span><input style={inputStyle} type="number" step="0.01" value={panelSpec.imp} onChange={(e) => setPanelSpec({ ...panelSpec, imp: +e.target.value })} /></div>
              <div style={labelStyle}><span>Temp coeff. Voc (%/°C)</span><input style={inputStyle} type="number" step="0.01" value={panelSpec.tempCoeffVoc} onChange={(e) => setPanelSpec({ ...panelSpec, tempCoeffVoc: +e.target.value })} /></div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: '#888', lineHeight: 1.6 }}>
              {panelSpec.width.toFixed(2)}×{panelSpec.height.toFixed(2)} m · {panelSpec.wattage} W<br />
              Voc {panelSpec.voc} V · Vmp {panelSpec.vmp} V · Isc {panelSpec.isc} A · Imp {panelSpec.imp} A<br />
              Temp coeff. Voc {panelSpec.tempCoeffVoc}%/°C
            </div>
          )}
        </CollapsibleSection>
        <CollapsibleSection title="Inverter (default)">
          <div style={labelStyle}>
            <span>Make</span>
            <select
              style={{ ...inputStyle, width: 140 }}
              value={inverterChoice.make}
              onChange={(e) => {
                const make = e.target.value;
                if (make === CUSTOM_INVERTER_MAKE) {
                  setInverterChoice({ ...inverterChoice, make, model: '' });
                  return;
                }
                const first = inverterCatalogModels(make)[0];
                setInverterChoice({ ...inverterChoice, ...first });
              }}
            >
              {inverterCatalogMakes().map((make) => <option key={make} value={make}>{make}</option>)}
              <option value={CUSTOM_INVERTER_MAKE}>{CUSTOM_INVERTER_MAKE}</option>
            </select>
          </div>
          {inverterChoice.make !== CUSTOM_INVERTER_MAKE && (
            <div style={labelStyle}>
              <span>Model</span>
              <select
                style={{ ...inputStyle, width: 140 }}
                value={inverterChoice.model}
                onChange={(e) => {
                  const inv = findInverter(inverterChoice.make, e.target.value);
                  if (!inv) return;
                  setInverterChoice({ ...inverterChoice, ...inv });
                }}
              >
                {inverterCatalogModels(inverterChoice.make).map((i) => <option key={i.model} value={i.model}>{i.model} · {i.acPowerKw}kW</option>)}
              </select>
            </div>
          )}
          {inverterChoice.make === CUSTOM_INVERTER_MAKE ? (
            <>
              <div style={labelStyle}><span>Model name</span><input style={{ ...inputStyle, width: 140 }} type="text" value={inverterChoice.model} onChange={(e) => setInverterChoice({ ...inverterChoice, model: e.target.value })} placeholder="e.g. My inverter 50kW" /></div>
              <div style={labelStyle}><span>AC power (kW)</span><input style={inputStyle} type="number" step="0.1" value={inverterChoice.acPowerKw} onChange={(e) => setInverterChoice({ ...inverterChoice, acPowerKw: +e.target.value })} /></div>
              <div style={labelStyle}><span>Max DC voltage (V)</span><input style={inputStyle} type="number" step="1" value={inverterChoice.maxDcVoltage} onChange={(e) => setInverterChoice({ ...inverterChoice, maxDcVoltage: +e.target.value })} /></div>
              <div style={labelStyle}><span>MPPT channels</span><input style={inputStyle} type="number" step="1" value={inverterChoice.mpptCount} onChange={(e) => setInverterChoice({ ...inverterChoice, mpptCount: +e.target.value })} /></div>
              <div style={labelStyle}><span>Max current/MPPT (A)</span><input style={inputStyle} type="number" step="0.1" value={inverterChoice.maxCurrentPerMppt} onChange={(e) => setInverterChoice({ ...inverterChoice, maxCurrentPerMppt: +e.target.value })} /></div>
              <div style={labelStyle}><span>MPPT V min (V)</span><input style={inputStyle} type="number" step="1" value={inverterChoice.mpptVoltageMin} onChange={(e) => setInverterChoice({ ...inverterChoice, mpptVoltageMin: +e.target.value })} /></div>
              <div style={labelStyle}><span>MPPT V max (V)</span><input style={inputStyle} type="number" step="1" value={inverterChoice.mpptVoltageMax} onChange={(e) => setInverterChoice({ ...inverterChoice, mpptVoltageMax: +e.target.value })} /></div>
              <div style={labelStyle}><span>Max AC current (A)</span><input style={inputStyle} type="number" step="0.1" value={inverterChoice.maxAcCurrent} onChange={(e) => setInverterChoice({ ...inverterChoice, maxAcCurrent: +e.target.value })} /></div>
              <div style={labelStyle}><span>AC voltage (V)</span><input style={inputStyle} type="number" step="1" value={inverterChoice.acVoltage} onChange={(e) => setInverterChoice({ ...inverterChoice, acVoltage: +e.target.value })} /></div>
              <div style={labelStyle}><span>Phase</span><input style={inputStyle} type="number" step="1" value={inverterChoice.phase} onChange={(e) => setInverterChoice({ ...inverterChoice, phase: +e.target.value })} /></div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: '#888', lineHeight: 1.6 }}>
              {inverterChoice.acPowerKw} kW · {inverterChoice.phase}-Phase · {inverterChoice.acVoltage} V AC<br />
              Max DC {inverterChoice.maxDcVoltage} V · {inverterChoice.mpptCount} MPPT × {inverterChoice.maxCurrentPerMppt} A<br />
              MPPT window {inverterChoice.mpptVoltageMin}–{inverterChoice.mpptVoltageMax} V
            </div>
          )}
        </CollapsibleSection>
        <CollapsibleSection title="String sizing">
          <div style={labelStyle}><span>Target DC:AC ratio</span><SliderInput min={0.8} max={1.5} step={0.01} value={targetDcAcRatio} onChange={setTargetDcAcRatio} /></div>
          <div style={labelStyle}><span>Design min temp (°C)</span><input style={inputStyle} type="number" step="1" value={designTemp.min} onChange={(e) => setDesignTemp({ ...designTemp, min: +e.target.value })} /></div>
          <div style={labelStyle}><span>Design max temp (°C)</span><input style={inputStyle} type="number" step="1" value={designTemp.max} onChange={(e) => setDesignTemp({ ...designTemp, max: +e.target.value })} /></div>
          <div style={{ fontSize: 10, color: '#999', marginBottom: 6 }}>
            {designTempStatus === 'loading' && 'fetching this site\'s temperature range (NASA POWER)…'}
            {designTempStatus === 'ready' && 'this site\'s own monthly min/max (NASA POWER, 2001-2020 climatology) - edit above to override.'}
            {designTempStatus === 'error' && 'couldn\'t fetch this site\'s temperature data - edit above to set it manually.'}
            {designTempStatus === 'idle' && 'confirm a location (step 1) to fetch this automatically, or edit manually now.'}
          </div>
          {(() => {
            const sizing = sizeStrings(panelSpec, inverterChoice, designTemp.min, designTemp.max);
            if (!sizing.valid) {
              return <div style={{ fontSize: 11, color: '#c0392b' }}>No valid string configuration for this module/inverter/temperature combination.</div>;
            }
            return (
              <div style={{ fontSize: 11, color: '#333', lineHeight: 1.7 }}>
                Modules per string: {sizing.minModulesPerString}–{sizing.maxModulesPerString}<br />
                Max strings per MPPT: {sizing.maxStringsPerMppt}<br />
                Max modules per MPPT: {sizing.maxModulesPerMppt}<br />
                Max modules per inverter: {sizing.maxModulesPerInverter}
              </div>
            );
          })()}
        </CollapsibleSection>
        <button
          onClick={() => { advanceToStep(3); startRoofDraw(); }}
          style={{ width: '100%', padding: 6, borderRadius: 6, border: 'none', background: '#1c2b4a', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
        >
          Next: Roof setup →
        </button>
        </>
        )}
      </div>
      ) : null}

      {/* CENTER: the map (picking a location), the plan/3D view (once a
          location's confirmed), or nothing at all before either has
          happened — the app starts as just the left panel. */}
      {currentStep === 1 && mapMode === 'location' && (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <SiteMap
            fill
            mode="location"
            apiKey={GOOGLE_MAPS_API_KEY}
            initialLocation={location}
            onLocationChange={(coords) => setLocation((loc) => ({ ...loc, ...coords }))}
            onCancel={() => setMapMode(null)}
          />
        </div>
      )}

      {mapMode !== 'location' && locationConfirmed && currentStep !== 7 && (
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
        <div style={{ flex: '1 1 auto', minHeight: 480, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* View/edit toolbar + icon rail (steps 3-6) - one floating
              top-left stack instead of two independently-positioned pieces,
              so the rail sits directly under the toolbar with no dead
              space between them regardless of how tall the toolbar's own
              wrapped row ends up being. Floats over the canvas instead of
              taking a row/column of their own, so the canvas always gets
              the full height/width. Each button already has its own opaque
              background (see btn()/iconBtn()), so no extra enclosing box is
              needed for legibility over the map/plan. */}
          <div style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', pointerEvents: 'auto' }}>
            {/* One toggle instead of two separate buttons - always shown
                "pressed" since its label is whichever mode is actually
                current; click flips to the other. */}
            <button
              style={btn(true)}
              onClick={() => setViewMode((m) => (m === 'plan' ? '3d' : 'plan'))}
              title={viewMode === 'plan' ? 'Viewing 2D plan - click for 3D view' : 'Viewing 3D view - click for 2D plan'}
            >
              {viewMode === 'plan' ? '2D' : '3D'}
            </button>
            {/* The 2D plan's own zoom/pan (planZoom/panOffset, scroll to
                zoom + drag to pan - see onPlanWheel) has no bounds on
                panning and can zoom in up to 6x, so it's easy to end up
                zoomed in on empty space far from the roof with no on-
                screen hint which way to drag back - only reachable/lost
                in the 2D plan, so 3D (its own orbit controls) doesn't need
                this. Only shown once the view actually differs from the
                default, same as Undo/Redo dimming rather than
                disappearing outright would, but here there's nothing
                useful to show disabled, so it's just absent instead. */}
            {viewMode === 'plan' && (planZoom !== 1 || panOffset.x !== 0 || panOffset.y !== 0) && (
              <button
                style={btn(false)}
                onClick={() => { setPlanZoom(1); setPanOffset({ x: 0, y: 0 }); }}
                title="Reset zoom and pan back to the default fit-to-content view"
              >
                ⊙ Reset view
              </button>
            )}
            <button
              style={{ ...btn(false), opacity: historyRef.current.past.length === 0 ? 0.4 : 1, cursor: historyRef.current.past.length === 0 ? 'default' : 'pointer' }}
              onClick={undo} disabled={historyRef.current.past.length === 0}
              title="Undo (Ctrl/Cmd+Z)"
            >
              ↶ Undo
            </button>
            <button
              style={{ ...btn(false), opacity: historyRef.current.future.length === 0 ? 0.4 : 1, cursor: historyRef.current.future.length === 0 ? 'default' : 'pointer' }}
              onClick={redo} disabled={historyRef.current.future.length === 0}
              title="Redo (Ctrl/Cmd+Shift+Z)"
            >
              ↷ Redo
            </button>
            {/* Roof-wide annual sun exposure heatmap (see roofSunSamples/
                sunExposureColor) - usable as soon as a roof exists, well
                before any grid/panel does, so it's meaningful right after
                Roof setup itself. 2D plan only - there's no 3D rendering
                of it. */}
            {viewMode === 'plan' && roofs.length > 0 && (
              <button
                style={btn(shadowAnalysis)} onClick={() => setShadowAnalysis((v) => !v)}
                title="Heatmap of each part of the roof's own annual sun exposure - red gets the most, blue the least"
              >
                Shadow analysis
              </button>
            )}
            {viewMode === '3d' && (
              <button style={btn(!showPanels)} onClick={() => setShowPanels((v) => !v)}>
                {showPanels ? 'Hide panels' : 'Show panels'}
              </button>
            )}
            {/* Available in both views - color-only in 3D (no per-panel
                label there, see Scene3D.jsx's Panel component), full
                color+label in 2D. Only worth showing once there are actual
                panels to color - nothing to toggle before that. The total
                panel count used to also float as its own badge at top-right
                - moved inline here once that started sitting right under
                the compass/properties rail, which also docks there. */}
            {totalPanelCount > 0 && (
              <button
                style={btn(efficiencyView)} onClick={() => setEfficiencyView((v) => !v)}
                title="Color each panel by its own annual output as a % of the best panel on site"
              >
                Efficiency view{efficiencyView ? ` · ${totalPanelCount} panel${totalPanelCount === 1 ? '' : 's'}` : ''}
              </button>
            )}
            {/* Only for a *multi*-grid selection (box-select/shift-click) -
                exactly one selected grid gets these same actions from its
                own right-rail icons instead (see selectedGrid further
                down), so this stayed redundant with those for that case. */}
            {viewMode === 'plan' && selectedGridKeys.size > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 10, fontSize: 12, color: '#555', background: '#fff', borderRadius: 6, padding: '4px 8px' }}>
                <span>{selectedGridKeys.size} grids selected</span>
                <button
                  onClick={duplicateSelectedGrids}
                  style={{ border: 'none', background: 'none', color: '#2f6fed', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  duplicate
                </button>
                <button
                  onClick={deleteSelectedGrids}
                  style={{ border: 'none', background: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  delete
                </button>
                <button
                  onClick={() => setSelectedGridKeys(new Set())}
                  style={{ border: 'none', background: 'none', color: '#888', cursor: 'pointer', fontSize: 12 }}
                >
                  clear selection
                </button>
              </div>
            )}
          </div>

          {/* Icon shortcut rail (steps 3-6) - sits directly under the
              toolbar above (same stack, see its own comment) rather than
              floating independently. Each icon's data-tooltip is its hover
              label (see index.css's instant-tooltip rule). Selecting a
              roof/grid/obstacle shows its own properties on the right-side
              rail (see further down this file) - this left rail only holds
              "new object" actions (draw roof, add obstacle, fill roof,
              place grid). */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}>
            {currentStep === 3 && (
            <>
              <button
                data-tooltip={drawingRoof ? 'Cancel drawing this roof' : 'Draw a new roof outline'}
                aria-label={drawingRoof ? 'Cancel drawing this roof' : 'Draw a new roof outline'}
                style={iconBtn(drawingRoof)}
                onClick={drawingRoof ? cancelRoofDraw : startRoofDraw}
              >
                {drawingRoof ? '✕' : '⌂'}
              </button>
              <div style={{ position: 'relative' }}>
                <button
                  data-tooltip="Add an obstacle (tree, AC unit, chimney, ...)"
                  aria-label="Add an obstacle"
                  style={iconBtn(obstaclePickerOpen || !!placingShape)}
                  onClick={() => setObstaclePickerOpen((v) => !v)}
                >
                  +
                </button>
                {obstaclePickerOpen && (
                  <div style={{ position: 'absolute', left: 48, top: 0, background: '#fff', border: '1px solid #e2e2e2', borderRadius: 8, padding: 8, boxShadow: '0 4px 18px rgba(0,0,0,0.18)', width: 220, zIndex: 5 }}>
                    <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6 }}>Add obstacle</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {Object.entries(OBSTACLE_PRESETS).map(([k, p]) => (
                        <button
                          key={k} style={btn(placingShape === k)}
                          onClick={() => {
                            resetClickSuppression();
                            setPlacingShape(placingShape === k ? null : k);
                            setObstacleDrawPoints([]);
                            setObstaclePickerOpen(false);
                          }}
                        >
                          + {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {drawingRoof && (
                <div style={{ fontSize: 10, color: '#2f6fed', textAlign: 'center', background: '#fff', borderRadius: 4, padding: '2px 4px' }}>{roofDrawPoints.length} pts</div>
              )}
              {placingShape && (
                <div style={{ fontSize: 10, color: '#2f6fed', textAlign: 'center', background: '#fff', borderRadius: 4, padding: '2px 4px' }}>
                  {OBSTACLE_PRESETS[placingShape]?.drawable ? `${obstacleDrawPoints.length} pts` : 'click plan'}
                </div>
              )}
              <button
                data-tooltip={roofs.length === 0 ? 'Draw at least one roof first' : 'Continue to Panel/Grid setup'}
                aria-label="Continue to Panel/Grid setup"
                onClick={() => advanceToStep(4)} disabled={roofs.length === 0}
                style={{ ...iconBtn(false, roofs.length === 0), background: roofs.length ? '#1c2b4a' : '#f2f2f2', color: roofs.length ? '#fff' : '#bbb', border: 'none' }}
              >
                →
              </button>
            </>
            )}

            {currentStep === 4 && (
            <>
              <button
                data-tooltip="Fill the whole roof with panels"
                aria-label="Fill the whole roof with panels"
                onClick={handleGenerate} disabled={roofs.length === 0}
                style={iconBtn(false, roofs.length === 0)}
              >
                ▦
              </button>
              <button
                data-tooltip={placingGrid ? 'Cancel placing this grid' : 'Draw a custom panel area'}
                aria-label={placingGrid ? 'Cancel placing this grid' : 'Draw a custom panel area'}
                onClick={placingGrid ? cancelGridPlacement : startGridPlacement} disabled={roofs.length === 0}
                style={iconBtn(placingGrid, roofs.length === 0)}
              >
                {placingGrid ? '✕' : '⬚'}
              </button>
              {placingGrid && (
                <div style={{ fontSize: 10, color: '#2f6fed', textAlign: 'center', background: '#fff', borderRadius: 4, padding: '2px 4px' }}>{gridDrawPoints.length} pts</div>
              )}
              {gridPlacementError && (
                <div style={{ fontSize: 10, color: '#c0392b', textAlign: 'center', background: '#fff', borderRadius: 4, padding: '2px 4px' }}>{gridPlacementError}</div>
              )}
              <button
                data-tooltip={totalPanelCount === 0 ? 'Place at least one grid first' : 'Continue to Output estimate'}
                aria-label="Continue to Output estimate"
                onClick={() => advanceToStep(5)} disabled={totalPanelCount === 0}
                style={{ ...iconBtn(false, totalPanelCount === 0), background: totalPanelCount ? '#1c2b4a' : '#f2f2f2', color: totalPanelCount ? '#fff' : '#bbb', border: 'none' }}
              >
                →
              </button>
            </>
            )}

            {currentStep === 5 && (
              <button
                data-tooltip="Continue to Cost estimate"
                aria-label="Continue to Cost estimate"
                onClick={() => advanceToStep(6)}
                style={{ ...iconBtn(false), background: '#1c2b4a', color: '#fff', border: 'none' }}
              >
                →
              </button>
            )}
            {currentStep === 6 && (
              <button
                data-tooltip="Continue to Electrical Design (SLD)"
                aria-label="Continue to Electrical Design (SLD)"
                onClick={() => advanceToStep(7)}
                style={{ ...iconBtn(false), background: '#1c2b4a', color: '#fff', border: 'none' }}
              >
                →
              </button>
            )}
          </div>
          </div>

          {viewMode === '3d' && (
            <div style={{ flex: 1, minHeight: 0, borderRadius: 10, border: '1px solid #d5d5d5', overflow: 'hidden', position: 'relative' }}>
              <React.Suspense fallback={<div style={{ padding: 16, fontSize: 13, color: '#888' }}>Loading 3D view…</div>}>
              <Scene3D
                roofs={roofPolygons.map((rp) => {
                  const roof = roofs.find((r) => r.id === rp.id);
                  return {
                    id: rp.id,
                    polygon: rp.polygon,
                    usablePolygon: roofUsablePolygons.find((u) => u.id === rp.id)?.polygon ?? [],
                    buildingHeight: roof.buildingHeight,
                    boundaryHeight: roof.boundaryHeight,
                    type: roof.type,
                    pitchDeg: roof.pitchDeg,
                    slopeDirection: roof.slopeDirection,
                    // A roof can (eventually) hold more than one grid (see
                    // README's "Panel grids" entry) - each carries its own
                    // packed layout/structure/shading/efficiency, plus its
                    // own `rotation` for Scene3D to apply as a render-time
                    // transform (see layoutEngine.js's gridPivot comment).
                    grids: roof.grids.map((g) => ({
                      id: g.id,
                      layout: g,
                      structure: structuresByGrid[gridKey(roof.id, g.id)],
                      shadedIds: instantByGrid[gridKey(roof.id, g.id)]?.shadedIds,
                      efficiencyPct: efficiencyView ? efficiencyByGrid[gridKey(roof.id, g.id)] : undefined,
                    })),
                  };
                })}
                panelSpec={panelSpec}
                obstacles={obstacles}
                sunElevation={sunPos.elevation}
                sunAzimuth={sunPos.azimuth}
                // Drawable presets (see OBSTACLE_PRESETS) are 2D-plan only —
                // a single 3D click can't trace a freehand footprint, so
                // placing mode simply doesn't carry over into this view.
                placingShape={OBSTACLE_PRESETS[placingShape]?.drawable ? null : placingShape}
                onPlaceObstacle={(x, y) => addObstacle(placingShape, Number(x.toFixed(1)), Number(y.toFixed(1)))}
                selectedObstacleId={selectedObstacleId}
                onSelectObstacle={selectObstacle}
                selectedRoofId={selectedRoofId}
                onSelectRoof={selectRoof}
                showPanels={showPanels}
                mapImagePlacement={backdropPlacement}
                mapImageWidePlacement={backdropWidePlacement}
              />
              </React.Suspense>

              {efficiencyView && (
                <div
                  style={{
                    position: 'absolute', right: 12, top: 12, zIndex: 6,
                    background: 'rgba(20,24,20,0.78)', color: '#fff', borderRadius: 20,
                    padding: '6px 14px', fontSize: 12, fontWeight: 600,
                  }}
                >
                  {totalPanelCount} panel{totalPanelCount === 1 ? '' : 's'}
                </div>
              )}

              {/* Overlaid on the 3D viewport itself (see README's "View
                  layout" entry) rather than a separate section below the
                  canvas - a translucent bar so the rendered scene still
                  shows through behind it. */}
              <div
                style={{
                  position: 'absolute', left: 12, right: 12, bottom: 12,
                  background: 'rgba(20,24,20,0.72)', color: '#fff', borderRadius: 10,
                  padding: '10px 14px', backdropFilter: 'blur(3px)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={() => setSunPlaying((p) => !p)}
                    title={sunPlaying ? 'Pause' : 'Animate sun through the day'}
                    style={{
                      border: 'none', borderRadius: '50%', width: 30, height: 30, flexShrink: 0,
                      background: sunPlaying ? '#e0873c' : '#2f6fed', color: '#fff', cursor: 'pointer', fontSize: 13,
                    }}
                  >
                    {sunPlaying ? '❚❚' : '▶'}
                  </button>
                  <span style={{ fontSize: 11, opacity: 0.85, width: 60 }}>Sunrise 05:00</span>
                  <input
                    type="range" min="5" max="19" step="0.5" value={selectedHour}
                    onChange={(e) => { setSunPlaying(false); setSelectedHour(+e.target.value); }}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 11, opacity: 0.85, width: 60, textAlign: 'right' }}>Sunset 19:00</span>
                  <span style={{ fontSize: 12, fontWeight: 600, width: 54, textAlign: 'right' }}>
                    {String(Math.floor(selectedHour)).padStart(2, '0')}:{selectedHour % 1 ? '30' : '00'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <input
                    type="date" value={toDateInputValue(selectedDate)}
                    onChange={(e) => setSelectedDate(new Date(e.target.value + 'T00:00:00'))}
                    style={{ ...inputStyle, width: 130 }}
                  />
                  <div style={{ fontSize: 11, opacity: 0.85 }}>
                    Sun elevation {sunPos.elevation.toFixed(1)}° · azimuth {sunPos.azimuth.toFixed(0)}°
                    {totalPanelCount > 0 && (
                      <> · {Object.values(instantByGrid).reduce((s, inst) => s + inst.shadedIds.size, 0)} of {totalPanelCount} panels shaded right now</>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <svg
            ref={svgRef} viewBox="0 0 560 560" preserveAspectRatio="xMidYMid meet"
            style={{ display: viewMode === 'plan' ? 'block' : 'none', flex: 1, minHeight: 0, width: '100%', height: '100%', background: '#eef3ea', borderRadius: 10, border: '1px solid #d5d5d5', cursor: (placingShape || drawingRoof || placingGrid) ? 'crosshair' : (isPanning ? 'grabbing' : 'grab') }}
            onClick={onSvgClick}
            onDoubleClick={onSvgDoubleClick}
            onWheel={onPlanWheel}
            onMouseDown={onSvgMouseDown}
            onMouseMove={shadowAnalysis ? onSunHeatmapMouseMove : undefined}
            onMouseLeave={shadowAnalysis ? () => setSunHoverInfo(null) : undefined}
          >
            {backdropPlacement && (() => {
              const topLeft = toScreen(
                backdropPlacement.cx - backdropPlacement.widthMeters / 2,
                backdropPlacement.cy + backdropPlacement.heightMeters / 2
              );
              return (
                <image
                  href={backdropPlacement.url}
                  x={topLeft.sx} y={topLeft.sy}
                  width={backdropPlacement.widthMeters * scale}
                  height={backdropPlacement.heightMeters * scale}
                  preserveAspectRatio="none"
                />
              );
            })()}

            {roofPolygons.map((rp) => {
              const isSelected = selectedRoofId === rp.id;
              return (
                <polygon
                  key={rp.id}
                  points={rp.polygon.map((p) => { const s = toScreen(p.x, p.y); return `${s.sx},${s.sy}`; }).join(' ')}
                  fill={isSelected ? 'rgba(216,196,140,0.55)' : (backdropPlacement ? 'rgba(216,210,196,0.35)' : '#d8d2c4')}
                  stroke={isSelected ? '#2f6fed' : '#999'} strokeWidth={isSelected ? 2 : 1}
                  style={{ cursor: (drawingRoof || placingShape || placingGrid || currentStep !== 3) ? 'inherit' : isSelected ? (movingRoof ? 'grabbing' : 'grab') : 'pointer' }}
                  onMouseDown={(e) => {
                    // Once the roof is already selected, a mousedown-drag on
                    // its own body moves the whole roof (see startRoofDrag)
                    // instead of onSvgMouseDown's usual box-select-its-grids
                    // behavior for a roof with panels - stopPropagation keeps
                    // that from also firing. An unselected roof falls
                    // through untouched so the plain click below still
                    // selects it and panning/box-select still work exactly
                    // as before.
                    if (drawingRoof || placingShape || placingGrid || currentStep !== 3) return;
                    if (selectedRoofId !== rp.id) return;
                    startRoofDrag(e, rp.id);
                  }}
                  onClick={(e) => {
                    if (drawingRoof || placingShape || placingGrid) return;
                    // Selecting a roof only makes sense in Roof setup itself
                    // - past that (Panel/Grid setup onward) a click on the
                    // bare roof surface isn't a roof click, so don't
                    // stopPropagation here either: let it bubble up to
                    // onSvgClick's own empty-space handling (deselects
                    // whatever's currently selected), same as clicking
                    // outside any shape entirely.
                    if (currentStep !== 3) return;
                    e.stopPropagation();
                    if (swallowClickAfterDragRef.current) { swallowClickAfterDragRef.current = false; return; }
                    selectRoof(rp.id);
                  }}
                />
              );
            })}

            {/* The roof's own edge-margin band - the ring between its outer
                polygon and roofUsablePolygon's inset one (see that
                function's own comment; the same boundary generateLayout
                packs panels against) - highlighted so it reads as "no
                panels go here" rather than looking like unexplained empty
                roof. One <path> per roof, both rings wound the same way and
                drawn with fill-rule="evenodd" so only the ring itself
                fills, not the inner (usable) area too - a plain even-odd
                donut, not caring which way either ring actually winds.
                Skips a roof whose inset collapsed to nothing (margin(s)
                wider than the roof itself). pointerEvents: 'none' so it
                never steals a click meant for the roof polygon underneath
                or the panels drawn on top of it later. */}
            {roofUsablePolygons.map((rp) => {
              const outer = roofPolygons.find((r) => r.id === rp.id)?.polygon;
              if (!outer || rp.polygon.length < 3) return null;
              const ring = (poly) => poly.map((p, i) => { const s = toScreen(p.x, p.y); return `${i === 0 ? 'M' : 'L'}${s.sx},${s.sy}`; }).join(' ') + ' Z';
              return (
                <path
                  key={`margin-${rp.id}`}
                  d={`${ring(outer)} ${ring(rp.polygon)}`}
                  fill="rgba(240,169,66,0.3)"
                  fillRule="evenodd"
                  stroke="none"
                  style={{ pointerEvents: 'none' }}
                />
              );
            })}

            {/* Roof-wide sun exposure heatmap (see roofSunSamples/
                sunExposureColor above, and the "Shadow analysis" toolbar
                toggle) - drawn right after the margin band so real panels/
                obstacles (drawn later) still paint over it wherever they
                actually sit, rather than hiding them underneath a heatmap
                cell. Each roof's own cells sit in a <g> that's blurred (so
                the individual sample cells read as one continuous gradient
                across the roof rather than a grid of little panel-like
                boxes) and then clipped to that roof's exact usable polygon
                (so the blur - which would otherwise smear color past the
                roof's own edge - and the sample grid's necessary bounding-
                box overscan, see roofSunSamples' own comment, both get cut
                off cleanly at the real, possibly non-rectangular outline).
                pointerEvents:'none' for the same reason the margin band
                itself is - this is a read-only overlay, never a click
                target. */}
            {shadowAnalysis && (
              <defs>
                {roofUsablePolygons.map((rp) => (
                  <clipPath key={`sun-clip-${rp.id}`} id={`sun-clip-${rp.id}`}>
                    <polygon points={rp.polygon.map((p) => { const s = toScreen(p.x, p.y); return `${s.sx},${s.sy}`; }).join(' ')} />
                  </clipPath>
                ))}
              </defs>
            )}
            {shadowAnalysis && Object.entries(roofSunSamples).map(([roofId, { points, cellW, cellH, kWhById, baselineKWh }]) => (
              <g key={`sun-${roofId}`} clipPath={`url(#sun-clip-${roofId})`} style={{ filter: 'blur(5px)', pointerEvents: 'none' }}>
                {points.map((p) => {
                  const pct = baselineKWh > 0 ? Math.round((100 * Math.min(baselineKWh, kWhById[p.id] || 0)) / baselineKWh) : 0;
                  const topLeft = toScreen(p.x - cellW / 2, p.y + cellH / 2);
                  return (
                    <rect
                      key={`sun-${roofId}-${p.id}`}
                      x={topLeft.sx} y={topLeft.sy} width={cellW * scale} height={cellH * scale}
                      fill={sunExposureColor(pct)} fillOpacity={0.85} stroke="none"
                    />
                  );
                })}
              </g>
            ))}

            {/* Edges drawn before (i.e. underneath, in both paint order and
                hit-test priority) the vertex handles below, so a corner's
                own point wins the overlap right at each end of its two
                edges rather than the edge's wide hit-area intercepting it. */}
            {selectedRoof?.polygon && !drawingRoof && !placingShape && !placingGrid && selectedRoof.polygon.map((p, i) => {
              const n = selectedRoof.polygon.length;
              const nextPoint = selectedRoof.polygon[(i + 1) % n];
              const s1 = toScreen(p.x, p.y);
              const s2 = toScreen(nextPoint.x, nextPoint.y);
              const dragging = draggingEdgeIndex === i;
              // A resize cursor hints "drag to move this side" — oriented
              // perpendicular to the edge itself (a mostly-horizontal edge
              // moves up/down, so ns-resize; a mostly-vertical one moves
              // left/right, so ew-resize) rather than always the same icon.
              const cursor = Math.abs(s2.sx - s1.sx) > Math.abs(s2.sy - s1.sy) ? 'ns-resize' : 'ew-resize';
              return (
                <line
                  key={`edge-${i}`}
                  x1={s1.sx} y1={s1.sy} x2={s2.sx} y2={s2.sy}
                  stroke="#2f6fed" strokeWidth={14}
                  // Kept essentially invisible until actively dragged
                  // (rather than stroke="transparent") so the wide hit-area
                  // still registers pointer events consistently — a fully
                  // unpainted stroke isn't guaranteed to be hit-testable.
                  strokeOpacity={dragging ? 0.35 : 0.001}
                  style={{ cursor }}
                  onMouseDown={(e) => startEdgeDrag(e, i)}
                  onClick={(e) => e.stopPropagation()}
                />
              );
            })}

            {selectedRoof?.polygon && !drawingRoof && !placingShape && !placingGrid && selectedRoof.polygon.map((p, i) => {
              const s = toScreen(p.x, p.y);
              const dragging = draggingVertexIndex === i;
              const hovered = hoveredVertexIndex === i;
              return (
                <g key={i}>
                  {/* A larger, invisible hit-area around the small visible
                      handle — both for an easier grab target and so the
                      point cursor/hover feedback below kicks in before the
                      pointer is exactly on the 5px dot. */}
                  <circle
                    cx={s.sx} cy={s.sy} r={14}
                    fill="transparent"
                    style={{ cursor: dragging ? 'grabbing' : 'pointer' }}
                    onMouseDown={(e) => startVertexDrag(e, i)}
                    onMouseEnter={() => setHoveredVertexIndex(i)}
                    onMouseLeave={() => setHoveredVertexIndex((h) => (h === i ? null : h))}
                    // A mousedown+mouseup on this handle (drag or plain
                    // click) still fires a "click" that bubbles up to the
                    // svg's own onClick — without stopping it here, every
                    // drag would end by hitting onSvgClick's empty-space
                    // branch and deselecting the roof being edited.
                    onClick={(e) => e.stopPropagation()}
                  />
                  {/* Turns solid blue on hover/drag — with the pointer
                      cursor above, this is the only cue that this dot (and
                      not the map underneath it) is what's about to move. */}
                  <circle
                    cx={s.sx} cy={s.sy} r={dragging ? 7 : 5}
                    fill={dragging || hovered ? '#2f6fed' : '#fff'}
                    stroke="#2f6fed" strokeWidth={2}
                    style={{ pointerEvents: 'none' }}
                  />
                </g>
              );
            })}

            {/* Mirror mode: every edge of the roof being mirrored becomes a
                pickable side — a thin highlighted line plus a wide
                invisible hit-area (same "visible sliver + fat hit target"
                pattern as the vertex handles above), turning orange on
                hover so it's clear which side a click will mirror across. */}
            {mirrorRoofId && (() => {
              const rp = roofPolygons.find((r) => r.id === mirrorRoofId);
              if (!rp) return null;
              const poly = rp.polygon;
              const n = poly.length;
              return poly.map((p, i) => {
                const next = poly[(i + 1) % n];
                const s1 = toScreen(p.x, p.y);
                const s2 = toScreen(next.x, next.y);
                const hovered = hoveredMirrorEdge === i;
                return (
                  <g key={`mirror-edge-${i}`}>
                    <line
                      x1={s1.sx} y1={s1.sy} x2={s2.sx} y2={s2.sy}
                      stroke={hovered ? '#e0873c' : '#2f6fed'}
                      strokeWidth={hovered ? 6 : 3}
                      style={{ pointerEvents: 'none' }}
                    />
                    <line
                      x1={s1.sx} y1={s1.sy} x2={s2.sx} y2={s2.sy}
                      stroke="transparent" strokeWidth={16}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredMirrorEdge(i)}
                      onMouseLeave={() => setHoveredMirrorEdge((h) => (h === i ? null : h))}
                      onClick={(e) => { e.stopPropagation(); mirrorRoof(mirrorRoofId, i); }}
                    />
                  </g>
                );
              });
            })()}

            {/* Margin-edit mode: same "visible sliver + wide invisible
                hit-area" pattern as mirror mode above, but a click
                selects/toggles an edge (see toggleMarginEdge) rather than
                taking an immediate action - a selected edge stays
                highlighted (purple) independent of hover, so more than one
                can be picked before applying a margin value to all of them
                at once via the roof footer's own field. */}
            {marginEditRoofId && (() => {
              const rp = roofPolygons.find((r) => r.id === marginEditRoofId);
              if (!rp) return null;
              const poly = rp.polygon;
              const n = poly.length;
              return poly.map((p, i) => {
                const next = poly[(i + 1) % n];
                const s1 = toScreen(p.x, p.y);
                const s2 = toScreen(next.x, next.y);
                const hovered = hoveredMarginEdge === i;
                const picked = selectedMarginEdges.has(i);
                return (
                  <g key={`margin-edge-${i}`}>
                    <line
                      x1={s1.sx} y1={s1.sy} x2={s2.sx} y2={s2.sy}
                      stroke={picked ? '#8e44ad' : hovered ? '#e0873c' : '#2f6fed'}
                      strokeWidth={picked || hovered ? 6 : 3}
                      style={{ pointerEvents: 'none' }}
                    />
                    <line
                      x1={s1.sx} y1={s1.sy} x2={s2.sx} y2={s2.sy}
                      stroke="transparent" strokeWidth={16}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredMarginEdge(i)}
                      onMouseLeave={() => setHoveredMarginEdge((h) => (h === i ? null : h))}
                      onClick={(e) => { e.stopPropagation(); toggleMarginEdge(i, e.shiftKey); }}
                    />
                  </g>
                );
              });
            })()}

            {drawingRoof && roofDrawPoints.length > 0 && (
              <>
                <polyline
                  points={roofDrawPoints.map((p) => { const s = toScreen(p.x, p.y); return `${s.sx},${s.sy}`; }).join(' ')}
                  fill="none" stroke="#2f6fed" strokeWidth={2} strokeDasharray="4 3"
                />
                {roofDrawPoints.map((p, i) => {
                  const s = toScreen(p.x, p.y);
                  return <circle key={i} cx={s.sx} cy={s.sy} r={i === 0 ? 6 : 4} fill={i === 0 ? '#2f6fed' : '#fff'} stroke="#2f6fed" strokeWidth={2} />;
                })}
              </>
            )}

            {placingShape && OBSTACLE_PRESETS[placingShape]?.drawable && obstacleDrawPoints.length > 0 && (
              <>
                <polyline
                  points={obstacleDrawPoints.map((p) => { const s = toScreen(p.x, p.y); return `${s.sx},${s.sy}`; }).join(' ')}
                  fill="rgba(47,111,237,0.15)" stroke="#2f6fed" strokeWidth={2} strokeDasharray="4 3"
                />
                {obstacleDrawPoints.map((p, i) => {
                  const s = toScreen(p.x, p.y);
                  return <circle key={i} cx={s.sx} cy={s.sy} r={i === 0 ? 6 : 4} fill={i === 0 ? '#2f6fed' : '#fff'} stroke="#2f6fed" strokeWidth={2} />;
                })}
              </>
            )}

            {placingGrid && gridDrawPoints.length > 0 && (
              <>
                <polyline
                  points={gridDrawPoints.map((p) => { const s = toScreen(p.x, p.y); return `${s.sx},${s.sy}`; }).join(' ')}
                  fill="rgba(47,111,237,0.15)" stroke="#2f6fed" strokeWidth={2} strokeDasharray="4 3"
                />
                {gridDrawPoints.map((p, i) => {
                  const s = toScreen(p.x, p.y);
                  return <circle key={i} cx={s.sx} cy={s.sy} r={i === 0 ? 6 : 4} fill={i === 0 ? '#2f6fed' : '#fff'} stroke="#2f6fed" strokeWidth={2} />;
                })}
              </>
            )}

            {roofs.flatMap((roof) => roof.grids.flatMap((g) =>
              (instantByGrid[gridKey(roof.id, g.id)]?.shadowPolys || []).map((poly, i) => (
                <polygon
                  key={`${roof.id}-${g.id}-${i}`}
                  points={poly.map((p) => { const s = toScreen(p.x, p.y); return `${s.sx},${s.sy}`; }).join(' ')}
                  fill="rgba(20,20,30,0.28)"
                />
              ))
            ))}

            {roofs.flatMap((roof) => roof.grids.flatMap((g) => {
              const shadedIds = instantByGrid[gridKey(roof.id, g.id)]?.shadedIds || new Set();
              const pctMap = efficiencyView ? efficiencyByGrid[gridKey(roof.id, g.id)] : undefined;
              const gSelected = selectedGridKeys.has(gridKey(roof.id, g.id));
              // Delete row/column/panel mode is only ever active for the
              // one grid whose own popup armed it (see gridDeleteMode's
              // state comment) - every other grid's panels behave exactly
              // as normal (whole-grid select/move) regardless.
              const deleteModeActive = gridDeleteMode && selectedGrid?.id === g.id && gridOwnerRoof?.id === roof.id;
              // "Select column" matches by position within each row (see
              // layoutEngine.js's columnIndexMatch) rather than by rackX -
              // rows can have different panel counts on a grid stepped by a
              // tapered/rotated roof edge, so there's no single rackX every
              // row's "column" panel actually shares. Computed once per grid
              // render (not per panel) so every panel's own deletePicked
              // check below is just a Set lookup.
              const columnMatchIds = (deleteModeActive && gridDeleteMode === 'column' && gridDeleteSelection?.panelId != null)
                ? new Set(columnIndexMatch(g, gridDeleteSelection.panelId).matches.map((p) => p.id))
                : null;
              // resolvedGridPanels applies the grid's own `rotation` to each
              // panel's position (a presentation-only transform - see
              // layoutEngine.js's comment above gridPivot); the same
              // rotation is added to the rect's own facing below so the
              // panel visually spins with the grid, not just moves.
              return resolvedGridPanels(g).map((p) => {
                const s = toScreen(p.x - p.w / 2, p.y + p.d / 2);
                const center = toScreen(p.x, p.y);
                const shaded = shadedIds.has(p.id);
                const rotation = (p.rotation || 0) + (g.rotation || 0);
                const pct = pctMap?.[p.id];
                const w = p.w * scale, h = p.d * scale;
                const deletePicked = deleteModeActive && gridDeleteSelection && (
                  (gridDeleteMode === 'row' && gridDeleteSelection.rackY === p.rackY)
                  || (gridDeleteMode === 'column' && columnMatchIds?.has(p.id))
                  || (gridDeleteMode === 'panel' && gridDeleteSelection.panelIds?.includes(p.id))
                );
                return (
                  <g key={`${roof.id}-${g.id}-${p.id}`} transform={rotation ? `rotate(${-rotation} ${center.sx} ${center.sy})` : undefined}>
                    <rect
                      x={s.sx} y={s.sy} width={w} height={h}
                      fill={deletePicked ? '#c0392b' : pct != null ? efficiencyColor(pct) : shaded ? '#e0873c' : (gSelected ? '#4a7dd8' : '#1c2b4a')}
                      stroke={deletePicked ? '#fff' : gSelected ? '#fff' : '#0a1428'} strokeWidth={deletePicked ? 2 : gSelected ? 1.5 : 0.5}
                      style={{ cursor: deleteModeActive ? 'pointer' : (selectedRoofId === roof.id && currentStep === 3) ? (movingRoof ? 'grabbing' : 'grab') : movingGrids ? 'grabbing' : 'pointer', pointerEvents: (placingGrid || addSideMode) ? 'none' : 'auto' }}
                      onMouseDown={(e) => {
                        if (deleteModeActive) {
                          e.stopPropagation();
                          if (gridDeleteMode === 'row') setGridDeleteSelection({ rackY: p.rackY });
                          else if (gridDeleteMode === 'column') setGridDeleteSelection({ panelId: p.id });
                          else {
                            // Panel mode: Cmd(Mac)/Ctrl(Win)+click toggles
                            // the clicked panel in/out of a multi-selection;
                            // a plain click replaces it with just this one,
                            // same as row/column mode's single-pick.
                            const isMulti = e.metaKey || e.ctrlKey;
                            setGridDeleteSelection((prev) => {
                              if (!isMulti) return { panelIds: [p.id] };
                              const existing: any[] = prev?.panelIds || [];
                              return existing.includes(p.id)
                                ? { panelIds: existing.filter((id) => id !== p.id) }
                                : { panelIds: [...existing, p.id] };
                            });
                          }
                          return;
                        }
                        // A panel usually starts a grid drag - but when its
                        // OWN roof is the current selection (not a grid;
                        // selectRoof/selectObstacle always clear the grid
                        // selection, so this is unambiguous), the panels
                        // fully covering the roof's surface would otherwise
                        // leave no bare spot left to grab it by. Move the
                        // whole roof instead in that case.
                        if (selectedRoofId === roof.id && currentStep === 3) {
                          startRoofDrag(e, roof.id);
                          return;
                        }
                        startGridDrag(e, roof.id, g.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {pct != null && w > 10 && h > 8 && (
                      <text
                        x={s.sx + w / 2} y={s.sy + h / 2} textAnchor="middle" dominantBaseline="middle"
                        fontSize={Math.min(w, h) * 0.4} fill="#fff" style={{ pointerEvents: 'none', fontWeight: 600 }}
                      >
                        {pct}%
                      </text>
                    )}
                  </g>
                );
              });
            }))}

            {/* Rotate handle - a small offset circle above the selected
                grid(s)' own combined footprint-center, connected by a thin
                guide line (same pivot startGridRotate itself uses). Only
                shown once a grid is actually selected; dragging it feeds
                startGridRotate/the rotatingGrids effect above. */}
            {selectedGridKeys.size > 0 && (() => {
              const grids = [...selectedGridKeys].map((k) => {
                const { roofId, gridId } = parseGridKey(k);
                return findGrid(roofId, gridId);
              }).filter(Boolean);
              if (grids.length === 0) return null;
              const pivots = grids.map((g) => gridPivot(g));
              const cx = pivots.reduce((s, p) => s + p.x, 0) / pivots.length;
              const cy = pivots.reduce((s, p) => s + p.y, 0) / pivots.length;
              const center = toScreen(cx, cy);
              const handle = { sx: center.sx, sy: center.sy - 28 };
              return (
                <g>
                  <line x1={center.sx} y1={center.sy} x2={handle.sx} y2={handle.sy} stroke="#2f6fed" strokeWidth={1.5} />
                  <circle
                    cx={handle.sx} cy={handle.sy} r={7}
                    fill={rotatingGrids ? '#2f6fed' : '#fff'} stroke="#2f6fed" strokeWidth={2}
                    style={{ cursor: 'grab' }}
                    onMouseDown={startGridRotate}
                    onClick={(e) => e.stopPropagation()}
                  />
                </g>
              );
            })()}

            {/* Marquee for the box-select drag from onSvgMouseDown - a live
                rectangle in screen space while the drag is in progress. */}
            {boxSelectRect && (() => {
              const a = toScreen(boxSelectRect.x0, boxSelectRect.y0);
              const b = toScreen(boxSelectRect.x1, boxSelectRect.y1);
              const x = Math.min(a.sx, b.sx), y = Math.min(a.sy, b.sy);
              return (
                <rect
                  x={x} y={y} width={Math.abs(b.sx - a.sx)} height={Math.abs(b.sy - a.sy)}
                  fill="rgba(47,111,237,0.12)" stroke="#2f6fed" strokeWidth={1} strokeDasharray="4 3"
                  style={{ pointerEvents: 'none' }}
                />
              );
            })()}

            {obstacles.map((o) => {
              const s = toScreen(o.x, o.y);
              const selected = selectedObstacleId === o.id;
              const handleSelectObstacle = (e) => {
                e.stopPropagation();
                if (swallowClickAfterDragRef.current) { swallowClickAfterDragRef.current = false; return; }
                if (!placingShape && !drawingRoof) selectObstacle(o.id);
              };
              if (o.shape === 'cylinder') {
                // A lightning arrestor's real radius is a few cm - too thin
                // to see at most zoom levels - so it gets a fixed, larger
                // marker radius plus a distinct color rather than sharing
                // the plain-gray/tree-green circle every other cylinder
                // obstacle uses (it's a marker, not a real keep-out object -
                // see OBSTACLE_PRESETS.lightningArrestor's `marker: true`).
                const isArrestor = o.label === 'Lightning Arrestor';
                return (
                  <circle
                    key={o.id} cx={s.sx} cy={s.sy} r={isArrestor ? Math.max(o.radius * scale, 5) : o.radius * scale}
                    fill={isArrestor ? '#b0261e' : o.label === 'Tree' ? '#3f6b3a' : '#7d7d7d'} opacity={0.85}
                    stroke={selected ? '#2f6fed' : 'none'} strokeWidth={selected ? 3 : 0}
                    style={{ cursor: 'pointer' }}
                    onClick={handleSelectObstacle}
                  />
                );
              }
              if (o.shape === 'polygon') {
                const isSkylight = o.label === 'Skylight';
                const isWalkway = o.label === 'Walkway';
                // A near-black fill reads as an actual opening rather than
                // an object sitting on the roof - distinct from every other
                // polygon obstacle here, which are all real raised/flush
                // objects (see OBSTACLE_PRESETS.cutout).
                const isCutout = o.label === 'Cutout';
                const fill = isCutout ? '#1a1a1a' : isSkylight ? '#bcdff2' : isWalkway ? '#a8a8a0' : '#8a6d5b';
                const strokeColor = isCutout ? '#000' : isSkylight ? '#5b95b3' : isWalkway ? '#7a7a72' : 'none';
                return (
                  <polygon
                    key={o.id}
                    points={o.polygon.map((p) => { const ps = toScreen(p.x, p.y); return `${ps.sx},${ps.sy}`; }).join(' ')}
                    fill={fill} opacity={isCutout ? 0.9 : isSkylight ? 0.75 : isWalkway ? 0.8 : 0.85}
                    stroke={selected ? '#2f6fed' : strokeColor} strokeWidth={selected ? 3 : (isCutout || isSkylight || isWalkway ? 1 : 0)}
                    style={{ cursor: 'pointer' }}
                    onClick={handleSelectObstacle}
                  />
                );
              }
              return (
                <rect
                  key={o.id}
                  x={s.sx - (o.width * scale) / 2} y={s.sy - (o.depth * scale) / 2}
                  width={o.width * scale} height={o.depth * scale}
                  fill="#8a6d5b" opacity={0.85}
                  stroke={selected ? '#2f6fed' : 'none'} strokeWidth={selected ? 3 : 0}
                  style={{ cursor: 'pointer' }}
                  transform={`rotate(${-o.rotation} ${s.sx} ${s.sy})`}
                  onClick={handleSelectObstacle}
                />
              );
            })}

            {/* "Add row"/"Add column" side-picking - same "visible sliver +
                wide invisible hit-area" pattern as mirror/margin mode above,
                but the two pickable edges come from the grid's own local
                bounding box (see gridLocalBounds), rotated the same way its
                panels are rendered rotated (gridPivot/rotateAroundPivot),
                rather than a roof polygon's edges. Rendered last (on top of
                everything, including the roof's own edge/vertex handles) so
                a "fill full roof" grid - whose edges sit exactly on the roof
                boundary - doesn't have its hit-lines stolen by the roof's
                own edit handles underneath. */}
            {addSideMode && (() => {
              const roof = roofs.find((r) => r.id === addSideMode.roofId);
              const grid = findGrid(addSideMode.roofId, addSideMode.gridId);
              if (!roof || !grid) return null;
              const bounds = gridLocalBounds(grid);
              if (!bounds) return null;
              const direction = roof.type === 'pitched' ? (roof.slopeDirection || 'S') : 'S';
              const pivot = gridPivot(grid);
              const rot = grid.rotation || 0;
              const toWorld = (pt) => rotateAroundPivot(toSlopeWorld(pt, direction), pivot, rot);
              const corners = {
                frontLeft: toWorld({ x: bounds.minX, y: bounds.minY }),
                frontRight: toWorld({ x: bounds.maxX, y: bounds.minY }),
                backLeft: toWorld({ x: bounds.minX, y: bounds.maxY }),
                backRight: toWorld({ x: bounds.maxX, y: bounds.maxY }),
              };
              const edges = addSideMode.axis === 'row'
                ? [{ side: 'front', a: corners.frontLeft, b: corners.frontRight }, { side: 'back', a: corners.backLeft, b: corners.backRight }]
                : [{ side: 'left', a: corners.frontLeft, b: corners.backLeft }, { side: 'right', a: corners.frontRight, b: corners.backRight }];
              return edges.map(({ side, a, b }) => {
                const s1 = toScreen(a.x, a.y);
                const s2 = toScreen(b.x, b.y);
                const hovered = hoveredAddSide === side;
                return (
                  <g key={`add-side-${side}`}>
                    <line
                      x1={s1.sx} y1={s1.sy} x2={s2.sx} y2={s2.sy}
                      stroke={hovered ? '#e0873c' : '#2f6fed'}
                      strokeWidth={hovered ? 6 : 3}
                      style={{ pointerEvents: 'none' }}
                    />
                    <line
                      x1={s1.sx} y1={s1.sy} x2={s2.sx} y2={s2.sy}
                      stroke="transparent" strokeWidth={16}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredAddSide(side)}
                      onMouseLeave={() => setHoveredAddSide((h) => (h === side ? null : h))}
                      onClick={(e) => { e.stopPropagation(); handleAddSide(side); }}
                    />
                  </g>
                );
              });
            })()}

            {/* Slope-direction arrow for every pitched roof - drawn last so
                it stays visible even once the roof is full of panels.
                Points from ridge to eave (the direction water/panels slope
                downhill, i.e. `slopeDirection` itself - see the compass
                buttons' own tooltips in the roof's "Roof type" popover).
                Length is a fraction of the roof's own footprint so it scales
                with the roof rather than staying a fixed screen size. */}
            {roofPolygons.map((rp) => {
              const roof = roofs.find((r) => r.id === rp.id);
              if (!roof || roof.type !== 'pitched') return null;
              const xs = rp.polygon.map((p) => p.x);
              const ys = rp.polygon.map((p) => p.y);
              const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
              const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
              const w = Math.max(...xs) - Math.min(...xs);
              const l = Math.max(...ys) - Math.min(...ys);
              const dir = { N: { x: 0, y: 1 }, S: { x: 0, y: -1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 } }[roof.slopeDirection || 'S'];
              const halfLen = (dir.x !== 0 ? w : l) * 0.3;
              const s1 = toScreen(cx - dir.x * halfLen, cy - dir.y * halfLen);
              const s2 = toScreen(cx + dir.x * halfLen, cy + dir.y * halfLen);
              const angle = Math.atan2(s2.sy - s1.sy, s2.sx - s1.sx);
              const headLen = 12, headAngle = Math.PI / 7;
              const h1 = { x: s2.sx - headLen * Math.cos(angle - headAngle), y: s2.sy - headLen * Math.sin(angle - headAngle) };
              const h2 = { x: s2.sx - headLen * Math.cos(angle + headAngle), y: s2.sy - headLen * Math.sin(angle + headAngle) };
              return (
                <g key={`slope-arrow-${rp.id}`} style={{ pointerEvents: 'none' }}>
                  <line x1={s1.sx} y1={s1.sy} x2={s2.sx} y2={s2.sy} stroke="#e0873c" strokeWidth={3} />
                  <polygon points={`${s2.sx},${s2.sy} ${h1.x},${h1.y} ${h2.x},${h2.y}`} fill="#e0873c" />
                </g>
              );
            })}
          </svg>

          {/* Live readout for whichever sun-exposure cell the pointer is
              over (see onSunHeatmapMouseMove) - position:fixed since
              clientX/clientY are already viewport coordinates, not
              relative to any particular ancestor. */}
          {shadowAnalysis && sunHoverInfo && (
            <div
              style={{
                position: 'fixed', left: sunHoverInfo.clientX + 14, top: sunHoverInfo.clientY + 14, zIndex: 20,
                background: 'rgba(20,20,20,0.85)', color: '#fff', borderRadius: 6, padding: '4px 8px',
                fontSize: 12, fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap',
              }}
            >
              {sunHoverInfo.pct}% sun
            </div>
          )}

          {/* Compact layout-summary readout, step 4 only - the detailed
              per-grid breakdown the old sidebar's "Layout summary" section
              showed now lives in each grid's own floating popup instead;
              this is just the site-wide total, always visible while
              placing grids. */}
          {currentStep === 4 && totalPanelCount > 0 && (
            <div style={{ position: 'absolute', left: 12, bottom: viewMode === '3d' ? 88 : 12, zIndex: 6, ...sectionStyle, padding: '6px 10px', fontSize: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>
              <div>{totalPanelCount} panels · {totalCapacityKW.toFixed(1)} kW across {roofs.length} roof{roofs.length === 1 ? '' : 's'}</div>
              <div style={{ marginTop: 3, color: '#555' }}>
                {Object.entries(structureTotals).map(([kind, t]) => (
                  <span key={kind} style={{ marginRight: 8 }}><span style={{ textTransform: 'capitalize' }}>{kind}s</span>: {formatLength(t.length, units)} ({t.count})</span>
                ))}
              </div>
              {sitePlan.perGrid.length > 0 && (
                <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid #eee' }}>
                  {!sitePlan.valid ? (
                    <div style={{ color: '#c0392b' }}>Inverter assignment: {sitePlan.perGrid.filter((g) => !g.valid).length} grid(s) need attention - see below.</div>
                  ) : (
                    <div>
                      Inverters needed: {sitePlan.inverters.length} × {inverterChoice.model || inverterChoice.acPowerKw + 'kW'}
                      {' '}({(totalCapacityKW / (sitePlan.inverters.length * inverterChoice.acPowerKw) * 100).toFixed(0)}% of combined AC capacity used)
                    </div>
                  )}
                  {inverterSuggestion && (
                    <div style={{ color: '#b8860b' }}>
                      💡 Try {inverterSuggestion.model} instead: same {inverterSuggestion.numInverters} inverter{inverterSuggestion.numInverters === 1 ? '' : 's'}, {(inverterSuggestion.suggestedUtilization * 100).toFixed(0)}% utilized instead of {(inverterSuggestion.currentUtilization * 100).toFixed(0)}%.
                    </div>
                  )}
                  {sitePlan.perGrid.map((g) => (
                    <div key={g.key} style={{ color: g.valid ? '#555' : '#c0392b' }}>
                      {g.label} ({g.panelCount} panels): {g.valid
                        ? `INV-${g.inverterIds.join(', INV-')}${g.pooled ? ' (shared)' : ''} - strings [${g.strings.join(',')}]`
                        : g.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Right-side rail: a fixed compass (see its own comment) plus,
              once a roof/grid/obstacle is selected, that object's own
              properties - symmetric to the left rail (which holds only
              "new object" actions), grouped into one icon per related
              cluster of fields rather than one per field, each opening a
              popover to its LEFT (right:48, since this rail sits on the
              right edge - mirrors the left rail's own popover-to-the-right
              pattern). See the approved plan's "Follow-up: right-side
              properties rail" section for the full per-object icon list
              this mirrors. Always rendered (not gated on a selection) so
              the compass has a stable home whether or not anything's
              selected. */}
          {(() => {
            const toggleGroup = (key) => setRightPanelOpenGroup((g) => (g === key ? null : key));

            return (
              <div className="tooltip-left" style={{ position: 'absolute', top: 12, right: 12, zIndex: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                {/* Orientation legend for the 2D plan - north is always up
                    (toScreen never rotates, see geoConvert.js's x=east/
                    y=north convention), so this is a static reference, not
                    a live-rotating compass. Doesn't apply to the 3D view,
                    which orbits freely. */}
                {viewMode === 'plan' && (
                  <div
                    data-tooltip="Plan view: north is up"
                    aria-label="Compass: north is up"
                    style={{ width: 40, height: 40, borderRadius: 8, background: '#fff', border: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <svg width={32} height={32} viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="13" fill="#fafafa" stroke="#ddd" strokeWidth="1" />
                      <line x1="18" y1="18" x2="18" y2="11" stroke="#e0873c" strokeWidth="2" />
                      <polygon points="18,7 15,12 21,12" fill="#e0873c" />
                      <text x="18" y="6" fontSize="6" fontWeight="700" textAnchor="middle" fill="#e0873c">N</text>
                      <text x="18" y="33" fontSize="6" textAnchor="middle" fill="#888">S</text>
                      <text x="4" y="20" fontSize="6" textAnchor="middle" fill="#888">W</text>
                      <text x="32" y="20" fontSize="6" textAnchor="middle" fill="#888">E</text>
                    </svg>
                  </div>
                )}

                {selectedRoof && (() => {
                  const roofIdx = roofs.findIndex((r) => r.id === selectedRoof.id);
                  const bounds = selectedRoof.polygon ? polygonBounds(selectedRoof.polygon) : null;
                  return (
                    <>
                      {/* A plain text label overflowed this rail's own
                          40px-wide column for anything longer than a couple
                          characters (e.g. a mirrored roof's own
                          "Roof 1-left") - an actual input both fits a wider,
                          fixed box and doubles as the rename control the
                          old bottom-right popup never had. Bound directly to
                          `label` (not roofLabel's own fallback) so the
                          placeholder - not a stale committed value - is what
                          shows while it's empty. */}
                      <input
                        type="text"
                        aria-label="Roof name"
                        value={selectedRoof.label ?? ''}
                        placeholder={`Roof ${roofIdx + 1}`}
                        onChange={(e) => updateRoof(selectedRoof.id, 'label', e.target.value)}
                        style={{ width: 72, fontSize: 10, fontWeight: 600, color: '#333', textAlign: 'center', border: 'none', borderBottom: '1px solid #ccc', background: 'transparent', padding: '2px 0', outline: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      />

                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Dimensions" aria-label="Dimensions" style={iconBtn(rightPanelOpenGroup === 'roofDims')} onClick={() => toggleGroup('roofDims')}>📐</button>
                        <RailPopover open={rightPanelOpenGroup === 'roofDims'}>
                            <div style={labelStyle}><span>width ({units})</span><SliderInput unit={units} min={1} max={150} step={0.5} disabled={!!selectedRoof.polygon} value={bounds ? +bounds.width.toFixed(1) : selectedRoof.width} onChange={(v) => updateRoof(selectedRoof.id, 'width', v)} /></div>
                            <div style={labelStyle}><span>length ({units})</span><SliderInput unit={units} min={1} max={150} step={0.5} disabled={!!selectedRoof.polygon} value={bounds ? +bounds.length.toFixed(1) : selectedRoof.length} onChange={(v) => updateRoof(selectedRoof.id, 'length', v)} /></div>
                            <div style={labelStyle}><span>building height ({units})</span><SliderInput unit={units} min={0} max={50} step={0.5} value={selectedRoof.buildingHeight} onChange={(v) => updateRoof(selectedRoof.id, 'buildingHeight', v)} /></div>
                            <div style={labelStyle}><span>boundary ({units})</span><SliderInput unit={units} min={0} max={5} step={0.1} value={selectedRoof.boundaryHeight ?? 0} onChange={(v) => updateRoof(selectedRoof.id, 'boundaryHeight', v)} /></div>
                            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                              {selectedRoof.polygon?.length ?? 0} points. Drag its corner handles on the 2D plan to resize.
                            </div>
                        </RailPopover>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Panel margin" aria-label="Panel margin" style={iconBtn(rightPanelOpenGroup === 'roofMargin')} onClick={() => toggleGroup('roofMargin')}>▦</button>
                        <RailPopover open={rightPanelOpenGroup === 'roofMargin'}>
                            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>
                              Panel margin{marginEditRoofId === selectedRoof.id ? ' — click edges on the plan to override just those' : ''}
                            </div>
                            <div style={labelStyle}>
                              <span>Default ({units})</span>
                              <SliderInput unit={units} min={0} max={3} step={0.05} value={selectedRoof.edgeMargin ?? 0.5} onChange={(v) => updateRoof(selectedRoof.id, 'edgeMargin', v)} />
                            </div>
                            <button
                              onClick={() => {
                                setMarginEditRoofId((id) => {
                                  const next = id === selectedRoof.id ? null : selectedRoof.id;
                                  if (next === null) setSelectedMarginEdges(new Set());
                                  return next;
                                });
                              }}
                              style={{ border: 'none', background: 'none', color: marginEditRoofId === selectedRoof.id ? '#8e44ad' : '#2f6fed', cursor: 'pointer', fontSize: 11, padding: 0, marginTop: 2 }}
                            >
                              {marginEditRoofId === selectedRoof.id ? 'stop picking edges' : 'override edges…'}
                            </button>
                            {marginEditRoofId === selectedRoof.id && selectedMarginEdges.size > 0 && (() => {
                              const overrides = selectedRoof.edgeMarginOverrides || {};
                              const firstIdx = [...selectedMarginEdges][0];
                              const currentValue = overrides[firstIdx] ?? selectedRoof.edgeMargin ?? 0.5;
                              const hasOverride = [...selectedMarginEdges].some((i) => overrides[i] != null);
                              return (
                                <div style={{ background: '#f6f0fb', borderRadius: 6, padding: 8, marginTop: 6 }}>
                                  <div style={labelStyle}>
                                    <span>{selectedMarginEdges.size} edge{selectedMarginEdges.size === 1 ? '' : 's'} ({units})</span>
                                    <SliderInput unit={units} min={0} max={3} step={0.05} value={currentValue} onChange={(v) => setEdgeMarginOverrides(selectedRoof.id, [...selectedMarginEdges], v)} />
                                  </div>
                                  {hasOverride && (
                                    <button
                                      onClick={() => setEdgeMarginOverrides(selectedRoof.id, [...selectedMarginEdges], null)}
                                      style={{ border: 'none', background: 'none', color: '#8e44ad', cursor: 'pointer', fontSize: 11, padding: 0 }}
                                    >
                                      reset to default
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                        </RailPopover>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Roof type" aria-label="Roof type" style={iconBtn(rightPanelOpenGroup === 'roofType')} onClick={() => toggleGroup('roofType')}>⌂</button>
                        <RailPopover open={rightPanelOpenGroup === 'roofType'}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: '#555' }}>Type</span>
                              <span>
                                <button style={btn(selectedRoof.type === 'flat')} onClick={() => updateRoof(selectedRoof.id, 'type', 'flat')}>Flat</button>{' '}
                                <button style={btn(selectedRoof.type === 'pitched')} onClick={() => updateRoof(selectedRoof.id, 'type', 'pitched')}>Pitched</button>
                              </span>
                            </div>
                            {selectedRoof.type === 'pitched' && (
                              <>
                                <div style={labelStyle}><span>pitch (°)</span><SliderInput min={0} max={60} step={1} value={selectedRoof.pitchDeg} onChange={(v) => updateRoof(selectedRoof.id, 'pitchDeg', v)} /></div>
                                <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'flex-start' }}>
                                  <div>
                                    <div style={{ fontSize: 12, color: '#555', marginBottom: 3 }}>Slope faces</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 22px)', gridTemplateRows: 'repeat(3, 22px)', gap: 2 }}>
                                      <span />
                                      <button
                                        style={{ ...compassBtn(selectedRoof.slopeDirection === 'N'), gridColumn: 2, gridRow: 1 }}
                                        onClick={() => updateRoof(selectedRoof.id, 'slopeDirection', 'N')}
                                        title="Ridge to the south, eave to the north"
                                      >N</button>
                                      <span />
                                      <button
                                        style={{ ...compassBtn(selectedRoof.slopeDirection === 'W'), gridColumn: 1, gridRow: 2 }}
                                        onClick={() => updateRoof(selectedRoof.id, 'slopeDirection', 'W')}
                                        title="Ridge to the east, eave to the west"
                                      >W</button>
                                      <span style={{ gridColumn: 2, gridRow: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#bbb' }}>⌂</span>
                                      <button
                                        style={{ ...compassBtn(selectedRoof.slopeDirection === 'E'), gridColumn: 3, gridRow: 2 }}
                                        onClick={() => updateRoof(selectedRoof.id, 'slopeDirection', 'E')}
                                        title="Ridge to the west, eave to the east"
                                      >E</button>
                                      <span />
                                      <button
                                        style={{ ...compassBtn(selectedRoof.slopeDirection === 'S'), gridColumn: 2, gridRow: 3 }}
                                        onClick={() => updateRoof(selectedRoof.id, 'slopeDirection', 'S')}
                                        title="Ridge to the north, eave to the south"
                                      >S</button>
                                      <span />
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                        </RailPopover>
                      </div>

                      <button
                        data-tooltip={mirrorRoofId === selectedRoof.id ? 'Click an edge on the plan to mirror across it (click again to cancel)' : 'Mirror this roof across an edge'}
                        aria-label="Mirror this roof"
                        style={iconBtn(mirrorRoofId === selectedRoof.id)}
                        onClick={() => setMirrorRoofId((id) => (id === selectedRoof.id ? null : selectedRoof.id))}
                      >⇄</button>
                      <button data-tooltip="Remove this roof" aria-label="Remove this roof" style={iconBtn(false)} onClick={() => removeRoof(selectedRoof.id)}>🗑</button>
                      <button data-tooltip="Deselect" aria-label="Deselect" style={iconBtn(false)} onClick={() => setSelectedRoofId(null)}>✕</button>
                    </>
                  );
                })()}

                {selectedObstacle && (() => {
                  const isCutout = selectedObstacle.label === 'Cutout';
                  return (
                    <>
                      <div style={{ fontSize: 10, color: '#555', fontWeight: 600, textAlign: 'center' }}>{selectedObstacle.label}</div>

                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Properties" aria-label="Properties" style={iconBtn(rightPanelOpenGroup === 'obstacleProps')} onClick={() => toggleGroup('obstacleProps')}>⚙</button>
                        <RailPopover open={rightPanelOpenGroup === 'obstacleProps'}>
                            <div style={{ display: 'grid', gridTemplateColumns: isCutout ? '1fr 1fr' : selectedObstacle.shape === 'polygon' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8 }}>
                              <label style={{ fontSize: 12, color: '#555' }}>x<br /><input style={{ ...inputStyle, width: '100%' }} type="number" disabled={selectedObstacle.shape === 'polygon'} value={selectedObstacle.x} onChange={(e) => updateObstacle(selectedObstacle.id, 'x', +e.target.value)} /></label>
                              <label style={{ fontSize: 12, color: '#555' }}>y<br /><input style={{ ...inputStyle, width: '100%' }} type="number" disabled={selectedObstacle.shape === 'polygon'} value={selectedObstacle.y} onChange={(e) => updateObstacle(selectedObstacle.id, 'y', +e.target.value)} /></label>
                              {/* A Cutout has no height of its own (see
                                  OBSTACLE_PRESETS.cutout) - it removes the full
                                  building height, not a raised/settable amount -
                                  so its own height/boundary fields are dropped
                                  entirely rather than shown as an inert `0`. */}
                              {!isCutout && (
                                <label style={{ fontSize: 12, color: '#555' }}>height<br /><input style={{ ...inputStyle, width: '100%' }} type="number" value={selectedObstacle.height} onChange={(e) => updateObstacle(selectedObstacle.id, 'height', +e.target.value)} /></label>
                              )}
                              {selectedObstacle.shape === 'cylinder' ? (
                                <label style={{ fontSize: 12, color: '#555' }}>radius<br /><input style={{ ...inputStyle, width: '100%' }} type="number" value={selectedObstacle.radius} onChange={(e) => updateObstacle(selectedObstacle.id, 'radius', +e.target.value)} /></label>
                              ) : selectedObstacle.shape === 'polygon' ? (
                                <>
                                  {!isCutout && (
                                    <label style={{ fontSize: 12, color: '#555' }}>boundary (m)<br /><input style={{ ...inputStyle, width: '100%' }} type="number" step="0.1" min="0" value={selectedObstacle.boundaryHeight ?? 0} onChange={(e) => updateObstacle(selectedObstacle.id, 'boundaryHeight', +e.target.value)} /></label>
                                  )}
                                  <div style={{ fontSize: 11, color: '#888', paddingTop: 14 }}>{selectedObstacle.polygon.length} points</div>
                                </>
                              ) : (
                                <label style={{ fontSize: 12, color: '#555' }}>rotation<br /><input style={{ ...inputStyle, width: '100%' }} type="number" value={selectedObstacle.rotation} onChange={(e) => updateObstacle(selectedObstacle.id, 'rotation', +e.target.value)} /></label>
                              )}
                            </div>
                        </RailPopover>
                      </div>

                      {selectedObstacle.label === 'Tree' && (
                        <div style={{ position: 'relative' }}>
                          <button data-tooltip="Canopy" aria-label="Canopy" style={iconBtn(rightPanelOpenGroup === 'obstacleCanopy')} onClick={() => toggleGroup('obstacleCanopy')}>🌳</button>
                          <RailPopover open={rightPanelOpenGroup === 'obstacleCanopy'} width={200}>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {TREE_CANOPIES.map((c) => (
                                  <button key={c} style={{ ...btn(selectedObstacle.canopy === c), textTransform: 'capitalize' }} onClick={() => updateObstacle(selectedObstacle.id, 'canopy', c)}>{c}</button>
                                ))}
                              </div>
                          </RailPopover>
                        </div>
                      )}

                      <button data-tooltip="Remove this obstacle" aria-label="Remove this obstacle" style={iconBtn(false)} onClick={() => removeObstacle(selectedObstacle.id)}>🗑</button>
                      <button data-tooltip="Deselect" aria-label="Deselect" style={iconBtn(false)} onClick={() => setSelectedObstacleId(null)}>✕</button>
                    </>
                  );
                })()}

                {selectedGrid && (() => {
                  const gridIndex = gridOwnerRoof.grids.findIndex((g) => g.id === selectedGrid.id);
                  const autoTilt = gridOwnerRoof.type === 'pitched' ? gridOwnerRoof.pitchDeg : computeAutoTilt(location);
                  const resolvedTilt = selectedGrid.panelTiltDeg ?? autoTilt;
                  const Ls = selectedGrid.orientation === 'landscape' ? panelSpec.width : panelSpec.height;
                  const autoRowSpacing = +computeAutoRowSpacing({ location, tilt: computeAutoTilt(location), Ls }).toFixed(2);
                  const resolvedRowSpacing = selectedGrid.rowSpacing ?? autoRowSpacing;
                  return (
                    <>
                      <div style={{ fontSize: 10, color: '#555', fontWeight: 600, textAlign: 'center' }}>
                        {roofLabel(gridOwnerRoof, roofs.findIndex((r) => r.id === gridOwnerRoof.id))}
                        {gridOwnerRoof.grids.length > 1 ? ` · Grid ${gridIndex + 1}` : ''}
                      </div>

                      <button
                        data-tooltip={(selectedGrid.orientation ?? 'portrait') === 'portrait' ? 'Portrait - click for Landscape' : 'Landscape - click for Portrait'}
                        aria-label="Toggle panel orientation"
                        style={iconBtn(true)}
                        onClick={() => updateGridSettings(gridOwnerRoof.id, selectedGrid.id, { orientation: (selectedGrid.orientation ?? 'portrait') === 'portrait' ? 'landscape' : 'portrait' })}
                      >
                        {(selectedGrid.orientation ?? 'portrait') === 'portrait' ? 'P' : 'L'}
                      </button>

                      {addSideMode && addSideMode.gridId === selectedGrid.id ? (
                        <button data-tooltip={`Click a ${addSideMode.axis === 'row' ? 'front/back' : 'left/right'} edge… (click to cancel)`} aria-label="Cancel add row/column" style={iconBtn(true)} onClick={cancelAddSideMode}>✕</button>
                      ) : (
                        <>
                          <button data-tooltip="Add row" aria-label="Add row" style={iconBtn(false)} onClick={() => startAddRowMode(gridOwnerRoof.id, selectedGrid.id)}>⬍</button>
                          <button data-tooltip="Add column" aria-label="Add column" style={iconBtn(false)} onClick={() => startAddColumnMode(gridOwnerRoof.id, selectedGrid.id)}>⬌</button>
                        </>
                      )}

                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Delete row / column / panel" aria-label="Delete row, column, or panel" style={iconBtn(rightPanelOpenGroup === 'gridDelete' || !!gridDeleteMode)} onClick={() => toggleGroup('gridDelete')}>🗑</button>
                        <RailPopover open={rightPanelOpenGroup === 'gridDelete'} width={220}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#555' }}>Delete:</span>
                              {['row', 'column', 'panel'].map((mode) => (
                                <button
                                  key={mode}
                                  onClick={() => {
                                    setGridDeleteMode((m) => (m === mode ? null : mode));
                                    setGridDeleteSelection(null);
                                  }}
                                  style={{ ...btn(gridDeleteMode === mode), textTransform: 'capitalize' }}
                                >
                                  {mode}
                                </button>
                              ))}
                            </div>
                            {gridDeleteMode && (
                              <div style={{ fontSize: 11, color: '#2f6fed', marginTop: 6 }}>
                                {gridDeleteMode === 'panel'
                                  ? 'Click a panel to pick it (Cmd/Ctrl+click to pick more than one), then press Delete/Backspace to remove it. Esc to exit.'
                                  : `Click a panel to pick its ${gridDeleteMode}, then press Delete/Backspace to remove it. Esc to exit.`}
                              </div>
                            )}
                        </RailPopover>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Rack settings" aria-label="Rack settings" style={iconBtn(rightPanelOpenGroup === 'gridRack')} onClick={() => toggleGroup('gridRack')}>⚙</button>
                        <RailPopover open={rightPanelOpenGroup === 'gridRack'}>
                            <div style={labelStyle}>
                              <span>Panels per row (depth)</span>
                              <SliderInput
                                min={1} max={20} step={1}
                                value={selectedGrid.panelsPerRow}
                                onChange={(v) => updateGridSettings(gridOwnerRoof.id, selectedGrid.id, { panelsPerRow: Math.max(1, Math.round(v)) })}
                              />
                            </div>
                            <div style={{ fontSize: 11, color: '#888' }}>
                              How many panels stack front-to-back on one rack row (e.g. 2 for a
                              "2-up" layout) before the next shading-safe row starts.
                            </div>

                            <div style={labelStyle}>
                              <span>Panel tilt (°)</span>
                              <SliderInput
                                min={0} max={90} step={1}
                                value={resolvedTilt}
                                onChange={(v) => updateGridSettings(gridOwnerRoof.id, selectedGrid.id, { panelTiltDeg: v })}
                              />
                            </div>
                            {selectedGrid.panelTiltDeg != null && (
                              <button
                                onClick={() => updateGridSettings(gridOwnerRoof.id, selectedGrid.id, { panelTiltDeg: null })}
                                style={{ border: 'none', background: 'none', color: '#2f6fed', cursor: 'pointer', fontSize: 11, padding: 0, marginBottom: 4 }}
                              >
                                reset to auto ({autoTilt}°)
                              </button>
                            )}
                            <div style={{ fontSize: 11, color: '#888' }}>
                              The rack's own angle, separate from the roof's own pitch (set
                              in roof setup). Defaults to auto: a pitched roof's own pitch,
                              or a flat roof's latitude-based tilt.
                            </div>

                            <div style={labelStyle}>
                              <span>Row spacing ({units}){gridOwnerRoof.type === 'pitched' ? ' (flat roof only)' : ''}</span>
                              <SliderInput
                                unit={units} min={0.5} max={10} step={0.05} disabled={gridOwnerRoof.type !== 'flat'}
                                value={resolvedRowSpacing}
                                onChange={(v) => updateGridSettings(gridOwnerRoof.id, selectedGrid.id, { rowSpacing: v })}
                              />
                            </div>
                            {gridOwnerRoof.type === 'flat' && selectedGrid.rowSpacing != null && (
                              <button
                                onClick={() => updateGridSettings(gridOwnerRoof.id, selectedGrid.id, { rowSpacing: null })}
                                style={{ border: 'none', background: 'none', color: '#2f6fed', cursor: 'pointer', fontSize: 11, padding: 0, marginBottom: 4 }}
                              >
                                reset to auto ({formatLength(autoRowSpacing, units, 2)})
                              </button>
                            )}
                            <div style={{ fontSize: 11, color: '#888' }}>
                              Auto uses the shading-safe row-to-row spacing computed from
                              this site's own latitude (no inter-row shading 9am-3pm on the
                              winter solstice) - set a value here to override it directly,
                              e.g. for a tighter or more conservative layout than that rule
                              gives.
                            </div>
                        </RailPopover>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Structure" aria-label="Structure" style={iconBtn(rightPanelOpenGroup === 'gridStructure')} onClick={() => toggleGroup('gridStructure')}>🏗</button>
                        <RailPopover open={rightPanelOpenGroup === 'gridStructure'}>
                            <div style={labelStyle}>
                              <span>Mounting</span>
                              <span>
                                {Object.entries(STRUCTURE_STRATEGIES).map(([key, s]) => (
                                  <button
                                    key={key}
                                    style={btn(selectedGrid.structureStrategy === key)}
                                    onClick={() => updateGridSettings(gridOwnerRoof.id, selectedGrid.id, { structureStrategy: key })}
                                  >
                                    {s.label}
                                  </button>
                                ))}
                              </span>
                            </div>
                            <div style={labelStyle}>
                              <span>Min pillar height ({units})</span>
                              <SliderInput
                                unit={units} min={0} max={2} step={0.05}
                                value={gridOwnerRoof.minPillarHeight ?? 0}
                                onChange={(v) => updateRoof(gridOwnerRoof.id, 'minPillarHeight', v)}
                              />
                            </div>
                        </RailPopover>
                      </div>

                      <button data-tooltip="Duplicate selected grid(s)" aria-label="Duplicate selected grid(s)" style={iconBtn(false)} onClick={duplicateSelectedGrids}>⧉</button>
                      <button data-tooltip="Delete selected grid(s)" aria-label="Delete selected grid(s)" style={iconBtn(false)} onClick={deleteSelectedGrids}>🗑</button>
                      <button data-tooltip="Deselect" aria-label="Deselect" style={iconBtn(false)} onClick={() => setSelectedGridKeys(new Set())}>✕</button>
                    </>
                  );
                })()}
              </div>
            );
          })()}
        </div>
      </div>
      )}

      {currentStep === 7 && (
        <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
          <SldView
            projectName={projectName}
            capacityNote={capacityNote}
            gridConnection={gridConnection}
            panelSpec={panelSpec}
            inverterChoice={inverterChoice}
            sitePlan={sitePlan}
            totalPanelCount={totalPanelCount}
            totalCapacityKW={totalCapacityKW}
            inverterSuggestion={inverterSuggestion}
          />
        </div>
      )}

      {/* RIGHT: steps 5-6's own data panel - Output estimate's results and
          Cost estimate's editable pricing, both moved out of the old
          sidebar accordion now that the canvas is full-bleed for these
          steps too. */}
      {(currentStep === 5 || currentStep === 6) && (
        <div style={{ width: 280, flexShrink: 0, overflowY: 'auto', height: '100%' }}>
          {currentStep === 5 && (
            <CollapsibleSection title="Output analysis" defaultOpen>
              <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
                <button style={btn(mode === 'day')} onClick={() => setMode('day')}>Day</button>
                <button style={btn(mode === 'month')} onClick={() => setMode('month')}>Month</button>
                <button style={btn(mode === 'year')} onClick={() => setMode('year')}>Year</button>
              </div>
              <button
                onClick={handleCalculate} disabled={totalPanelCount === 0}
                style={{ width: '100%', padding: 6, borderRadius: 6, border: 'none', background: totalPanelCount ? '#1c2b4a' : '#ccc', color: '#fff', fontSize: 11, cursor: totalPanelCount ? 'pointer' : 'not-allowed', marginBottom: 6 }}
              >
                Calculate {mode} output
              </button>
              {outputResult && (
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <div style={{ color: '#555' }}>{outputResult.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{outputResult.totalKWh.toFixed(1)} kWh</div>
                  <div style={{ fontSize: 11, color: '#666' }}>Avg. {outputResult.avgShadedPct}% of daylight samples shaded</div>
                </div>
              )}
              <details style={{ marginTop: 8, fontSize: 10, color: '#777' }}>
                <summary>Assumptions</summary>
                <div style={labelStyle}><span>System derate</span><SliderInput min={0} max={1} step={0.01} value={assumptions.systemDerate} onChange={(v) => setAssumptions({ ...assumptions, systemDerate: v })} /></div>
                <div style={labelStyle}><span>Diffuse fraction</span><SliderInput min={0} max={1} step={0.05} value={assumptions.diffuseFraction} onChange={(v) => setAssumptions({ ...assumptions, diffuseFraction: v })} /></div>
                <div>
                  Irradiance:{' '}
                  {ghiStatus === 'loading' && 'fetching this site\'s own monthly averages (NASA POWER)…'}
                  {ghiStatus === 'ready' && 'this site\'s own monthly averages (NASA POWER, 2001-2020 climatology).'}
                  {ghiStatus === 'error' && 'couldn\'t fetch this site\'s data - using illustrative sample averages instead.'}
                  {ghiStatus === 'idle' && 'illustrative sample monthly averages.'}
                </div>
              </details>
            </CollapsibleSection>
          )}
          {currentStep === 6 && (
            <>
              {cost && (
                <CollapsibleSection title="Cost estimate" defaultOpen>
                  <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                    <div>Panels: ₹{cost.panelCost.toLocaleString('en-IN')}</div>
                    <div>Structure: ₹{cost.structureCost.toLocaleString('en-IN')}{cost.totalRailLength ? ` (${formatLength(cost.totalRailLength, units, 0)} rail)` : ''}</div>
                    <div style={{ fontWeight: 700, marginTop: 3 }}>Total: ₹{cost.totalCost.toLocaleString('en-IN')}</div>
                  </div>
                </CollapsibleSection>
              )}
              <CollapsibleSection title="Pricing (editable)" defaultOpen>
                <div style={labelStyle}><span>₹/Wp panel</span><SliderInput min={0} max={100} step={1} value={pricing.panelPricePerW} onChange={(v) => setPricing({ ...pricing, panelPricePerW: v })} /></div>
                <div style={labelStyle}><span>₹/m rail</span><SliderInput min={0} max={2000} step={50} value={pricing.structureRatePerMeter} onChange={(v) => setPricing({ ...pricing, structureRatePerMeter: v })} /></div>
                <div style={labelStyle}><span>₹/mount (pitched)</span><SliderInput min={0} max={2000} step={50} value={pricing.mountCostPerPanel} onChange={(v) => setPricing({ ...pricing, mountCostPerPanel: v })} /></div>
              </CollapsibleSection>
            </>
          )}
        </div>
      )}
    </div>
    </div>
  );
}
