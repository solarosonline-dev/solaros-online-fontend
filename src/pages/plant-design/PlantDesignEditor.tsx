import React, { useState, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import type { PlantDesignData, PlantDesignEditorProps } from './types.js';
import './PlantDesignEditor.css';
import { getRoofPolygon, reflectPointAcrossLine, pointInPolygon, toSlopeLocal, toSlopeWorld, roofUsablePolygon, slopeDirectionAzimuth, getRoofAzimuth, autoRoofAzimuth, edgeAlignedAzimuth, azimuthOffset, orientedRoofExtents, resizeRoofPolygon, longestEdgeFrameAzimuth, convexPolygonsOverlap, rotatePoints, longEdgeAngle, obstacleFootprintPoints, packingAzimuth, roofSurfaceHeightAt, treeTrunkHeight, isFlushOnSlope } from './geometry.js';
import { solarPosition } from './solarMath.js';
import { metersPerPixel } from '../../components/map/geoConvert.js';
import { buildLocationPreviewImage, buildWideLocationPreviewImage } from '../../components/map/staticMap.js';
import { fetchMonthlyGHI, fetchDesignTemperatureRange } from './irradiance.js';
import {
  OBSTACLE_ICONS, Cube3DIcon, FlatRoofIcon, PitchedRoofIcon,
  CANOPY_ICONS, STRUCTURE_ICONS, DELETE_MODE_ICONS,
  CloseIcon, PlusIcon, TrashIcon, RulerIcon, MirrorIcon,
  FillGridIcon, TableGridIcon, MarginIcon, DrawAreaIcon,
  DuplicateIcon, ArrowRightIcon, TreeIcon, GroundMountIcon,
  SunIcon, EfficiencyIcon, RackTiltIcon, DeletePanelIcon, CompassIcon, AlignEdgeIcon, RotateIcon,
} from './icons.js';
import {
  SAMPLE_MONTHLY_GHI,
  OBSTACLE_PRESETS,
  generateLayout,
  generateFixedGrid,
  respaceFixedGrid,
  getInstantShading,
  computeOutput,
  computeCost,
  computeStructure,
  STRUCTURE_STRATEGIES,
  computeAutoTilt,
  computeAutoRowSpacing,
  resolvedGridPanels,
  resolvedGrid,
  resolvedGridAzimuth,
  gridPivot,
  rotateAroundPivot,
  suggestMaxPanelsPerRow,
  gridLocalBounds,
  previewGridAdd,
  gridAddCandidates,
  gridPanelFitsRoof,
  appendGridPanels,
  gridRackToWorld,
  deleteGridRow,
  deleteGridColumn,
  deleteGridPanel,
  columnIndexMatch,
  bestRoofForGrid,
  reparentGridToRoof,
  gridDirection,
} from './layoutEngine.js';
import SiteMap from '../../components/map/SiteMap.js';
import useIsMobile from '../../hooks/useIsMobile';
// Lazy-loaded: three/@react-three/fiber/@react-three/drei alone push the
// main bundle well past the PWA plugin's 2MB precache limit, and the 3D
// view is opt-in (most sessions never toggle it) - splitting it into its
// own chunk keeps the everyday bundle lean without dropping the feature.
const Scene3D = React.lazy(() => import('./Scene3D.jsx'));
import SldView from './SldView.jsx';
import DesignReport, { type ReportRoofRow } from './DesignReport';
import type { SitePlanData } from './SitePlanSvg';
import { buildReportPdf, reportFilename } from './designReportPdf';
import { MODULE_CATALOG, CUSTOM_MODULE_MAKE, moduleCatalogMakes, moduleCatalogModels, findModule } from './moduleCatalog.js';
import { INVERTER_CATALOG, CUSTOM_INVERTER_MAKE, inverterCatalogMakes, inverterCatalogModels, findInverter } from './inverterCatalog.js';
import { sizeStrings } from './stringSizing.js';
import { assignSiteToInverters } from './gridInverterAssignment.js';
import ConfirmDialog from '../../components/ConfirmDialog';
import { CollapsibleSection, SliderInput, InfoTip, metersToFeet } from './PlantDesignControls.jsx';
import OutputChartPanel, { formatKWh, formatPct, shadingLossPct, emptyOutputSeries, addToOutputSeries, type OutputSeries } from './OutputChartPanel.jsx';

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
const ROOF_DEFAULTS = { width: 14, length: 10, type: 'flat', pitchDeg: 15, slopeDirection: 'S', polygon: null, buildingHeight: 3, minPillarHeight: 0.15, structureStrategy: 'truss', boundaryHeight: 0, edgeMargin: 0.1, edgeMarginOverrides: {}, azimuth: null };

// See handleSave's own comment: keep each on-screen image url when the
// server's entry is the same capture, only taking its s3Key. Returns `prev`
// itself when nothing actually changed, so nothing downstream re-renders.
function sameSiteCapture(a, b) {
  return !!a && !!b && a.centerLat === b.centerLat && a.centerLon === b.centerLon
    && a.zoom === b.zoom && a.sizePx === b.sizePx && a.scale === b.scale;
}
function mergeSavedSiteImages(prev, saved) {
  let changed = false;
  const next = { ...prev };
  for (const key of ['locationImage', 'locationImageWide']) {
    const cur = prev?.[key] ?? null, srv = saved?.[key] ?? null;
    let merged;
    if (sameSiteCapture(cur, srv)) merged = srv.s3Key && srv.s3Key !== cur.s3Key ? { ...cur, s3Key: srv.s3Key } : cur;
    else merged = srv;
    if (merged !== cur) changed = true;
    next[key] = merged;
  }
  return changed ? next : prev;
}

// Swaps in freshly presigned URLs (onRefreshSiteImages) for site images that
// are still the same saved S3 object (matching s3Key) - their old URL has
// likely expired (presigned S3 GETs last 1 hour). Anything else is left
// alone: an image with no s3Key is still the live Google URL (doesn't
// expire), and one whose key differs was re-captured locally since the last
// save, so the server's copy is the stale one.
function refreshSiteImageUrls(prev, fresh) {
  let changed = false;
  const next = { ...prev };
  for (const key of ['locationImage', 'locationImageWide']) {
    const cur = prev?.[key], srv = fresh?.[key];
    if (cur?.s3Key && srv?.s3Key === cur.s3Key && srv.url && srv.url !== cur.url) {
      next[key] = { ...cur, url: srv.url };
      changed = true;
    }
  }
  return changed ? next : prev;
}

function toDateInputValue(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Feet shown as decimal (e.g. `12.5 ft`), not feet+inches - simpler and
// consistent with the rest of the app's precision level (see README's
// "Input UX" entry).
function formatLength(meters, units, decimals = 1) {
  const v = units === 'ft' ? metersToFeet(meters) : meters;
  return `${v.toFixed(decimals)} ${units}`;
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
// Rotate affordance shared by grids and obstacles (shown while that
// object's Rotate popover is open): a dashed outline through `corners`
// (screen coords, in order) plus a slim curved double-arrow wrapped around
// the outside of each corner - centered a few px out along the diagonal
// from `center` so it clears the corner, white halo underneath so it reads
// over satellite imagery. Pressing any arrow calls `onStart` (the caller's
// own rotate drag); `angleLabel` shows at `center` while `dragging`. A long,
// thin outline (one side 3x+ the other - a walkway, a single-row grid) gets
// just two arrows, at the middle of each short end, instead of four corner
// ones crowding each other.
function RotateHandles({ corners, center, dragging, angleLabel, onStart }) {
  const [hovered, setHovered] = useState<any>(null);
  const side = (a, b) => Math.hypot(b.sx - a.sx, b.sy - a.sy);
  const mid = (a, b) => ({ sx: (a.sx + b.sx) / 2, sy: (a.sy + b.sy) / 2 });
  let handlePoints = corners;
  if (corners.length === 4) {
    const s01 = side(corners[0], corners[1]), s12 = side(corners[1], corners[2]);
    if (Math.max(s01, s12) >= 3 * Math.min(s01, s12)) {
      handlePoints = s01 < s12
        ? [mid(corners[0], corners[1]), mid(corners[2], corners[3])]
        : [mid(corners[1], corners[2]), mid(corners[3], corners[0])];
    }
  }
  return (
    <g>
      <polygon
        points={corners.map((pt) => `${pt.sx},${pt.sy}`).join(' ')}
        fill="none" stroke="#2f6fed" strokeWidth={1.5} strokeDasharray="5 4"
        style={{ pointerEvents: 'none' }}
      />
      {handlePoints.map((pt, i) => {
        const phi = Math.atan2(pt.sy - center.sy, pt.sx - center.sx);
        const R = 18, span = 55 * Math.PI / 180;
        const t0 = phi - span, t1 = phi + span;
        const ox = pt.sx + 4 * Math.cos(phi), oy = pt.sy + 4 * Math.sin(phi);
        const at = (t) => ({ x: ox + R * Math.cos(t), y: oy + R * Math.sin(t) });
        const p0 = at(t0), p1 = at(t1);
        const arc = `M ${p0.x} ${p0.y} A ${R} ${R} 0 0 1 ${p1.x} ${p1.y}`;
        // Arrowhead at an arc end, along the tangent, pointing away from the
        // arc's middle.
        const head = (t, sign) => {
          const tip = at(t);
          const tx = -Math.sin(t) * sign, ty = Math.cos(t) * sign;
          const nx = Math.cos(t), ny = Math.sin(t);
          const L = 7, W = 4.5;
          const f = { x: tip.x + tx * 2.5, y: tip.y + ty * 2.5 };
          return `${f.x},${f.y} ${f.x - tx * L + nx * W},${f.y - ty * L + ny * W} ${f.x - tx * L - nx * W},${f.y - ty * L - ny * W}`;
        };
        const hot = dragging || hovered === i;
        const grab = at(phi);
        return (
          <g key={`rotate-handle-${i}`}>
            <g style={{ pointerEvents: 'none' }}>
              <path d={arc} fill="none" stroke="#fff" strokeWidth={hot ? 7 : 5.5} strokeLinecap="round" />
              <polygon points={head(t0, -1)} fill="#fff" stroke="#fff" strokeWidth={2.5} strokeLinejoin="round" />
              <polygon points={head(t1, 1)} fill="#fff" stroke="#fff" strokeWidth={2.5} strokeLinejoin="round" />
              <path d={arc} fill="none" stroke="#2f6fed" strokeWidth={hot ? 3.2 : 2.4} strokeLinecap="round" />
              <polygon points={head(t0, -1)} fill="#2f6fed" />
              <polygon points={head(t1, 1)} fill="#2f6fed" />
            </g>
            <circle
              cx={grab.x} cy={grab.y} r={14}
              fill="transparent"
              style={{ cursor: dragging ? 'grabbing' : 'grab' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              onMouseDown={onStart}
              onClick={(e) => e.stopPropagation()}
            />
          </g>
        );
      })}
      {dragging && (
        <g style={{ pointerEvents: 'none' }}>
          <rect x={center.sx - 26} y={center.sy - 12} width={52} height={24} rx={12} fill="#2f6fed" />
          <text x={center.sx} y={center.sy + 4.5} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff">{angleLabel}</text>
        </g>
      )}
    </g>
  );
}

function RailPopover({ open, width = 260, children }) {
  const ref = useRef<any>(null);
  const isMobile = useIsMobile();
  const [shiftY, setShiftY] = useState(0);
  // The shift currently applied, so a re-measure can undo it (see below).
  const shiftYRef = useRef(0);
  shiftYRef.current = shiftY;
  // Mobile only: the right rail (see its own comment further down) caps
  // its own height and scrolls internally so its ever-growing icon list
  // doesn't run off the bottom of the screen - but CSS only allows that
  // (overflow-y: auto) by also forcing overflow-x to auto on the same
  // box, which would clip this popover's usual "open to the left of the
  // trigger" placement the moment it extends past the rail's own narrow
  // width. `position: fixed` (viewport-relative, computed from the
  // trigger's own on-screen position via its parent - the same
  // `position: relative` wrapper every call site already renders around
  // its trigger button) escapes that clipping entirely, so it renders
  // freely over the canvas regardless of the rail's own scroll state.
  const [fixedPos, setFixedPos] = useState<any>(null);

  useLayoutEffect(() => {
    if (!open) { setShiftY(0); setFixedPos(null); return; }
    const el = ref.current;
    if (!el) return;
    const margin = 12;

    if (isMobile) {
      const anchor = el.parentElement;
      const anchorRect = anchor ? anchor.getBoundingClientRect() : el.getBoundingClientRect();
      const effectiveWidth = Math.min(width, window.innerWidth - margin * 2);
      const left = Math.max(margin, anchorRect.left - effectiveWidth - 8);
      const naturalHeight = el.getBoundingClientRect().height || 200;
      const top = Math.max(margin, Math.min(anchorRect.top, window.innerHeight - margin - naturalHeight));
      setFixedPos({ left, top, width: effectiveWidth });
      return;
    }
    setFixedPos(null);
    // Measure the popover's *natural* (unshifted) position: the rect already
    // includes the translateY applied last time, so measuring it as-is saw
    // "no overflow", reset to 0, overflowed again next render, and so on -
    // a popover tall enough to need the shift (e.g. Mounting) flickered up
    // and down on every re-render, which orbiting the 3D view triggers
    // continuously.
    const rect = el.getBoundingClientRect();
    const naturalTop = rect.top - shiftYRef.current;
    const naturalBottom = rect.bottom - shiftYRef.current;
    const overflowBelow = naturalBottom - (window.innerHeight - margin);
    if (overflowBelow <= 0) { setShiftY(0); return; }
    const maxShift = naturalTop - margin;
    setShiftY(-Math.min(overflowBelow, Math.max(maxShift, 0)));
    // Re-measure whenever the popover's own content changes size (e.g.
    // picking a roof edge to override reveals a new block) - `children`
    // itself isn't a stable dependency, but that's fine here: we only
    // care that *some* render happened while open, not what changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, children, isMobile, width]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      className="rail-popover"
      style={{
        position: isMobile ? 'fixed' : 'absolute',
        ...(isMobile
          ? (fixedPos || { left: -9999, top: -9999 })
          : { right: 48, top: 0, width, transform: shiftY ? `translateY(${shiftY}px)` : undefined }),
        background: '#fff', border: '1px solid #e2e2e2', borderRadius: 8, padding: 10,
        boxShadow: '0 4px 18px rgba(0,0,0,0.18)', maxHeight: '70vh', overflowY: 'auto', zIndex: 20,
      }}
    >
      {children}
    </div>
  );
}

// Roof chooser shown when an action could apply to more than one roof -
// "Fill roof" (with an "All roofs" option) and "Add grid by size" (after
// picking rows × cols). Each row names the roof with its type, area and
// current panel count; hovering one highlights that roof on the 2D plan
// (via `onHover`) so "Roof 2" is never a guess.
function RoofPickerList({ title, subtitle = null as any, rows, allOption = null as any, onPick, onHover, onClose, onBack = null as any }) {
  return (
    <div
      style={{ padding: 10, background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.22)', border: '1px solid #dcdcdc', width: 240, boxSizing: 'border-box', zIndex: 1000 }}
      onMouseLeave={() => onHover(null)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: subtitle ? 2 : 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{title}</span>
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#888', display: 'flex' }}>
          <CloseIcon size={12} />
        </button>
      </div>
      {subtitle && <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{subtitle}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {allOption && (
          <button className="pde-btn" style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 600 }} onClick={allOption.onPick} onMouseEnter={() => onHover('all')}>
            {allOption.label}
          </button>
        )}
        {rows.map((r) => (
          <button
            key={r.id}
            className={`pde-btn${r.selected ? ' pde-active' : ''}`}
            style={{ textAlign: 'left', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 1 }}
            onClick={() => onPick(r.id)}
            onMouseEnter={() => onHover(r.id)}
          >
            <span style={{ fontWeight: 600, fontSize: 12 }}>{r.name}</span>
            <span style={{ fontSize: 10, color: '#888', fontWeight: 400 }}>{r.detail}</span>
          </button>
        ))}
      </div>
      {onBack && (
        <button onClick={onBack} style={{ border: 'none', background: 'none', color: '#2f6fed', cursor: 'pointer', fontSize: 11, padding: 0, marginTop: 8 }}>
          ← Change size
        </button>
      )}
    </div>
  );
}

function TablePickerGrid({ onSelect, onClose }: { onSelect: (rows: number, cols: number) => void; onClose: () => void }) {
  const [hover, setHover] = useState({ rows: 1, cols: 1 });

  return (
    <div
      style={{
        padding: 10,
        background: '#ffffff',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
        border: '1px solid #dcdcdc',
        width: 206,
        boxSizing: 'border-box',
        zIndex: 1000,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#333' }}>Insert grid by size</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#888', display: 'flex' }}
        >
          <CloseIcon size={12} />
        </button>
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 15px)', gap: 3, justifyContent: 'center' }}
        onMouseLeave={() => setHover({ rows: 1, cols: 1 })}
      >
        {Array.from({ length: 10 }, (_, rIdx) => {
          const r = rIdx + 1;
          return Array.from({ length: 10 }, (_, cIdx) => {
            const c = cIdx + 1;
            const active = r <= hover.rows && c <= hover.cols;
            return (
              <div
                key={`${r}-${c}`}
                onMouseEnter={() => setHover({ rows: r, cols: c })}
                onClick={() => onSelect(r, c)}
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: 2,
                  backgroundColor: active ? '#2563eb' : '#f1f5f9',
                  border: active ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                  cursor: 'pointer',
                  transition: 'background-color 0.05s',
                }}
              />
            );
          });
        })}
      </div>
      <div style={{ fontSize: 11, color: '#475569', marginTop: 6, textAlign: 'center', fontWeight: 600 }}>
        {hover.rows} × {hover.cols} ({hover.rows * hover.cols} panel{hover.rows * hover.cols === 1 ? '' : 's'})
      </div>
    </div>
  );
}

// ============================================================
// Component
// ============================================================
export default function PlantDesignEditor({ initialDesignData, onSave, onCaptureSiteImage, linkedWorkOrderId, onAttachPdf, reportContext, onRefreshSiteImages }: PlantDesignEditorProps) {
  const svgRef = useRef<any>(null);
  const isMobile = useIsMobile();

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
  // The pointer's current world position while any of the three point-by-
  // point tools above is active - drives the dotted "rubber band" preview
  // segment from the last placed point to wherever the pointer is now (see
  // the svg's own pointCountBadge/drawCursorWorld usage), so the user can
  // see where the next click will actually land - including whether it
  // lines up straight or at a clean angle with the segment before it -
  // before committing to it. null whenever no draw tool is active.
  const [drawCursorWorld, setDrawCursorWorld] = useState<any>(null);
  // Obstacle copy/paste. `obstacleClipboard` is the copied obstacle (a
  // snapshot, set by Cmd/Ctrl+C or the right rail's Copy button); while the
  // Copy button's click-to-place is active, `placingShape` is the sentinel
  // 'copy' so every existing click-to-place path (2D click, 3D click,
  // crosshair, roof/panel click guards) handles it - see addObstacle.
  // `pasteCountRef` steps repeated keyboard pastes further from the source.
  const [obstacleClipboard, setObstacleClipboard] = useState<any>(null);
  const pasteCountRef = useRef(0);
  // Set when a just-closed grid polygon didn't land on any roof (see
  // addGridFromPolygon) - shown inline near the "+ Place grid" button so
  // that failure isn't silent, cleared on the next attempt.
  const [gridPlacementError, setGridPlacementError] = useState<any>(null);
  const [gridTablePickerOpen, setGridTablePickerOpen] = useState(false);
  // Multi-roof choosers (see RoofPickerList): the Fill roof one, and the
  // rows × cols picked in the table picker while its roof is being chosen
  // (null = still on the size grid). `hoveredPickRoofId` is the roof (or
  // 'all') currently hovered in either list, highlighted on the 2D plan.
  const [fillPickerOpen, setFillPickerOpen] = useState(false);
  const [tablePickSize, setTablePickSize] = useState<any>(null);
  const [hoveredPickRoofId, setHoveredPickRoofId] = useState<any>(null);
  // Whether the map picker is currently shown in place of the center pane
  // ('location' — the only map mode now; shape tracing happens on the 2D
  // plan itself, see startRoofDraw).
  const [mapMode, setMapMode] = useState<any>(null);
  // Nothing to show in the center pane until a location's been picked —
  // before that, the app is just the left panel (see the main return below).
  const [locationConfirmed, setLocationConfirmed] = useState(initialDesignData?.locationConfirmed ?? false);
  // The location actually last confirmed, as opposed to `location` itself
  // (which updates live as the pin's dragged/typed, before ever being
  // confirmed) - lets handleLocationConfirm tell a genuine change apart
  // from a no-op re-click of "Next" after just navigating back to step 1
  // without touching anything (see its own comment). Seeded from the saved
  // design so reopening an already-confirmed design doesn't treat its own
  // location as new the first time "Next" is clicked again.
  const lastConfirmedLocationRef = useRef(
    initialDesignData?.locationConfirmed
      ? { lat: initialDesignData.location.lat, lon: initialDesignData.location.lon }
      : null
  );
  // A location change that would actually reset work already done (roofs/
  // panels/output/cost, or having reached past Configuration) - held here
  // until the user confirms it in the dialog below, rather than applied
  // immediately on "Next".
  const [pendingLocationChange, setPendingLocationChange] = useState<{ lat: number; lon: number } | null>(null);
  // A just-added obstacle that overlaps one or more already-placed panels
  // (see promptOverlapRemovalIfNeeded) - held here until the user picks
  // Remove or Keep in the dialog below.
  const [obstacleOverlapPrompt, setObstacleOverlapPrompt] = useState<{ hits: { roofId: any; gridId: any; panelId: any }[] } | null>(null);
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
    cancelActiveModes();
    setCurrentStep(step);
  }
  function advanceToStep(step) {
    if (step !== 1) setMapMode(null);
    clearSelectionForStep(step);
    cancelActiveModes();
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
  // Edge index whose row in the Panel margin popover's overrides list is
  // hovered - highlights that edge on the plan so "Edge 3" is findable.
  const [hoveredOverrideEdge, setHoveredOverrideEdge] = useState<any>(null);
  // The roof currently in "click an edge to align panel rows with it" mode
  // (the Azimuth popover's "align to edge…") - same pickable hit-line
  // pattern as mirror/margin mode above. A click sets that roof's azimuth
  // override via edgeAlignedAzimuth and exits the mode; the hovered edge
  // previews the facing it would produce as an arrow.
  const [alignEdgeRoofId, setAlignEdgeRoofId] = useState<any>(null);
  const [hoveredAlignEdge, setHoveredAlignEdge] = useState<any>(null);
  const [viewMode, setViewMode] = useState('plan');
  // Short-lived banner explaining an automatic 3D -> 2D switch (see
  // switchToPlanFor) - null when nothing to say.
  const [viewNotice, setViewNotice] = useState<any>(null);
  const viewNoticeTimerRef = useRef<any>(null);
  // How far the 3D compass needle should currently be rotated to keep
  // pointing at true north (see Scene3D.jsx's compassAngleDeg) - the 2D
  // plan view needs no equivalent state since north is always screen-up
  // there (a fixed reference, not tracked).
  const [compass3DAngleDeg, setCompass3DAngleDeg] = useState(0);
  const [planZoom, setPlanZoom] = useState(1);
  // The 2D plan's viewBox height is held fixed at 560 and its width tracks
  // the svg's own on-screen aspect ratio (see the ResizeObserver effect just
  // below) so viewBox and container are always the same shape -
  // preserveAspectRatio="xMidYMid meet" then has nothing to letterbox, and
  // the backdrop image/content fill the container edge-to-edge instead of
  // leaving bare space down the sides on a wide screen (or top/bottom on a
  // narrow one). Starts at 560 (square) before the first layout pass has a
  // real size to measure.
  const [planViewBoxWidth, setPlanViewBoxWidth] = useState(560);
  const PLAN_VIEWBOX_HEIGHT = 560;
  // Screen-space pan offset (in viewBox pixels) for the 2D plan — without
  // this, zooming in always keeps the same center point in view with no
  // way to shift focus to the parts of the shape that scrolled off-screen.
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<any>(null);

  // The svg (and so svgRef.current) doesn't exist in the DOM at all until
  // currentStep reaches Roof setup (see the CENTER block's own render
  // condition further down) - an empty dependency array here would only
  // ever run this effect once, at the whole editor's own mount, which on a
  // brand new design is always step 1 (svgRef.current still null then).
  // It'd silently no-op forever after that and planViewBoxWidth would
  // never leave its square fallback for that entire session - exactly
  // backwards from a design reopened past step 2, where the svg (and a
  // real size to measure) is already there on the very first render.
  // Re-running whenever currentStep changes re-attaches the observer once
  // the svg actually mounts, instead of only ever getting one shot at it.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (w > 0 && h > 0) setPlanViewBoxWidth(PLAN_VIEWBOX_HEIGHT * (w / h));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [currentStep]);
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
  // Live drag state for moving a single obstacle - same shape as
  // roofMoveRef (screen-space start for the click-vs-drag threshold, plus
  // the obstacle's own starting x/y/polygon so every mousemove re-applies
  // one delta from origin instead of accumulating rounding error).
  const obstacleMoveRef = useRef<any>(null);
  const [movingObstacle, setMovingObstacle] = useState(false);
  // Live drag state for rotating the selected box/drawn obstacle from its
  // Rotate popover's corner handles - same shape as rotateDragRef (pivot +
  // starting pointer angle), plus the obstacle's own starting rotation
  // (box) or outline (drawn shape) to re-apply one delta from every move.
  const obstacleRotateRef = useRef<any>(null);
  const [rotatingObstacle, setRotatingObstacle] = useState(false);
  // Vertex handles for the selected drawn (polygon) obstacle - elevation,
  // skylight, walkway, cutout - same idea as the roof's own corner handles
  // (draggingVertexIndex/hoveredVertexIndex), but kept separate since a
  // roof and an obstacle are never selected at the same time and their
  // drag ends differently (an obstacle has no grids to invalidate).
  const [draggingObstacleVertex, setDraggingObstacleVertex] = useState<any>(null);
  const [hoveredObstacleVertex, setHoveredObstacleVertex] = useState<any>(null);
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
  // Adding to a grid. The selected grid shows a "+" handle on each side
  // (gridSideHandles): click adds one row/column, drag outward adds as many
  // as the drag covers (`addDrag`, previewed live, applied on release).
  // Add -> Panels (`addPanelsMode`) offers every free slot next to the grid
  // (gridAddCandidates) to pick individually - click, or drag across slots
  // on the 2D plan - then adds the picks in one go. Replaced a separate
  // Add row / Add column mode where you then clicked one of two edges.
  const [addDrag, setAddDrag] = useState<any>(null); // { roofId, gridId, side, count } | null
  const [hoveredAddHandle, setHoveredAddHandle] = useState<any>(null); // 'front' | 'back' | 'left' | 'right' | null
  const addDragRef = useRef<any>(null);
  const [addPanelsMode, setAddPanelsMode] = useState<any>(null); // { roofId, gridId } | null
  const [addPanelsPicks, setAddPanelsPicks] = useState<Set<string>>(new Set());
  const addPaintRef = useRef<any>(null); // { adding: boolean } while drag-picking slots
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
      const clones = ids.map((gridId) => {
        const g = roof.grids.find((gg) => gg.id === gridId);
        if (!g) return null;
        const direction = gridDirection(g, roof);
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
        const preserveCount = patch.panelsPerRow === undefined && patch.orientation === undefined;
        // The size this grid is meant to be (so tilt/spacing changes never
        // grow it - see 6cfa974). Remembered as `panelCap` the first time it
        // caps a repack, alongside the count that repack produced
        // (`panelCapCount`), and reused while the grid still has that count:
        // re-reading it from the *current* count instead made any temporary
        // loss permanent - widening row spacing dropped rows, and setting it
        // back to 0 was then capped at the smaller count. A different count
        // means the user added/deleted panels since, so that becomes the new
        // intended size.
        const currentCount = g.panels ? g.panels.length : 0;
        const cap = !preserveCount ? null
          : (g.panelCap && g.panelCapCount === currentCount)
            ? g.panelCap
            : { maxPanels: currentCount, maxRows: g.panels ? new Set<number>(g.panels.map((p: any) => p.rackY)).size : undefined };
        const gridSettings = {
          panelTiltDeg: patch.panelTiltDeg !== undefined ? patch.panelTiltDeg : g.panelTiltDeg,
          rowSpacing: patch.rowSpacing !== undefined ? patch.rowSpacing : g.rowSpacing,
          structureStrategy: patch.structureStrategy ?? g.structureStrategy,
          panelsPerRow: patch.panelsPerRow ?? g.panelsPerRow,
          orientation: patch.orientation ?? g.orientation,
          maxPanels: cap?.maxPanels,
          maxRows: cap?.maxRows,
        };
        // A grid placed by size keeps its panels and expands/contracts to the
        // new settings instead of being re-packed into its old footprint (see
        // respaceFixedGrid). Placed grids used to store their column count
        // as panels-per-row; unless the user is changing it now, that legacy
        // value is read as 1 so row spacing actually spreads the rows.
        if (g.source === 'preset') {
          const cols = new Set((g.panels || []).map((p: any) => Math.round(p.rackX * 1e3))).size;
          const legacyPpr = patch.panelsPerRow === undefined && cols > 1 && g.panelsPerRow === cols;
          const respaced = respaceFixedGrid({ roof, grid: g, gridSettings: { ...gridSettings, panelsPerRow: legacyPpr ? 1 : gridSettings.panelsPerRow }, panelSpec, location });
          return { ...respaced, panelCap: undefined, panelCapCount: undefined };
        }
        const next = generateLayout({ roof, footprintPolygon: g.footprintPolygon, gridSettings, panelSpec, obstacles, location });
        // `source` isn't set by generateLayout itself - carry it over so a
        // later "Generate Layout" run (see regenerateAllGrids) still finds
        // and replaces this grid instead of treating it as untouched and
        // appending a duplicate.
        return { ...next, id: g.id, source: g.source, rotation: g.rotation || 0, panelCap: cap ?? undefined, panelCapCount: cap ? next.panels.length : undefined };
      });
      return { ...roof, grids };
    }));
    setOutputResult(null);
    setCost(null);
  }

  // ---- Adding to a grid ("+" handles, Add -> Panels) ----
  // The panels from `added` (rack coords of `grid`) that can really go in:
  // wholly on the roof's usable area (gridPanelFitsRoof - the same rule as
  // Fill roof and placed grids) and clear of obstacles, both checked where
  // the panel really is (grid rotation included). Force-adding regardless,
  // as add row/column used to, put panels off the roof or into obstacles.
  function fittingAdditions(roof, grid, added) {
    if (!added.length) return [];
    const fits = gridPanelFitsRoof(roof, grid);
    const toWorld = gridRackToWorld(grid, roof);
    return added.filter((p) => {
      if (!fits(p)) return false;
      const w = toWorld({ x: p.rackX, y: p.rackY });
      return !obstacles.some((o) => !o.marker && panelOverlapsObstacle({ ...p, x: w.x, y: w.y }, o));
    });
  }

  // A rack-coords panel's four corners in world plan coords (grid rotation
  // included) - for drawing ghost/slot outlines in both views.
  function panelCornersWorld(roof, grid, p) {
    const toWorld = gridRackToWorld(grid, roof);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => toWorld({ x: p.rackX + (sx * p.w) / 2, y: p.rackY + (sy * p.d) / 2 }));
  }

  // The selected grid's four "+" handles: the middle of each side of its
  // real (rotated) outline, and the world vector one more row/column moves
  // outward - taken from previewGridAdd itself, so a drag snaps exactly to
  // where added rows/columns land.
  function gridSideHandles(roof, grid) {
    const bounds = gridLocalBounds(grid);
    if (!bounds) return [];
    const toWorld = gridRackToWorld(grid, roof);
    const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
    const ys = grid.panels.map((p) => p.rackY), xs = grid.panels.map((p) => p.rackX);
    const sides = [
      { side: 'front', axis: 'row', mid: { x: cx, y: bounds.minY } },
      { side: 'back', axis: 'row', mid: { x: cx, y: bounds.maxY } },
      { side: 'left', axis: 'column', mid: { x: bounds.minX, y: cy } },
      { side: 'right', axis: 'column', mid: { x: bounds.maxX, y: cy } },
    ];
    return sides.map(({ side, axis, mid }) => {
      const next = previewGridAdd(grid, roof, side, 1);
      let delta = { x: 0, y: 0 };
      if (next.length) {
        if (side === 'front') delta = { x: 0, y: next[0].rackY - Math.min(...ys) };
        else if (side === 'back') delta = { x: 0, y: next[0].rackY - Math.max(...ys) };
        else if (side === 'left') delta = { x: Math.min(...next.map((p) => p.rackX)) - Math.min(...xs), y: 0 };
        else delta = { x: Math.max(...next.map((p) => p.rackX)) - Math.max(...xs), y: 0 };
      }
      const a = toWorld(mid), b = toWorld({ x: mid.x + delta.x, y: mid.y + delta.y });
      return { side, axis, mid: a, step: { x: b.x - a.x, y: b.y - a.y } };
    });
  }

  // Adds whichever of `added` fit (fittingAdditions); returns how many.
  function addToGrid(roofId, gridId, added) {
    const roof = roofs.find((r) => r.id === roofId);
    const grid = findGrid(roofId, gridId);
    if (!roof || !grid) return 0;
    const ok = fittingAdditions(roof, grid, added);
    if (ok.length) {
      updateRoofGrids(roofId, (grids) => grids.map((g) => (g.id === gridId ? appendGridPanels(g, roof, ok) : g)));
      setOutputResult(null);
      setCost(null);
    }
    return ok.length;
  }

  // Pointer down on a "+" handle (2D plan or 3D view). `stepPx` is one
  // row/column outward in screen pixels; the drag's projection onto it
  // picks the count. Released without moving = add one.
  function startAddDrag(roofId, gridId, side, clientX, clientY, stepPx, source: '2d' | '3d') {
    cancelActiveModes();
    setRightPanelOpenGroup(null);
    addDragRef.current = { roofId, gridId, side, clientX, clientY, stepPx, source, moved: false, count: 0 };
    setAddDrag({ roofId, gridId, side, count: 0 });
  }

  // Add -> Panels: enter/exit slot picking for one grid.
  function startAddPanels(roofId, gridId) {
    cancelActiveModes();
    setAddPanelsMode({ roofId, gridId });
    setAddPanelsPicks(new Set());
  }
  function exitAddPanels() {
    setAddPanelsMode(null);
    setAddPanelsPicks(new Set());
    addPaintRef.current = null;
  }
  // Slot pick by pointer: pressing on a slot starts a stroke that either
  // picks or un-picks (whichever that first slot needs); dragging across
  // more slots on the 2D plan applies the same to each.
  function paintSlot(key, starting) {
    if (starting) addPaintRef.current = { adding: !addPanelsPicks.has(key) };
    const stroke = addPaintRef.current;
    if (!stroke) return;
    setAddPanelsPicks((prev) => {
      const next = new Set(prev);
      if (stroke.adding) next.add(key); else next.delete(key);
      return next;
    });
  }
  function commitAddPanels() {
    if (!addPanelsMode || addPanelsPicks.size === 0) return;
    const roof = roofs.find((r) => r.id === addPanelsMode.roofId);
    const grid = findGrid(addPanelsMode.roofId, addPanelsMode.gridId);
    if (!roof || !grid) return;
    const picked = gridAddCandidates(grid, roof).filter((c) => addPanelsPicks.has(c.key));
    addToGrid(addPanelsMode.roofId, addPanelsMode.gridId, picked);
    setAddPanelsPicks(new Set());
  }

  // Delete-mode picking (row/column/panel), shared by a panel click on the
  // 2D plan and in the 3D view: row/column pick by the clicked panel,
  // panel mode toggles it with Cmd/Ctrl (`multi`) or replaces the pick.
  function pickPanelForDelete(p, multi) {
    if (gridDeleteMode === 'row') setGridDeleteSelection({ rackY: p.rackY });
    else if (gridDeleteMode === 'column') setGridDeleteSelection({ panelId: p.id });
    else {
      setGridDeleteSelection((prev) => {
        if (!multi) return { panelIds: [p.id] };
        const existing: any[] = prev?.panelIds || [];
        return existing.includes(p.id)
          ? { panelIds: existing.filter((id) => id !== p.id) }
          : { panelIds: [...existing, p.id] };
      });
    }
  }

  // Panel ids currently picked for deletion in `grid` (empty unless it's
  // the grid whose own delete mode is active) - drives the solid-red
  // highlight in both views.
  function deletePickedIdsFor(roofId, grid) {
    const out = new Set<any>();
    if (!gridDeleteMode || !gridDeleteSelection || selectedGrid?.id !== grid.id || gridOwnerRoof?.id !== roofId) return out;
    if (gridDeleteMode === 'row') grid.panels.forEach((p) => { if (p.rackY === gridDeleteSelection.rackY) out.add(p.id); });
    else if (gridDeleteMode === 'column' && gridDeleteSelection.panelId != null) columnIndexMatch(grid, gridDeleteSelection.panelId).matches.forEach((p) => out.add(p.id));
    else (gridDeleteSelection.panelIds || []).forEach((id) => out.add(id));
    return out;
  }

  // Align-to-edge pick (Azimuth popover), shared by both views.
  function pickAlignEdge(roofId, edgeIndex) {
    const roof = roofs.find((r) => r.id === roofId);
    if (roof) {
      const picked = edgeAlignedAzimuth(getRoofPolygon(roof), edgeIndex, location);
      if (picked != null) updateRoof(roofId, 'azimuth', picked);
    }
    setAlignEdgeRoofId(null);
    setHoveredAlignEdge(null);
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

  // Delete/Backspace removes whatever is selected, in either view: a
  // pending row/column/panel delete first, then selected grids, then the
  // selected obstacle, then the selected roof (most specific wins - a grid
  // selection usually still has its roof selected underneath it). Only
  // skipped while actually typing (text/number fields, not sliders or
  // checkboxes - focus stays on a range input after dragging it, which
  // used to swallow the key silently) or mid-draw/placement, where the
  // selection isn't what the user is working on.
  useEffect(() => {
    function isTypingTarget(el) {
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (tag !== 'INPUT') return false;
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file'].includes(type);
    }
    function handleKeyDown(e) {
      if (isTypingTarget(document.activeElement)) return;
      if (e.key === 'Escape') {
        if (placingShape === 'copy') { setPlacingShape(null); return; }
        if (addPanelsMode) { exitAddPanels(); return; }
        if (gridDeleteMode) { setGridDeleteMode(null); setGridDeleteSelection(null); }
        return;
      }
      // Enter adds the slots picked in Add -> Panels.
      if (e.key === 'Enter' && addPanelsMode && addPanelsPicks.size > 0) { e.preventDefault(); commitAddPanels(); return; }
      // Cmd/Ctrl+C copies the selected obstacle; Cmd/Ctrl+V drops a copy
      // just beside the original (pasteObstacleNearby). Obstacles only -
      // grids have their own Duplicate, roofs aren't copyable.
      const meta = e.metaKey || e.ctrlKey;
      if (meta && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c') {
        if (selectedObstacleId == null) return;
        e.preventDefault();
        copyObstacle(obstacles.find((o) => o.id === selectedObstacleId));
        return;
      }
      if (meta && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'v') {
        if (!obstacleClipboard || drawingRoof || placingGrid || placingShape) return;
        e.preventDefault();
        pasteObstacleNearby();
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (drawingRoof || placingGrid || placingShape || roofDrawPoints.length > 0 || obstacleDrawPoints.length > 0) return;
      if (gridDeleteSelection) { e.preventDefault(); applyGridDeleteSelection(); return; }
      if (selectedGridKeys.size > 0) { e.preventDefault(); deleteSelectedGrids(); return; }
      if (selectedObstacleId != null) { e.preventDefault(); removeObstacle(selectedObstacleId); return; }
      if (selectedRoofId != null) { e.preventDefault(); cancelActiveModes(); removeRoof(selectedRoofId); }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGridKeys, selectedObstacleId, selectedRoofId, addPanelsMode, addPanelsPicks, roofs, gridDeleteMode, gridDeleteSelection, drawingRoof, placingGrid, placingShape, roofDrawPoints, obstacleDrawPoints, obstacles, obstacleClipboard]);
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

  // How far a string's cold-weather Voc is allowed to push past the
  // inverter's rated MPPT voltage window (100% = never exceed it), while
  // still never exceeding the inverter's absolute max DC voltage rating -
  // see stringSizing.js's maxModulesPerString. 120% matches common
  // installer practice of allowing some MPPT headroom to size longer
  // strings.
  const [mpptVoltageUtilizationPct, setMpptVoltageUtilizationPct] = useState(initialDesignData?.mpptVoltageUtilizationPct ?? 120);

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
  // Output estimate's drill-down: null shows the 12 monthly bars, a month
  // index (0-11) shows that month's typical-day hourly profile instead.
  // Both come from the one full-year computeOutput pass in handleCalculate.
  const [outputDrillMonth, setOutputDrillMonth] = useState<number | null>(null);
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
  // time at a time (see README's "View layout" entry). Ticks in small
  // (3.75-minute) steps rather than the slider's old fixed 30-minute jump,
  // at a faster cadence, so the sun/shadows/panel glint (see Panel's own
  // meshPhysicalMaterial) sweep smoothly instead of visibly snapping frame
  // to frame - same 14-hour full sweep in the same ~11.2s either way (16
  // ticks/hour * 50ms = 800ms/hour), just far more steps along the way.
  useEffect(() => {
    if (!sunPlaying) return;
    const id = setInterval(() => {
      setSelectedHour((h) => (h >= 19 ? 5 : h + 0.0625));
    }, 50);
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
  const combinedExtent = ((movingRoof || movingObstacle) && frozenExtentRef.current != null) ? frozenExtentRef.current : liveCombinedExtent;
  const halfExtent = combinedExtent / 2 + 8;
  const scale = (520 / (halfExtent * 2)) * planZoom;
  const centerX = planViewBoxWidth / 2;
  const centerY = PLAN_VIEWBOX_HEIGHT / 2;
  const toScreen = (x, y) => ({ sx: centerX + panOffset.x + x * scale, sy: centerY + panOffset.y - y * scale });

  // Where scrolling to zoom should actually zoom *toward* - the average of
  // every roof vertex and every obstacle's own position, in world (site-
  // local-meters) coordinates. Plain world (0,0) (the confirmed site pin)
  // used to be the implicit zoom pivot instead (see onPlanWheel below), but
  // that's rarely where the roofs/obstacles actually end up once a real
  // site's traced - zooming in "at the pin" then just as often zooms into
  // blank ground nearby as it does the roof itself. Falls back to the
  // origin once nothing's been placed yet (nothing else to zoom toward).
  const contentCentroid = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    roofPolygons.forEach((rp) => rp.polygon.forEach((p) => pts.push(p)));
    obstacles.forEach((o) => pts.push({ x: o.x, y: o.y }));
    if (pts.length === 0) return { x: 0, y: 0 };
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
  }, [roofPolygons, obstacles]);

  // What scroll-zoom should home in on when something's selected - the
  // selected obstacle's position, the selected roof's centroid, or the
  // selected grid(s)' combined pivot - in world plan coords, plus a rough
  // height (`h`) for the 3D view's camera target. null with no selection
  // (zoom then follows the cursor instead - see onPlanWheel).
  const selectionFocus = useMemo(() => {
    const roofAt = (pt) => roofs.find((r) => pointInPolygon(pt, getRoofPolygon(r)));
    if (selectedObstacleId != null) {
      const o = obstacles.find((ob) => ob.id === selectedObstacleId);
      if (o) {
        const r = roofAt({ x: o.x, y: o.y });
        return { x: o.x, y: o.y, h: (r?.buildingHeight ?? 0) + (o.height || 0) / 2 };
      }
    }
    if (selectedGridKeys.size > 0) {
      const pts: any[] = [];
      let h = 0;
      selectedGridKeys.forEach((k) => {
        const { roofId, gridId } = parseGridKey(k);
        const g = findGrid(roofId, gridId);
        const r = roofs.find((rr) => rr.id === roofId);
        if (g) { pts.push(gridPivot(g)); h = Math.max(h, (r?.buildingHeight ?? 0) + 0.5); }
      });
      if (pts.length) return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length, h };
    }
    if (selectedRoofId != null) {
      const r = roofs.find((rr) => rr.id === selectedRoofId);
      if (r) {
        const poly = getRoofPolygon(r);
        return { x: poly.reduce((a, p) => a + p.x, 0) / poly.length, y: poly.reduce((a, p) => a + p.y, 0) / poly.length, h: r.buildingHeight || 0 };
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObstacleId, selectedGridKeys, selectedRoofId, obstacles, roofs]);

  // Adjusts panOffset so that whichever world point stays fixed on screen
  // across a zoom change is `anchor` (contentCentroid, normally) rather
  // than world (0,0) - i.e. solves toScreen(anchor) at the old zoom ==
  // toScreen(anchor) at the new one for panOffset. Same shape both axes
  // bar the sign flip toScreen's own sy already has (screen y grows
  // downward, world y grows up).
  function panOffsetZoomingToward(anchor, offset, prevZoom, nextZoom) {
    const baseScale = 520 / (halfExtent * 2);
    const ds = baseScale * nextZoom - baseScale * prevZoom;
    return { x: offset.x - anchor.x * ds, y: offset.y + anchor.y * ds };
  }

  function onPlanWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const nextZoom = Math.min(6, Math.max(minPlanZoom, planZoom * factor));
    setPlanZoom(nextZoom);
    // Zooms around the current selection when there is one (selectionFocus),
    // otherwise around the point under the cursor (the usual map/design-tool
    // behavior), keeping that point fixed on screen. Zooming *in* on a selection also eases it a quarter
    // of the way toward the view's center each step, so a few scrolls bring
    // you to it instead of it sliding off toward an edge. The result is
    // re-clamped either way - zooming out shrinks the backdrop image toward
    // the view's center too.
    const { worldX, worldY } = clientToWorld(e.clientX, e.clientY);
    const anchor = selectionFocus ?? { x: worldX, y: worldY };
    let next = panOffsetZoomingToward(anchor, panOffset, planZoom, nextZoom);
    if (selectionFocus && nextZoom > planZoom) {
      const nextScale = (520 / (halfExtent * 2)) * nextZoom;
      const sx = centerX + next.x + anchor.x * nextScale;
      const sy = centerY + next.y - anchor.y * nextScale;
      next = { x: next.x + (centerX - sx) * 0.25, y: next.y + (centerY - sy) * 0.25 };
    }
    setPanOffset(clampPanOffsetForZoom(next, nextZoom));
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
  // widest the view can get - checked against the *wider* of the viewBox's
  // two dimensions (planViewBoxWidth vs. PLAN_VIEWBOX_HEIGHT), since on a
  // wide screen the width is the one that needs the most image to cover it.
  // Deliberately not capped at 1x (an earlier version was, on the
  // assumption the backdrop could never need *more* than the roof's own
  // default fit to cover the view) - on a wide enough screen the viewBox
  // itself can need more span than the image has even at the roof's
  // default fit, and this floor is the only thing that forces the extra
  // zoom-in that then requires (see the effect just below, which keeps
  // planZoom itself in sync with a floor that can rise past 1 like this).
  let minPlanZoom = 0.3;
  if (backdropPlacement) {
    const baseScale = 520 / (halfExtent * 2);
    const viewSpanAt1x = Math.max(planViewBoxWidth, PLAN_VIEWBOX_HEIGHT) / baseScale;
    const imageSpan = Math.min(backdropPlacement.widthMeters, backdropPlacement.heightMeters);
    minPlanZoom = Math.max(0.3, viewSpanAt1x / imageSpan);
  }

  // Panning itself has no inherent bounds (see the Reset view button's own
  // comment above) - clamp it here to keep the backdrop image covering the
  // full viewBox, the same goal minPlanZoom serves for zoom alone. Takes an
  // explicit zoom (rather than reading planZoom directly) so onPlanWheel can
  // clamp against the zoom level it's about to commit to, not the one about
  // to be replaced. A no-op once there's no backdrop image, or - same as
  // minPlanZoom's own floor - once even a centered image can't fully cover
  // the viewBox at this zoom (maxOffset clamps to 0 rather than letting the
  // offset drift either way). Bounded separately per axis (against
  // centerX/centerY, not a single shared center) since the viewBox is only
  // square by coincidence now - see planViewBoxWidth's own comment.
  function clampPanOffsetForZoom(offset, zoom) {
    if (!backdropPlacement) return offset;
    const baseScale = 520 / (halfExtent * 2);
    const halfImgPx = (backdropPlacement.widthMeters / 2) * baseScale * zoom;
    const maxOffsetX = Math.max(0, halfImgPx - centerX);
    const maxOffsetY = Math.max(0, halfImgPx - centerY);
    return {
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, offset.x)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, offset.y)),
    };
  }

  // minPlanZoom can rise above the state's own starting value of 1 on a
  // wide-enough screen (see its own comment) - but nothing else pushes
  // `planZoom` itself up to meet a rising floor except a live wheel event,
  // so a plain page load (or a window resize that widens planViewBoxWidth)
  // would otherwise sit below the floor indefinitely, still showing the
  // gap this whole floor exists to prevent. Keep planZoom in sync with it
  // directly instead of waiting for the first scroll.
  useEffect(() => {
    if (planZoom < minPlanZoom) {
      setPanOffset((p) => clampPanOffsetForZoom(panOffsetZoomingToward(contentCentroid, p, planZoom, minPlanZoom), minPlanZoom));
      setPlanZoom(minPlanZoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minPlanZoom]);

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

  // Which panels (per grid, keyed by gridKey) sit on top of an obstacle
  // right now - see panelOverlapsObstacle's own comment (below, hoisted) for
  // the overlap test itself. Drives the red highlight on the 2D plan below,
  // so an overlap that shows up after an obstacle's own creation (moved
  // grid, resized/moved obstacle) is still visible at a glance, not just
  // the one-time prompt/manual button at creation (see
  // promptOverlapRemovalIfNeeded/removeOverlappingPanels).
  const overlappingPanelIdsByGrid = useMemo(() => {
    const m: Record<string, Set<any>> = {};
    roofs.forEach((roof) => {
      roof.grids.forEach((grid) => {
        const ids = new Set<any>();
        grid.panels.forEach((panel) => {
          if (obstacles.some((o) => !o.marker && panelOverlapsObstacle(panel, o))) ids.add(panel.id);
        });
        m[gridKey(roof.id, grid.id)] = ids;
      });
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roofs, obstacles]);

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
  // 'year' mode Output estimate itself uses) as a % of whichever
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

  // Reuses Shadow analysis's own gradient (sunExposureColor, defined further
  // down - function declarations hoist, so the forward reference is fine)
  // rather than a separate green-to-red hue sweep, so the two heatmaps read
  // as the same visual language: blue (worst) through to red (best) either
  // way, instead of each toggle needing its own color key.
  function efficiencyColor(pct) {
    return sunExposureColor(pct);
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
      const azimuth = packingAzimuth(roof, location);
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
    exitAddPanels();
    setGridDeleteMode(null);
    setGridDeleteSelection(null);
    setRightPanelOpenGroup(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGrid?.id, selectedRoofId, selectedObstacleId]);

  // Add -> Panels only lives while its popover is open.
  useEffect(() => {
    if (addPanelsMode && rightPanelOpenGroup !== 'gridAdd') exitAddPanels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightPanelOpenGroup]);

  // A slot-picking stroke ends wherever the pointer is released.
  useEffect(() => {
    const end = () => { addPaintRef.current = null; };
    document.addEventListener('pointerup', end);
    return () => document.removeEventListener('pointerup', end);
  }, []);

  // "+" handle drag, tracked across the whole page (the pointer leaves the
  // handle at once). The count is the drag's projection onto one step
  // outward; release adds that many rows/columns (one if it never moved,
  // none if dragged back in).
  useEffect(() => {
    if (!addDrag) return;
    function onMove(e) {
      const d = addDragRef.current;
      if (!d) return;
      const dx = e.clientX - d.clientX, dy = e.clientY - d.clientY;
      if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
      if (!d.moved) return;
      const len2 = d.stepPx.x * d.stepPx.x + d.stepPx.y * d.stepPx.y;
      const count = len2 > 1 ? Math.max(0, Math.min(40, Math.round((dx * d.stepPx.x + dy * d.stepPx.y) / len2))) : 0;
      if (count !== d.count) {
        d.count = count;
        setAddDrag((st) => (st ? { ...st, count } : st));
      }
    }
    function onUp() {
      const d = addDragRef.current;
      addDragRef.current = null;
      setAddDrag(null);
      if (!d) return;
      // The 2D plan's own click handler would otherwise treat the release
      // as a background click and deselect the grid.
      if (d.source === '2d') swallowClickAfterDragRef.current = true;
      const count = d.moved ? d.count : 1;
      if (count <= 0) return;
      const roof = roofs.find((r) => r.id === d.roofId);
      const grid = findGrid(d.roofId, d.gridId);
      if (roof && grid) addToGrid(d.roofId, d.gridId, previewGridAdd(grid, roof, d.side, count));
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addDrag, roofs, obstacles]);

  // Live ghost of what the current "+" drag would add: green = will be
  // added, red = skipped (off the roof's usable area or into an obstacle).
  const addDragPreview = useMemo(() => {
    if (!addDrag || !addDrag.count) return null;
    const roof = roofs.find((r) => r.id === addDrag.roofId);
    const grid = findGrid(addDrag.roofId, addDrag.gridId);
    if (!roof || !grid) return null;
    const added = previewGridAdd(grid, roof, addDrag.side, addDrag.count);
    const okSet = new Set(fittingAdditions(roof, grid, added));
    const word = addDrag.side === 'front' || addDrag.side === 'back' ? 'row' : 'column';
    const skipped = added.length - okSet.size;
    return {
      side: addDrag.side,
      ghosts: added.map((p) => ({ key: String(p.id), ok: okSet.has(p), corners: panelCornersWorld(roof, grid, p) })),
      label: `+${addDrag.count} ${word}${addDrag.count === 1 ? '' : 's'} · ${okSet.size} panel${okSet.size === 1 ? '' : 's'}${skipped ? ` (${skipped} won't fit)` : ''}`,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addDrag, roofs, obstacles]);

  // Add -> Panels: every free slot next to the grid that would fit.
  const addPanelSlots = useMemo(() => {
    if (!addPanelsMode) return [];
    const roof = roofs.find((r) => r.id === addPanelsMode.roofId);
    const grid = findGrid(addPanelsMode.roofId, addPanelsMode.gridId);
    if (!roof || !grid) return [];
    return fittingAdditions(roof, grid, gridAddCandidates(grid, roof)).map((c) => ({ key: c.key, corners: panelCornersWorld(roof, grid, c) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addPanelsMode, roofs, obstacles]);

  // The selected grid's "+" handles - only while nothing else is being done
  // to it (delete/add-panels picking, moving, rotating, placing a grid).
  const selectedGridHandles = (currentStep === 4 && selectedGrid && gridOwnerRoof && !gridDeleteMode && !addPanelsMode
    && !placingGrid && !movingGrids && !rotatingGrids && rightPanelOpenGroup !== 'gridRotate')
    ? gridSideHandles(gridOwnerRoof, selectedGrid) : [];

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
      mpptVoltageUtilizationPct,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roofs, panelSpec, inverterChoice, designTemp, targetDcAcRatio, mpptVoltageUtilizationPct]);
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
        mpptVoltageUtilizationPct,
      });
      if (!trial.valid || trial.inverters.length > sitePlan.inverters.length) continue;
      const suggestedUtilization = totalCapacityKW / (trial.inverters.length * candidate.acPowerKw);
      if (suggestedUtilization - currentUtilization >= 0.1) {
        return { ...candidate, numInverters: trial.inverters.length, currentUtilization, suggestedUtilization };
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitePlan, panelSpec, inverterChoice, designTemp, targetDcAcRatio, mpptVoltageUtilizationPct, totalCapacityKW]);
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

  // A copy of `src` centred on (x, y): new id, drawn outline moved along
  // with it, every other setting (size, rotation, canopy, height,
  // boundary...) kept. Selected afterwards, with the same "overlaps
  // panels?" prompt a freshly placed obstacle gets.
  function pasteObstacle(src, x, y) {
    if (!src) return;
    const dx = x - src.x, dy = y - src.y;
    const id = Date.now();
    const copy = {
      ...src,
      id,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      ...(src.polygon ? { polygon: src.polygon.map((p) => ({ x: Number((p.x + dx).toFixed(3)), y: Number((p.y + dy).toFixed(3)) })) } : {}),
    };
    setObstacles((obs) => [...obs, copy]);
    selectObstacle(id);
    setOutputResult(null);
    setCost(null);
    promptOverlapRemovalIfNeeded(copy);
  }

  // Keyboard paste: drop the copy just east of the source, one obstacle-
  // width (plus a gap) further for each repeated paste so they don't stack.
  function pasteObstacleNearby() {
    const src = obstacleClipboard;
    if (!src) return;
    const size = src.shape === 'box' ? Math.max(src.width || 0, src.depth || 0)
      : src.shape === 'polygon' && src.polygon ? (Math.max(...src.polygon.map((p) => p.x)) - Math.min(...src.polygon.map((p) => p.x)))
      : 2 * (src.radius || 0.5);
    pasteCountRef.current += 1;
    pasteObstacle(src, src.x + pasteCountRef.current * (size + 0.5), src.y);
  }

  function copyObstacle(o) {
    if (!o) return;
    setObstacleClipboard(JSON.parse(JSON.stringify(o)));
    pasteCountRef.current = 0;
  }

  function addObstacle(kind, x, y) {
    if (kind === 'copy') {
      pasteObstacle(obstacleClipboard, x, y);
      setPlacingShape(null);
      return;
    }
    const preset = OBSTACLE_PRESETS[kind];
    const extra = kind === 'tree' ? { canopy: TREE_CANOPIES[Math.floor(Math.random() * TREE_CANOPIES.length)] } : {};
    const id = Date.now();
    const obstacle = { id, ...preset, ...extra, x, y };
    setObstacles((obs) => [...obs, obstacle]);
    setPlacingShape(null);
    selectObstacle(id);
    promptOverlapRemovalIfNeeded(obstacle);
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
    const obstacle = { id, ...preset, polygon: points, x: Number(cx.toFixed(1)), y: Number(cy.toFixed(1)) };
    setObstacles((obs) => [...obs, obstacle]);
    setPlacingShape(null);
    setObstacleDrawPoints([]);
    selectObstacle(id);
    promptOverlapRemovalIfNeeded(obstacle);
  }

  // A rough (unrotated bounding-box) overlap test between an already-placed
  // panel and a freshly-added obstacle - generateLayout's own isBlockedAt
  // (layoutEngine.ts) is the authoritative version of this check, used when
  // packing *new* panel positions, but it's an internal detail of that
  // function; this is just close enough to flag existing panels worth a
  // second look; the +0.3m below mirrors isBlockedAt's own clearance.
  function panelOverlapsObstacle(panel, obstacle) {
    const halfW = panel.w / 2, halfD = panel.d / 2;
    const dx = panel.x - obstacle.x, dy = panel.y - obstacle.y;
    if (obstacle.shape === 'box') {
      return Math.abs(dx) < halfW + obstacle.width / 2 + 0.3 && Math.abs(dy) < halfD + obstacle.depth / 2 + 0.3;
    }
    if (obstacle.shape === 'polygon' && obstacle.polygon) {
      // A drawn obstacle (elevation/skylight/walkway/cutout) can be an
      // arbitrary, non-rectangular shape (a triangle, an L, ...) - testing
      // against its own bounding box (as this used to) flags every panel
      // in that box's corners too, even ones nowhere near the actual
      // shape (very visible on anything but a rectangle). Testing the
      // panel's own center and four corners against the real polygon
      // instead only flags a panel that's actually inside it or has a
      // corner clipping across an edge of it.
      const corners = [
        { x: panel.x, y: panel.y },
        { x: panel.x - halfW, y: panel.y - halfD },
        { x: panel.x + halfW, y: panel.y - halfD },
        { x: panel.x - halfW, y: panel.y + halfD },
        { x: panel.x + halfW, y: panel.y + halfD },
      ];
      return corners.some((c) => pointInPolygon(c, obstacle.polygon));
    }
    // cylinder (tree/tank/vent/chimney-adjacent round obstacles)
    return Math.hypot(dx, dy) < (obstacle.radius || 0.5) + Math.max(halfW, halfD) + 0.3;
  }

  // Every already-placed panel (across every roof) this obstacle now
  // overlaps - a marker (see OBSTACLE_PRESETS' own comment) is reference-
  // only and never blocks placement, so it's excluded same as
  // generateLayout's own check does.
  function findPanelsOverlappingObstacle(obstacle) {
    if (obstacle.marker) return [];
    const hits: { roofId: any; gridId: any; panelId: any }[] = [];
    roofs.forEach((roof) => {
      roof.grids.forEach((grid) => {
        grid.panels.forEach((panel) => {
          if (panelOverlapsObstacle(panel, obstacle)) {
            hits.push({ roofId: roof.id, gridId: grid.id, panelId: panel.id });
          }
        });
      });
    });
    return hits;
  }

  // A placed panel's real plan-view footprint (rotated rectangle) - same
  // angle the 2D plan draws it at (grid rotation + per-panel rotation +
  // the grid's facing; see the panel <g>'s own `rotation` below, which is
  // the screen-space, y-down negation of this), shrunk by `inset` on each
  // side so panels that merely touch don't count as overlapping.
  function panelFootprint(p, grid, roof, inset = 0.02) {
    const gridAz = slopeDirectionAzimuth(gridDirection(grid, roof));
    const a = ((p.rotation || 0) + (grid.rotation || 0) - (gridAz - 180)) * Math.PI / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    const hw = Math.max(0, p.w / 2 - inset), hd = Math.max(0, p.d / 2 - inset);
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => ({
      x: p.x + lx * cos - ly * sin,
      y: p.y + lx * sin + ly * cos,
    }));
  }

  // Per grid (keyed by gridKey), the panels that overlap something they
  // shouldn't: an obstacle (overlappingPanelIdsByGrid - same test as before)
  // or a panel of any *other* grid - e.g. "Fill roof" regenerating the
  // whole-roof grid over a table/drawn grid already on that roof (it only
  // ever replaces its own wholeRoof grid, see regenerateAllGrids). Drives
  // both the light-red on-plan highlight and the Delete popover's
  // "Overlapping" count/removal, so what's highlighted is exactly what that
  // button removes. Every footprint is built once per change and checked
  // with a cheap bounding-box prefilter before the exact SAT test.
  const overlapPanelIdsByGrid = useMemo(() => {
    const all: any[] = [];
    roofs.forEach((r) => r.grids.forEach((g) => {
      const key = gridKey(r.id, g.id);
      resolvedGridPanels(g).forEach((p) => {
        const poly = panelFootprint(p, g, r);
        const xs = poly.map((v) => v.x), ys = poly.map((v) => v.y);
        all.push({ key, id: p.id, poly, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) });
      });
    }));
    const m: Record<string, Set<any>> = {};
    roofs.forEach((r) => r.grids.forEach((g) => {
      const key = gridKey(r.id, g.id);
      m[key] = new Set(overlappingPanelIdsByGrid[key] || []);
    }));
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j];
        if (a.key === b.key) continue;
        if (b.maxX <= a.minX || b.minX >= a.maxX || b.maxY <= a.minY || b.minY >= a.maxY) continue;
        if (convexPolygonsOverlap(a.poly, b.poly)) {
          m[a.key].add(a.id);
          m[b.key].add(b.id);
        }
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roofs, overlappingPanelIdsByGrid]);

  function findOverlappingPanelsInGrid(roofId, gridId) {
    return [...(overlapPanelIdsByGrid[gridKey(roofId, gridId)] || [])];
  }

  // Adding an obstacle never used to touch already-placed panels - they'd
  // only ever get excluded from a spot once the grid was regenerated (e.g.
  // clicking "Fill roof" again), easy to miss and easy to end up with a
  // panel visually sitting on top of a tree/AC unit/chimney just placed.
  // This surfaces the overlap right away and lets the user decide, rather
  // than removing anything silently.
  function promptOverlapRemovalIfNeeded(obstacle) {
    const hits = findPanelsOverlappingObstacle(obstacle);
    if (hits.length > 0) setObstacleOverlapPrompt({ hits });
  }

  function removeOverlappingPanels(hits) {
    const panelIdsByRoofAndGrid = new Map<any, Map<any, any[]>>();
    hits.forEach(({ roofId, gridId, panelId }) => {
      if (!panelIdsByRoofAndGrid.has(roofId)) panelIdsByRoofAndGrid.set(roofId, new Map());
      const byGrid = panelIdsByRoofAndGrid.get(roofId)!;
      if (!byGrid.has(gridId)) byGrid.set(gridId, []);
      byGrid.get(gridId)!.push(panelId);
    });
    panelIdsByRoofAndGrid.forEach((byGrid, roofId) => {
      const roof = roofs.find((r) => r.id === roofId);
      if (!roof) return;
      updateRoofGrids(roofId, (grids) => grids.map((g) => {
        const panelIds = byGrid.get(g.id);
        if (!panelIds) return g;
        return panelIds.reduce((acc, pid) => deleteGridPanel(acc, pid, roof), g);
      }));
    });
    setOutputResult(null);
    setCost(null);
  }

  function updateObstacle(id, field, value) {
    setObstacles((obs) => obs.map((o) => (o.id === id ? { ...o, [field]: value } : o)));
  }

  // Length/Width from a drawn obstacle's Dimensions popover - stretched
  // along/across its own longest edge (longestEdgeFrameAzimuth) with the
  // same resizeRoofPolygon the roof uses, so a rotated rectangle stays a
  // rectangle and vertex order (and so its corner handles) is kept. In
  // that frame the along-edge size is the frame's 'width' axis.
  function resizeObstacle(id, dim, value) {
    setObstacles((obs) => obs.map((o) => {
      if (o.id !== id || !o.polygon) return o;
      const az = longestEdgeFrameAzimuth(o.polygon);
      const polygon = resizeRoofPolygon(o.polygon, az, dim === 'length' ? 'width' : 'length', value);
      const cx = polygon.reduce((a, p) => a + p.x, 0) / polygon.length;
      const cy = polygon.reduce((a, p) => a + p.y, 0) / polygon.length;
      return { ...o, polygon, x: Number(cx.toFixed(1)), y: Number(cy.toFixed(1)) };
    }));
    setOutputResult(null);
    setCost(null);
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
  const ROOF_FIELDS_NEEDING_REPACK = new Set(['width', 'length', 'type', 'pitchDeg', 'slopeDirection', 'edgeMargin', 'azimuth']);

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
    // A manual azimuth override (roof.azimuth - see getRoofAzimuth) was set
    // against the roof's old type/slope facing; drop it so the Azimuth
    // control falls back to auto for the new one instead of going stale.
    const resetsAzimuth = field === 'type' || field === 'slopeDirection';
    setRoofs((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value, ...(needsRepack ? { grids: [] } : {}), ...(resetsAzimuth ? { azimuth: null } : {}) } : r)));
    if (needsRepack) {
      setSelectedGridKeys((keys) => new Set([...keys].filter((k) => parseGridKey(k).roofId !== id)));
    }
    setOutputResult(null);
    setCost(null);
  }

  // Width/length from the Dimensions popover. A template rectangle (no
  // polygon) just updates its own width/length fields; a drawn roof is
  // stretched along its own sides instead (resizeRoofPolygon), since its
  // shape lives entirely in `polygon`. Both go through the same repack
  // path as any other footprint change ('width'/'length' are in
  // ROOF_FIELDS_NEEDING_REPACK).
  function resizeRoof(id, axis, value) {
    const roof = roofs.find((r) => r.id === id);
    if (!roof) return;
    if (!roof.polygon) {
      updateRoof(id, axis, value);
      return;
    }
    const polygon = resizeRoofPolygon(roof.polygon, autoRoofAzimuth(roof, location), axis, value);
    setRoofs((rs) => rs.map((r) => (r.id === id ? { ...r, polygon, grids: [] } : r)));
    setSelectedGridKeys((keys) => new Set([...keys].filter((k) => parseGridKey(k).roofId !== id)));
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

    let mirroredSlopeDirection = roof.slopeDirection || 'S';
    if (roof.type === 'pitched' && mirroredSlopeDirection) {
      const OPPOSITE_SLOPE: Record<string, string> = { N: 'S', S: 'N', E: 'W', W: 'E' };
      mirroredSlopeDirection = OPPOSITE_SLOPE[mirroredSlopeDirection] || 'N';
    }

    const baseLabel = (roof.label || roofLabel(roof, idx)).replace(/-(left|right)$/, '');
    const original = { ...roof, polygon: poly, label: `${baseLabel}-left` };
    const mirroredRoofBase = {
      ...roof,
      id: Date.now(),
      polygon: mirroredPolygon,
      slopeDirection: mirroredSlopeDirection,
      // The source roof's azimuth override (if any) doesn't apply to its
      // reflection - fall back to auto for the new roof's own facing.
      azimuth: null,
      label: `${baseLabel}-right`,
      grids: [],
    };
    // Regenerate the mirrored roof's own grid(s) against its own (reflected)
    // footprint, carrying over each source grid's own tilt/row-spacing/
    // structure/panels-per-row/orientation settings exactly - a one-time
    // copy, not a live link, same as every other field mirrorRoof duplicates.
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

  function cancelActiveModes() {
    setDrawingRoof(false);
    setRoofDrawPoints([]);
    setPlacingShape(null);
    setObstacleDrawPoints([]);
    setObstaclePickerOpen(false);
    setPlacingGrid(false);
    setGridDrawPoints([]);
    setGridPlacementError(null);
    setMirrorRoofId(null);
    setHoveredMirrorEdge(null);
    setMarginEditRoofId(null);
    setSelectedMarginEdges(new Set());
    setAlignEdgeRoofId(null);
    setHoveredAlignEdge(null);
    setHoveredOverrideEdge(null);
    setFillPickerOpen(false);
    setTablePickSize(null);
    setHoveredPickRoofId(null);
    setAddPanelsMode(null);
    setAddPanelsPicks(new Set());
    setGridDeleteMode(null);
    setGridDeleteSelection(null);
  }

  // Tracing a shape point by point (roof outline, a drawn obstacle, a
  // custom panel area) only works on the 2D plan - clicking points onto a
  // perspective 3D view while orbit controls also react to the mouse is
  // error-prone. Starting one of those tools from the 3D view switches to
  // the plan instead of leaving clicks that silently do nothing, with a
  // brief banner saying why.
  function switchToPlanFor(message) {
    if (viewMode !== '3d') return;
    setViewMode('plan');
    setViewNotice(message);
    clearTimeout(viewNoticeTimerRef.current);
    viewNoticeTimerRef.current = setTimeout(() => setViewNotice(null), 3500);
  }

  function startRoofDraw() {
    resetClickSuppression();
    cancelActiveModes();
    switchToPlanFor('Switched to the 2D plan to draw the roof outline.');
    setDrawingRoof(true);
  }

  function cancelRoofDraw() {
    setDrawingRoof(false);
    setRoofDrawPoints([]);
  }

  function finishRoofDraw(points) {
    if (points.length < 3) return;
    const id = Date.now();
    const finalPoints = points;
    setRoofs((rs) => [...rs, { ...ROOF_DEFAULTS, id, polygon: finalPoints, grids: [] }]);
    selectRoof(id);
    setDrawingRoof(false);
    setRoofDrawPoints([]);
    setOutputResult(null);
    setCost(null);
  }

  // Fetches a just-built Static Maps capture's own bytes (the browser
  // already has a live, working URL for it - see handleLocationConfirm)
  // and hands them to onCaptureSiteImage so the backend can upload them to
  // S3 without ever calling the Maps Static API itself (see its own prop
  // comment in types.ts). Best-effort and fire-and-forget, same as the
  // backend's own site-image capture always was: a failure here (offline,
  // upload endpoint down, no onCaptureSiteImage at all) just leaves that
  // entry riding on its live Google url, same as before this existed - the
  // backend's own fallback capture on next save still has a chance to
  // pick it up.
  function captureSiteImageToS3(imageKey, capture) {
    if (!onCaptureSiteImage || !capture) return;
    (async () => {
      try {
        const resp = await fetch(capture.url);
        if (!resp.ok) return;
        const blob = await resp.blob();
        const { s3Key } = await onCaptureSiteImage(blob, blob.type || 'image/png');
        // Only apply if this is still the entry it was captured for - the
        // user may have confirmed a different location (or re-confirmed
        // the same one, rebuilding a fresh capture object) while this was
        // in flight, which already replaced siteImages[imageKey] with
        // something this s3Key doesn't belong to.
        setSiteImages((prev) => {
          const current = prev?.[imageKey];
          if (!current || current.url !== capture.url || current.s3Key) return prev;
          return { ...prev, [imageKey]: { ...current, s3Key } };
        });
      } catch {
        // Best-effort - see this function's own comment.
      }
    })();
  }

  function handleLocationConfirm({ lat, lon }) {
    // "Next: Configuration" calls this every time it's clicked, including
    // when the user has already confirmed this exact location and just
    // navigated back to step 1 - only redo the heavy side effects (wiping
    // roofs, refetching site data) when the location is actually new.
    // Compares against the *last confirmed* location, not `location` itself
    // - the caller always passes the current `location` state, so comparing
    // against that directly would be tautologically true and this guard
    // would never fire once locationConfirmed was set (a real bug this
    // replaced: it silently skipped the reset/re-capture below on every
    // repeat confirm, "new" location or not).
    const last = lastConfirmedLocationRef.current;
    if (last && lat === last.lat && lon === last.lon) return;
    const isChangeFromPriorConfirm = last !== null;
    setLocation((loc) => ({ ...loc, lat, lon }));
    // Any existing roofs/obstacles/imagery were captured relative to the
    // old location — moving the site invalidates them, so clear both
    // rather than leave outlines (or an obstacle's x/y, which are plain
    // roof-relative coordinates, not tied to any roof id) silently
    // pointing at the wrong place on the new backdrop.
    const locationImage = GOOGLE_MAPS_API_KEY ? buildLocationPreviewImage({ apiKey: GOOGLE_MAPS_API_KEY, lat, lon }) : null;
    const locationImageWide = GOOGLE_MAPS_API_KEY ? buildWideLocationPreviewImage({ apiKey: GOOGLE_MAPS_API_KEY, lat, lon }) : null;
    setSiteImages({ locationImage, locationImageWide });
    captureSiteImageToS3('locationImage', locationImage);
    captureSiteImageToS3('locationImageWide', locationImageWide);
    setRoofs([]);
    setObstacles([]);
    setSelectedRoofId(null);
    setSelectedObstacleId(null);
    setSelectedGridKeys(new Set());
    setOutputResult(null);
    setCost(null);
    // A genuine location change invalidates everything built on the old
    // site (roofs cleared above), so later steps are no longer "reached" -
    // unlike every other edit in this wizard, which never re-locks a step
    // once visited (see maxUnlockedStep's own comment). The very first
    // confirm (isChangeFromPriorConfirm false) has nothing to re-lock yet.
    if (isChangeFromPriorConfirm) setMaxUnlockedStep(2);
    lastConfirmedLocationRef.current = { lat, lon };
    // Location's confirmed — the (still empty) 2D plan is now backed by
    // the real imagery just captured, ready for when the user reaches a
    // step that actually shows it (Roof setup, step 3 - see the CENTER
    // block's own condition); steps 1/2 never display it, so this doesn't
    // change what's on screen yet. Stays on step 1 - the user reviews
    // Configuration (step 2) next, then explicitly moves on to Roof setup
    // themselves; see the "Next: Configuration" / "Next: Roof setup"
    // buttons below.
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

  // Whether confirming the current `location` state right now would throw
  // away work the user would actually miss - gates the "are you sure?"
  // dialog below. A location edit before any of this exists (or before
  // Configuration's even been reached) just proceeds silently.
  function hasProgressWorthConfirming() {
    return roofs.length > 0 || totalPanelCount > 0 || !!outputResult || !!cost || maxUnlockedStep > 2;
  }

  // "Next: Configuration"'s own click handler - step 1's only entry point
  // into handleLocationConfirm. Interposes the confirm dialog when this
  // would actually be a destructive change; a first-time confirm, or a
  // repeat click that doesn't change the location, goes straight through.
  function requestLocationConfirm() {
    const candidate = { lat: location.lat, lon: location.lon };
    const last = lastConfirmedLocationRef.current;
    const isRealChange = !last || candidate.lat !== last.lat || candidate.lon !== last.lon;
    if (isRealChange && hasProgressWorthConfirming()) {
      setPendingLocationChange(candidate);
      return;
    }
    handleLocationConfirm(candidate);
    advanceToStep(2);
  }

  // The svg's container isn't square, but its viewBox is — with
  // preserveAspectRatio="xMidYMid meet" the content is scaled to fit the
  // limiting dimension and letterboxed (centered) along the other axis in
  // general - but planViewBoxWidth keeps the viewBox itself matched to the
  // svg's own on-screen aspect ratio (see its own comment), so in practice
  // there's no letterbox to correct for here. Kept general (rather than
  // assuming offsetX/offsetY are always 0) since the ResizeObserver that
  // updates planViewBoxWidth runs one tick behind an actual resize.
  function svgContentScale() {
    const rect = svgRef.current.getBoundingClientRect();
    return Math.min(rect.width / planViewBoxWidth, rect.height / PLAN_VIEWBOX_HEIGHT);
  }

  function clientToWorld(clientX, clientY) {
    const rect = svgRef.current.getBoundingClientRect();
    const contentScale = svgContentScale();
    const offsetX = (rect.width - planViewBoxWidth * contentScale) / 2;
    const offsetY = (rect.height - PLAN_VIEWBOX_HEIGHT * contentScale) / 2;
    const sx = (clientX - rect.left - offsetX) / contentScale;
    const sy = (clientY - rect.top - offsetY) / contentScale;
    return { sx, sy, worldX: (sx - centerX - panOffset.x) / scale, worldY: (centerY + panOffset.y - sy) / scale };
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

  // Feeds drawCursorWorld while any point-by-point draw tool is active (see
  // its own comment) - one combined handler for the svg's onMouseMove since
  // only one can run at a time and both need the pointer's world position.
  function onSvgDrawMouseMove(e) {
    onSunHeatmapMouseMove(e);
    const drawingObstacle = placingShape && OBSTACLE_PRESETS[placingShape]?.drawable;
    if (!drawingRoof && !drawingObstacle && !placingGrid && placingShape !== 'copy') {
      if (drawCursorWorld) setDrawCursorWorld(null);
      return;
    }
    const { worldX, worldY } = clientToWorld(e.clientX, e.clientY);
    setDrawCursorWorld({ x: worldX, y: worldY });
  }

  // A plain click on the plan starts a potential pan (see the mousemove/up
  // handlers below) rather than acting immediately — onSvgClick checks
  // whether the mouseup that follows actually moved the view, and only
  // then treats it as a pan instead of a click.
  function onSvgMouseDown(e) {
    if (drawingRoof || placingShape || placingGrid || draggingVertexIndex !== null || draggingEdgeIndex !== null || draggingObstacleVertex !== null) return;

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
      setPanOffset(clampPanOffsetForZoom(
        { x: start.offsetX + dx / contentScale, y: start.offsetY + dy / contentScale },
        planZoom
      ));
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

    if (alignEdgeRoofId) {
      setAlignEdgeRoofId(null);
      setHoveredAlignEdge(null);
      return;
    }

    if (addPanelsMode) {
      exitAddPanels();
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
  // Grid selection from the 3D view (Scene3D's onSelectGrid) - same result
  // as a plain/shift click on the 2D plan's panels (see startGridDrag
  // below), minus the drag/box-select, which 3D doesn't do. null clears.
  function selectGridFrom3D(roofId, gridId, additive) {
    if (roofId == null) { setSelectedGridKeys(new Set()); return; }
    const key = gridKey(roofId, gridId);
    setSelectedRoofId(null);
    setSelectedObstacleId(null);
    setSelectedGridKeys((prev) => {
      if (!additive) return new Set([key]);
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

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
        updateRoofGrids(o.roofId, (grids) => grids.map((g) => {
          if (g.id !== o.gridId) return g;
          const direction = gridDirection(g, roof);
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
        const gridById = new Map(start.grids.map((g) => [g.id, g]) as [any, any][]);
        const grids = r.grids.map((g) => {
          const origin: any = gridById.get(g.id);
          if (!origin) return g;
          const direction = gridDirection(g, r);
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

  // Starts dragging one obstacle. Unlike a roof (which must be selected
  // first, since its body is also the box-select surface for its grids),
  // an obstacle is small and has nothing else on it to drag, so press-and-
  // drag on any obstacle selects it and moves it in one gesture; a plain
  // click (no movement past the threshold) still just selects it via its
  // own onClick. Off while drawing/placing anything, where a mousedown
  // belongs to that tool.
  function startObstacleDrag(e, obstacleId) {
    if (drawingRoof || placingShape || placingGrid || e.button !== 0) return;
    const o = obstacles.find((ob) => ob.id === obstacleId);
    if (!o) return;
    e.stopPropagation();
    obstacleMoveRef.current = {
      clientX: e.clientX, clientY: e.clientY, moved: false,
      id: o.id, x: o.x, y: o.y, polygon: o.polygon ? o.polygon.map((p) => ({ ...p })) : null,
    };
    suspendHistoryRef.current = true;
    frozenExtentRef.current = liveCombinedExtent;
    setMovingObstacle(true);
  }

  useEffect(() => {
    if (!movingObstacle) return;

    function handleMouseMove(e) {
      const start = obstacleMoveRef.current;
      if (!start) return;
      if (!start.moved && Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) > 3) {
        start.moved = true;
        selectObstacle(start.id);
      }
      if (!start.moved) return;
      const { worldX: curX, worldY: curY } = clientToWorld(e.clientX, e.clientY);
      const { worldX: startX, worldY: startY } = clientToWorld(start.clientX, start.clientY);
      const dx = curX - startX, dy = curY - startY;
      setObstacles((obs) => obs.map((o) => (o.id !== start.id ? o : {
        ...o,
        x: Number((start.x + dx).toFixed(2)),
        y: Number((start.y + dy).toFixed(2)),
        polygon: start.polygon ? start.polygon.map((p) => ({ x: Number((p.x + dx).toFixed(2)), y: Number((p.y + dy).toFixed(2)) })) : o.polygon,
      })));
    }

    function handleMouseUp() {
      const start = obstacleMoveRef.current;
      if (start?.moved) {
        swallowClickAfterDragRef.current = true;
        // Moving an obstacle changes which panels it shades/overlaps, so
        // any computed output/cost is stale - same as editing it.
        setOutputResult(null);
        setCost(null);
      }
      obstacleMoveRef.current = null;
      frozenExtentRef.current = null;
      setMovingObstacle(false);
      suspendHistoryRef.current = false;
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movingObstacle]);

  // Which obstacles have a meaningful orientation: boxes (AC unit, chimney)
  // via their own `rotation`, and drawn shapes (walkway, skylight,
  // elevation, cutout) by turning their outline. Round ones (tanks, vents,
  // trees...) look the same at any angle, so they get no Rotate control.
  function isRotatableObstacle(o) {
    return !!o && (o.shape === 'box' || (o.shape === 'polygon' && o.polygon?.length >= 3));
  }

  // World-space pivot + the four corners the rotate handles sit on: a box's
  // own rotated rectangle, or a drawn shape's oriented bounding box along
  // its longest edge (the same frame its Length/Width use).
  function obstacleRotateFrame(o) {
    if (o.shape === 'box') {
      const a = (o.rotation || 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
      const hw = o.width / 2, hd = o.depth / 2;
      const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => ({ x: o.x + lx * cos - ly * sin, y: o.y + lx * sin + ly * cos }));
      return { pivot: { x: o.x, y: o.y }, corners };
    }
    const t = longestEdgeFrameAzimuth(o.polygon) * Math.PI / 180;
    const r = { x: Math.cos(t), y: -Math.sin(t) }, f = { x: Math.sin(t), y: Math.cos(t) };
    const ext = orientedRoofExtents(o.polygon, longestEdgeFrameAzimuth(o.polygon));
    const at = (a, b) => ({ x: a * r.x + b * f.x, y: a * r.y + b * f.y });
    const hw = ext.width / 2, hl = ext.length / 2;
    const corners = [at(ext.centerA - hw, ext.centerB - hl), at(ext.centerA + hw, ext.centerB - hl), at(ext.centerA + hw, ext.centerB + hl), at(ext.centerA - hw, ext.centerB + hl)];
    return { pivot: at(ext.centerA, ext.centerB), corners };
  }

  // Sets a drawn obstacle's long-edge angle (Rotate popover slider) by
  // turning its outline about its own frame center by the difference.
  function setDrawnObstacleAngle(id, deg) {
    setObstacles((obs) => obs.map((o) => {
      if (o.id !== id || !o.polygon) return o;
      const { pivot } = obstacleRotateFrame(o);
      let delta = deg - longEdgeAngle(o.polygon);
      delta = ((((delta + 90) % 180) + 180) % 180) - 90;
      const polygon = rotatePoints(o.polygon, pivot, delta);
      const cx = polygon.reduce((a, p) => a + p.x, 0) / polygon.length;
      const cy = polygon.reduce((a, p) => a + p.y, 0) / polygon.length;
      return { ...o, polygon, x: Number(cx.toFixed(1)), y: Number(cy.toFixed(1)) };
    }));
    setOutputResult(null);
    setCost(null);
  }

  function startObstacleRotate(e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const o = obstacles.find((ob) => ob.id === selectedObstacleId);
    if (!isRotatableObstacle(o)) return;
    const { pivot } = obstacleRotateFrame(o);
    const { worldX, worldY } = clientToWorld(e.clientX, e.clientY);
    obstacleRotateRef.current = {
      id: o.id, pivot,
      startAngle: Math.atan2(worldY - pivot.y, worldX - pivot.x),
      rotation: o.rotation || 0,
      polygon: o.polygon ? o.polygon.map((p) => ({ ...p })) : null,
    };
    suspendHistoryRef.current = true;
    setRotatingObstacle(true);
  }

  useEffect(() => {
    if (!rotatingObstacle) return;

    function handleMouseMove(e) {
      const start = obstacleRotateRef.current;
      if (!start) return;
      const { worldX, worldY } = clientToWorld(e.clientX, e.clientY);
      let delta = ((Math.atan2(worldY - start.pivot.y, worldX - start.pivot.x) - start.startAngle) * 180) / Math.PI;
      setObstacles((obs) => obs.map((o) => {
        if (o.id !== start.id) return o;
        if (o.shape === 'box') {
          // Shift snaps the box's own total rotation to 15° steps.
          let next = start.rotation + delta;
          if (e.shiftKey) next = Math.round(next / 15) * 15;
          next = ((((next + 180) % 360) + 360) % 360) - 180;
          return { ...o, rotation: Number(next.toFixed(1)) };
        }
        // A drawn shape has no stored angle of its own - Shift snaps how
        // far this drag has turned it instead.
        if (e.shiftKey) delta = Math.round(delta / 15) * 15;
        const polygon = rotatePoints(start.polygon, start.pivot, delta);
        const cx = polygon.reduce((a, p) => a + p.x, 0) / polygon.length;
        const cy = polygon.reduce((a, p) => a + p.y, 0) / polygon.length;
        return { ...o, polygon, x: Number(cx.toFixed(1)), y: Number(cy.toFixed(1)) };
      }));
    }
    function handleMouseUp() {
      if (obstacleRotateRef.current) {
        swallowClickAfterDragRef.current = true;
        setOutputResult(null);
        setCost(null);
      }
      obstacleRotateRef.current = null;
      setRotatingObstacle(false);
      suspendHistoryRef.current = false;
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotatingObstacle]);

  function startObstacleVertexDrag(e, index) {
    if (e.button !== 0) return;
    e.stopPropagation();
    suspendHistoryRef.current = true;
    setDraggingObstacleVertex(index);
  }

  useEffect(() => {
    if (draggingObstacleVertex === null || selectedObstacleId === null) return;

    function handleMouseMove(e) {
      const { worldX, worldY } = clientToWorld(e.clientX, e.clientY);
      setObstacles((obs) => obs.map((o) => {
        if (o.id !== selectedObstacleId || !o.polygon) return o;
        const polygon = o.polygon.slice();
        polygon[draggingObstacleVertex] = { x: Number(worldX.toFixed(2)), y: Number(worldY.toFixed(2)) };
        // x/y is the vertex average (see addDrawnObstacle) - keep it in step
        // so anything keyed off an obstacle's center (e.g. which roof a
        // roof-drag carries it along with) still sees the reshaped one.
        const cx = polygon.reduce((a, p) => a + p.x, 0) / polygon.length;
        const cy = polygon.reduce((a, p) => a + p.y, 0) / polygon.length;
        return { ...o, polygon, x: Number(cx.toFixed(1)), y: Number(cy.toFixed(1)) };
      }));
    }
    function handleMouseUp() {
      setDraggingObstacleVertex(null);
      // Reshaping changes what it shades/blocks - computed output is stale.
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
  }, [draggingObstacleVertex, selectedObstacleId]);

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
        // Normalized to (-180, 180] so the readout/slider never shows 400°;
        // Shift snaps the grid's own total rotation to 15° steps.
        let next = o.rotation + deltaDeg;
        if (e.shiftKey) next = Math.round(next / 15) * 15;
        next = ((((next + 180) % 360) + 360) % 360) - 180;
        byRoof.get(o.roofId).set(o.gridId, next);
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
    cancelActiveModes();
    switchToPlanFor('Switched to the 2D plan to draw the panel area.');
    setPlacingGrid(true);
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

  // Roof rows for RoofPickerList - name, type, area and current panel count.
  function roofPickerRows() {
    return roofs.map((r, i) => {
      const poly = getRoofPolygon(r);
      let area = 0;
      for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length]; area += a.x * b.y - b.x * a.y; }
      area = Math.abs(area) / 2;
      const panels = r.grids.reduce((n, g) => n + (g.count || 0), 0);
      const areaText = units === 'ft' ? `${Math.round(area * 10.7639)} ft²` : `${Math.round(area)} m²`;
      return {
        id: r.id,
        name: roofLabel(r, i),
        detail: `${r.type === 'pitched' ? 'Pitched' : 'Flat'} · ${areaText} · ${panels} panel${panels === 1 ? '' : 's'}`,
        selected: r.id === selectedRoofId,
      };
    });
  }

  function closeRoofPickers() {
    setFillPickerOpen(false);
    setTablePickSize(null);
    setHoveredPickRoofId(null);
  }

  // Fill roof: with one roof there's nothing to ask - fill it. With more,
  // open the chooser (All roofs or one specific roof).
  function handleFillClick() {
    if (roofs.length <= 1) { regenerateAllGrids(); return; }
    setGridTablePickerOpen(false);
    setTablePickSize(null);
    setFillPickerOpen((o) => !o);
    setHoveredPickRoofId(null);
  }

  function fillRoofs(roofIds?: any[]) {
    regenerateAllGrids(undefined, roofIds);
    closeRoofPickers();
  }

  // A size picked in the table picker: straight onto the only roof, or on
  // to choosing which roof when there's more than one.
  function handleTableSizePicked(rows: number, cols: number) {
    if (roofs.length <= 1) { handleAddFixedGrid(rows, cols, roofs[0]?.id); return; }
    setTablePickSize({ rows, cols });
  }

  function handleAddFixedGrid(rows: number, cols: number, roofId?: any) {
    const roof = roofs.find((r) => r.id === roofId) || roofs[0];
    if (!roof) {
      setGridPlacementError("Add a roof first before placing a grid.");
      return;
    }
    const grid = generateFixedGrid({ roof, rows, cols, panelSpec, location });
    // generateFixedGrid keeps only panels wholly on the roof's usable area.
    if (grid.panels.length === 0) {
      setGridPlacementError(`A ${rows} × ${cols} grid doesn't fit on this roof's usable area.`);
      return;
    }
    setGridPlacementError(null);
    setRoofs((rs) => rs.map((r) => (r.id === roof.id ? { ...r, grids: [...r.grids, grid] } : r)));
    setSelectedGridKeys(new Set([gridKey(roof.id, grid.id)]));
    setGridTablePickerOpen(false);
    closeRoofPickers();
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
  function regenerateAllGrids(specOverride?: any, onlyRoofIds?: any[]) {
    const spec = specOverride ?? panelSpec;
    setRoofs((rs) => rs.map((roof) => {
      // Fill roof → one specific roof leaves every other roof's grids alone.
      if (onlyRoofIds && !onlyRoofIds.includes(roof.id)) return roof;
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

  function handleCalculate() {
    const gridsWithPanels = roofs.flatMap((roof) => roof.grids.filter((g) => g.count > 0).map((grid) => ({ roof, grid })));
    if (gridsWithPanels.length === 0) return;

    // One OutputSeries (OutputChartPanel.tsx) for the whole site plus one
    // per roof - the chart's roof dropdown just picks which to plot.
    const site = emptyOutputSeries();
    const byRoof = new Map<any, OutputSeries>();
    let label = '';
    let panelCost = 0, structureCost = 0, totalRailLength = 0, hasRail = false;
    gridsWithPanels.forEach(({ roof, grid }) => {
      const layout = resolvedGrid(grid);
      const r = computeOutput({
        layout, obstacles, location, mode: 'year', date: selectedDate,
        monthlyGHI, panelSpec,
        systemDerate: assumptions.systemDerate, diffuseFraction: assumptions.diffuseFraction,
        roofs, targetBuildingHeight: roof.buildingHeight,
      });
      if (!byRoof.has(roof.id)) byRoof.set(roof.id, emptyOutputSeries());
      addToOutputSeries(site, r);
      addToOutputSeries(byRoof.get(roof.id)!, r);
      label = r.label;

      const c = computeCost({ layout, roofType: roof.type, ...pricing });
      panelCost += c.panelCost;
      structureCost += c.structureCost;
      if (c.totalRailLength) { totalRailLength += c.totalRailLength; hasRail = true; }
    });

    setOutputResult({
      ...site, label,
      roofs: roofs
        .map((roof, idx) => ({ id: roof.id, label: roofLabel(roof, idx), series: byRoof.get(roof.id) }))
        .filter((r) => r.series),
    });
    setCost({
      panelCost, structureCost, totalCost: panelCost + structureCost,
      totalRailLength: hasRail ? totalRailLength : null,
    });
  }

  // Keep grid capacities and panel dimensions in sync whenever panelSpec changes
  useEffect(() => {
    setRoofs((rs) => rs.map((roof) => {
      let changed = false;
      const grids = roof.grids.map((g) => {
        const expectedKw = (g.count * panelSpec.wattage) / 1000;
        const Wp = (g.orientation ?? 'portrait') === 'landscape' ? panelSpec.height : panelSpec.width;
        const Ls = (g.orientation ?? 'portrait') === 'landscape' ? panelSpec.width : panelSpec.height;
        if (Math.abs(g.capacityKW - expectedKw) > 1e-4) {
          changed = true;
          const updatedPanels = (g.panels || []).map((p: any) => ({ ...p, w: Wp, d: Ls }));
          return { ...g, capacityKW: expectedKw, footprintDepth: Ls, panels: updatedPanels };
        }
        return g;
      });
      return changed ? { ...roof, grids } : roof;
    }));
  }, [panelSpec]);

  // Output and cost estimates recalculate on arrival at steps >= 4 and whenever design/settings change
  useEffect(() => {
    if (currentStep >= 4 && totalPanelCount > 0) handleCalculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, assumptions, totalPanelCount, roofs, panelSpec, pricing, location, selectedDate, monthlyGHI]);

  // Persistence: gathers exactly the content state identified as the
  // round-trippable shape (see types.ts's PlantDesignData) and hands it to
  // the host page's onSave, which does the actual POST/PATCH. idle |
  // saving | saved | error, mirrored back to "idle" a few seconds after a
  // successful save so the indicator doesn't sit stale.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Design Report step (8): both of its buttons export the exact pages
  // rendered on screen (reportRef) through one builder, designReportPdf.ts.
  // Kept separate from saveStatus so a failed export never reads as
  // "Save failed".
  const reportRef = useRef<HTMLDivElement>(null);
  const [reportBusy, setReportBusy] = useState<null | 'download' | 'attach'>(null);

  // Report site images. 3D: fixed-angle renders from an off-screen Scene3D
  // in capture mode (see the step 8 block below), redone on every visit to
  // the step so they always match the current design; null while pending.
  // 2D: SitePlanSvg drawn straight from the design data, with the satellite
  // backdrop inlined as a JPEG data URL - an external image href wouldn't
  // survive the PDF's vector export, and a JPEG keeps it small there.
  // Saved site images are presigned S3 URLs that expire after an hour, and a
  // texture that fails to load is silently dropped (MapGroundBoundary) - so a
  // design left open a while, or reopened straight onto this step, rendered
  // its 3D views with no satellite ground. Fresh URLs are fetched on every
  // visit to the step, and the image loads below wait for that first.
  const [reportImagesReady, setReportImagesReady] = useState(false);

  useEffect(() => {
    if (currentStep !== 8) return;
    if (!onRefreshSiteImages) { setReportImagesReady(true); return; }
    let cancelled = false;
    setReportImagesReady(false);
    onRefreshSiteImages()
      .then((fresh) => { if (!cancelled) setSiteImages((prev) => refreshSiteImageUrls(prev, fresh)); })
      .catch((err) => console.warn('Could not refresh site image links for the report', err))
      .finally(() => { if (!cancelled) setReportImagesReady(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  const [renders3D, setRenders3D] = useState<string[] | null>(null);
  const [renders3DFailed, setRenders3DFailed] = useState(false);
  const [reportBackdrop, setReportBackdrop] = useState<{ url: string; dataUrl: string } | null>(null);

  useEffect(() => {
    if (currentStep !== 8) return;
    setRenders3D(null);
    setRenders3DFailed(false);
  }, [currentStep]);

  // Safety net if WebGL is unavailable or the capture never completes - the
  // report still exports, with a "3D view unavailable" placeholder. Only
  // armed while a capture is actually pending.
  useEffect(() => {
    if (currentStep !== 8 || renders3D != null || renders3DFailed) return;
    const t = setTimeout(() => setRenders3DFailed(true), 20000);
    return () => clearTimeout(t);
  }, [currentStep, renders3D, renders3DFailed]);

  useEffect(() => {
    const url = siteImages.locationImage?.url;
    if (currentStep !== 8 || !reportImagesReady || !url || reportBackdrop?.url === url) return;
    let cancelled = false;
    (async () => {
      try {
        const blob = await (await fetch(url)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        if (!cancelled) setReportBackdrop({ url, dataUrl: canvas.toDataURL('image/jpeg', 0.85) });
      } catch (err) {
        // Plans still render, just on a plain background.
        console.warn('Could not load the site image for the report', err);
      }
    })();
    return () => { cancelled = true; };
  }, [currentStep, reportImagesReady, siteImages.locationImage?.url, reportBackdrop?.url]);

  const reportSitePlan: SitePlanData = useMemo(() => ({
    roofs: roofs.map((r, i) => ({ id: r.id, label: roofLabel(r, i), polygon: getRoofPolygon(r) })),
    panels: roofs.flatMap((r) => r.grids.flatMap((g) => resolvedGridPanels(g).map((p) => ({ roofId: r.id, corners: panelFootprint(p, g, r) })))),
    obstacles: obstacles
      .filter((o) => o.label !== 'Cutout')
      .map((o) => ({
        polygon: obstacleFootprintPoints(o).slice(1),
        round: o.shape !== 'box' && o.shape !== 'polygon',
        cx: o.x, cy: o.y, r: o.radius || 0,
      })),
    backdrop: reportBackdrop && backdropPlacement && reportBackdrop.url === siteImages.locationImage?.url
      ? { dataUrl: reportBackdrop.dataUrl, widthMeters: backdropPlacement.widthMeters, heightMeters: backdropPlacement.heightMeters }
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [roofs, obstacles, reportBackdrop, backdropPlacement, siteImages.locationImage?.url]);

  // Three fixed camera angles, framed on the equator-facing side (where the
  // panels face): front-left and front-right at 32° up, then a steep
  // bird's-eye. Named by the compass direction the camera looks *from*.
  const reportViews3D = useMemo(() => {
    const front = location.lat >= 0 ? 180 : 0;
    const name = (az) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((((az % 360) + 360) % 360) / 45) % 8];
    return [
      { azimuth: front - 40, elevation: 32, label: `View from the ${name(front - 40)}` },
      { azimuth: front + 40, elevation: 32, label: `View from the ${name(front + 40)}` },
      { azimuth: front, elevation: 68, label: "Bird's-eye view" },
    ];
  }, [location.lat]);

  async function handleDownloadReport() {
    if (!reportRef.current) return;
    setReportBusy('download');
    try {
      const blob = await buildReportPdf(reportRef.current);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = reportFilename(projectName);
      a.click();
      // Revoked on the next tick, not immediately - some browsers haven't
      // started reading the blob yet when click() returns.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      console.error(err);
      alert('Could not generate the design report PDF.');
    } finally {
      setReportBusy(null);
    }
  }

  async function handleAttachReport() {
    if (!reportRef.current || !onAttachPdf) return;
    setReportBusy('attach');
    try {
      const blob = await buildReportPdf(reportRef.current);
      await onAttachPdf(blob, reportFilename(projectName));
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Could not attach the design report to the work order.');
    } finally {
      setReportBusy(null);
    }
  }

  // Everything a Save persists (handleSave) - also what the unsaved-changes
  // check below compares.
  function savablePayload(): PlantDesignData {
    return {
      roofs, obstacles, siteImages, location, locationConfirmed, monthlyGHI,
      projectName, capacityNote, gridConnection, panelSpec, inverterChoice,
      designTemp, targetDcAcRatio, mpptVoltageUtilizationPct, currentStep, maxUnlockedStep,
    };
  }

  // Unsaved-changes guard: refreshing or closing the tab with edits since
  // the last save (or since the design was opened) gets the browser's own
  // "Leave site? Changes you made may not be saved" prompt. Compares a
  // fingerprint of savablePayload() against one taken at the last save,
  // only when the page is actually being left - so it costs nothing while
  // editing. Left out of the fingerprint: currentStep/maxUnlockedStep
  // (moving between steps isn't an edit) and each site image's url/s3Key
  // (a save swaps in a presigned url and records an s3Key for the very same
  // capture - see handleSave), keeping only which capture it is. The
  // opening baseline is taken a moment after mount so load-time
  // normalization (e.g. the panelSpec sync effect) doesn't count as an edit.
  function unsavedFingerprint(data) {
    const capture = (img) => (img ? { centerLat: img.centerLat, centerLon: img.centerLon, zoom: img.zoom, sizePx: img.sizePx, scale: img.scale } : null);
    return JSON.stringify({
      ...data,
      currentStep: undefined,
      maxUnlockedStep: undefined,
      siteImages: { locationImage: capture(data.siteImages?.locationImage), locationImageWide: capture(data.siteImages?.locationImageWide) },
    });
  }
  const currentFingerprintRef = useRef<() => string>(() => '');
  currentFingerprintRef.current = () => unsavedFingerprint(savablePayload());
  const savedFingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { savedFingerprintRef.current = currentFingerprintRef.current(); }, 800);
    function onBeforeUnload(e) {
      if (savedFingerprintRef.current == null) return;
      if (currentFingerprintRef.current() === savedFingerprintRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => { clearTimeout(t); window.removeEventListener('beforeunload', onBeforeUnload); };
  }, []);

  // In-app navigation guard (sidebar links, Dashboard, Back, redirects) -
  // beforeunload above only covers refresh/close; client-side route
  // changes never fire it. useBlocker (needs the data router - see App.tsx)
  // holds the navigation and the ConfirmDialog below asks. Not while a save
  // is in flight: a first save itself navigates /new -> /:id before this
  // editor has recorded the new baseline. Same-path changes (query string
  // only) aren't "leaving" either.
  const savingRef = useRef(false);
  const leaveBlocker = useBlocker(({ currentLocation, nextLocation }) =>
    !savingRef.current
    && currentLocation.pathname !== nextLocation.pathname
    && savedFingerprintRef.current != null
    && currentFingerprintRef.current() !== savedFingerprintRef.current);

  async function handleSave() {
    const data: PlantDesignData = savablePayload();
    savingRef.current = true;
    setSaveStatus('saving');
    try {
      const saved = await onSave(data, {
        name: projectName.trim() || 'Untitled project',
        capacityKw: totalCapacityKW > 0 ? totalCapacityKW : null,
        latitude: location.lat,
        longitude: location.lon,
      });
      // The server may have just captured one/both site images to S3 (see
      // SiteImageCapture), and returns a *freshly presigned* url for every
      // S3-backed image on every save - same picture, new url. Adopting it
      // made the 2D backdrop and the 3D texture re-download and redraw on
      // each save. For an image that's still the same capture, keep the url
      // already on screen and just record the server's s3Key (so the next
      // save keeps pointing at S3); only a genuinely different capture
      // (another location/zoom) takes the server's entry wholesale.
      if (saved?.siteImages) setSiteImages((prev) => mergeSavedSiteImages(prev, saved.siteImages));
      // What was just saved is the new "no unsaved changes" baseline.
      savedFingerprintRef.current = unsavedFingerprint(data);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 3000);
    } catch (err) {
      console.error('Failed to save plant design', err);
      setSaveStatus('error');
    } finally {
      savingRef.current = false;
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
    { n: 8, label: 'Design Report', complete: true },
  ];
  // Cost estimate is hidden for now - still fully wired underneath (its
  // own step number, right-panel content and cost computation all still
  // work if reached directly), just not offered as a step to navigate to.
  // Filtered here rather than removed from STEPS itself so `complete`/`n`
  // stay meaningful if this needs to come back.
  const visibleSteps = STEPS.filter((s) => s.n !== 6);

  const inputStyle = { width: 62, padding: '2px 4px', border: '1px solid #ccc', borderRadius: 4, fontSize: 11, color: '#222', background: '#fff' };
  const sectionStyle = { background: '#fff', border: '1px solid #e2e2e2', borderRadius: 8, padding: 10, marginBottom: 8 };
  const labelStyle = { fontSize: 11, color: '#555', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, gap: 6 };
  // A stack of label + SliderInput rows that should line up as columns
  // (e.g. the roof Dimensions popover). labelStyle's flex row lets each
  // label's own width decide where its slider starts, so differently-long
  // labels ("width" vs "building height") stagger the sliders and can push
  // the number box past the popover's edge - a fixed label column fixes
  // both. Use with a nowrap label span and a fixed SliderInput numberWidth.
  const sliderRowStyle = { fontSize: 11, color: '#555', display: 'grid', gridTemplateColumns: '108px minmax(0, 1fr)', alignItems: 'center', columnGap: 8, marginBottom: 8 };
  const sliderRowLabel = (name, unit) => (
    <span style={{ whiteSpace: 'nowrap' }}>{name}{unit ? <span style={{ color: '#999' }}> ({unit})</span> : null}</span>
  );
  // These three return className strings (styled by PlantDesignEditor.css's
  // .pde-btn/.pde-icon-btn/.pde-compass-btn rules, which pull from the host
  // app's own tokens.css) rather than inline style objects, so hover/active/
  // transition states are possible at all - inline styles can't express
  // :hover. `disabled` styling comes for free from each button's own real
  // `disabled` attribute (always set alongside these at the call site) via
  // CSS's :disabled pseudo-class, so iconBtn's second param is unused now;
  // kept so no call site needs to change.
  const btn = (active) => `pde-btn${active ? ' pde-active' : ''}`;
  // Icon rail buttons (steps 3-6's left-edge shortcuts, replacing the old
  // sidebar's full text sections) - square, symbol-only, `title` gives the
  // hover tooltip per the design brief ("user sees what it does on hover").
  const iconBtn = (active, _disabled = false) => `pde-icon-btn${active ? ' pde-active' : ''}`;
  const compassBtn = (active) => `pde-compass-btn${active ? ' pde-active' : ''}`;
  // On mobile, opening the map on step 1 takes over the whole content area
  // instead of stacking under the form - so the user isn't left scrolling
  // past project/location inputs to reach it (or back up to leave it).
  const mobileMapFullView = isMobile && currentStep === 1 && mapMode === 'location';
  // Step 4's site-wide layout-summary readout (panel count, structure
  // totals, per-grid inverter assignment) - shared between the desktop
  // floating corner overlay and the mobile in-flow block below the canvas
  // (see their own call sites further down) so the content itself isn't
  // duplicated between the two presentations.
  const renderLayoutSummary = () => (
    <>
      <div>{totalPanelCount} panels · {totalCapacityKW.toFixed(1)} kW across {roofs.length} roof{roofs.length === 1 ? '' : 's'}</div>
      <div style={{ marginTop: 3, color: '#555' }}>
        {Object.entries(structureTotals).map(([kind, t]) => (
          <span key={kind} style={{ marginRight: 8 }}><span style={{ textTransform: 'capitalize' }}>{kind}s</span>: {formatLength((t as any).length, units)} ({(t as any).count})</span>
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
    </>
  );

  return (
    <div className="plant-design-editor" style={{ display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', color: '#222', height: '100vh', boxSizing: 'border-box' }}>
      {/* Thin step bar - always visible. A step is clickable once reached
          (maxUnlockedStep), never re-locked by later edits (see
          maxUnlockedStep's own comment above). Desktop keeps the tab strip
          (it fits); mobile swaps it for a dropdown instead, since seven
          step labels don't fit a phone-width row even scrolling. */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 8 : 4, padding: isMobile ? '8px 16px' : '8px 16px', borderBottom: '1px solid #e2e2e2', background: '#fff', flexShrink: 0 }}>
        {isMobile ? (
          <select
            className="pde-step-select"
            value={currentStep}
            onChange={(e) => goToStep(Number(e.target.value))}
          >
            {visibleSteps.map((s, i) => (
              <option key={s.n} value={s.n} disabled={s.n > maxUnlockedStep}>
                {i + 1}. {s.label}
              </option>
            ))}
          </select>
        ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {visibleSteps.map((s, i) => {
          const unlocked = s.n <= maxUnlockedStep;
          const active = currentStep === s.n;
          return (
            <React.Fragment key={s.n}>
              {i > 0 && <span style={{ color: '#ccc', fontSize: 12, flexShrink: 0 }}>›</span>}
              <button
                onClick={() => goToStep(s.n)}
                disabled={!unlocked}
                title={unlocked ? s.label : `Finish the previous step first`}
                style={{
                  border: 'none', background: active ? '#e8f0ff' : 'transparent',
                  color: active ? '#2f6fed' : unlocked ? '#333' : '#bbb',
                  fontWeight: active ? 700 : 500, fontSize: 12, borderRadius: 6,
                  padding: '5px 10px', cursor: unlocked ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {i + 1}. {s.label}
              </button>
            </React.Fragment>
          );
        })}
        </div>
        )}
        <div className={`pde-topbar-save-row${isMobile ? ' pde-topbar-save-row--mobile' : ''}`} style={{ marginLeft: isMobile ? 0 : 'auto' }}>
          {saveStatus === 'saved' && <span className="pde-save-status success">Saved</span>}
          {saveStatus === 'error' && <span className="pde-save-status error">Save failed - try again</span>}
          <button className="pde-save-btn" onClick={handleSave} disabled={saveStatus === 'saving'}>
            {saveStatus === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: isMobile && (currentStep <= 2 || currentStep === 5) ? 'column' : 'row', gap: mobileMapFullView ? 0 : 16, flex: 1, minHeight: 0, boxSizing: 'border-box', padding: mobileMapFullView ? 0 : 16, overflowY: isMobile && (currentStep <= 2 || currentStep === 5) && !mobileMapFullView ? 'auto' : undefined }}>
      {currentStep <= 2 && !mobileMapFullView ? (
      /* LEFT: steps 1-2's own input form (Project & Location, then
         Configuration). Neither step shows the plan/3D canvas alongside it
         (see the CENTER block's own condition, gated to currentStep > 2) -
         step 1's map picker, when open, is the only thing that ever takes
         the right half on desktop (see mapMode below) or replaces the form
         entirely on mobile (see mobileMapFullView). With no canvas to
         share space with, both steps get a wider column on desktop to
         give their fields more room. */
      <div style={isMobile
        ? { width: '100%', flexShrink: 0 }
        : { width: currentStep <= 2 ? 480 : 300, flexShrink: 0, overflowY: 'auto', height: '100%' }}>
        {currentStep === 1 && (
          <div className="pde-step1-card">
            <div className="pde-step1-heading">Project & Location</div>
            <div className="pde-step1-subtext">Enter coordinates directly, or use the map - Next confirms and continues.</div>

            <div className="pde-field">
              <label htmlFor="pdeProjectName">Project name</label>
              <input id="pdeProjectName" type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Untitled project" />
            </div>

            <div className="pde-field-row">
              <div className="pde-field">
                <label htmlFor="pdeCapacity">Capacity (kW)</label>
                <input id="pdeCapacity" type="number" min="0.01" step="any" value={capacityNote} onChange={(e) => setCapacityNote(e.target.value)} placeholder="e.g. 100" />
                {capacityNote !== '' && !(Number(capacityNote) > 0) && (
                  <p className="pde-field-error">Enter a positive number.</p>
                )}
              </div>
              <div className="pde-field">
                <label>Units</label>
                <div className="pde-unit-toggle">
                  <button className={btn(units === 'm')} onClick={() => setUnits('m')}>Meters</button>
                  <button className={btn(units === 'ft')} onClick={() => setUnits('ft')}>Feet</button>
                </div>
              </div>
            </div>

            <div className="pde-field-row">
              <div className="pde-field">
                <label htmlFor="pdeLat">Latitude</label>
                <input id="pdeLat" type="number" value={location.lat} onChange={(e) => setLocation({ ...location, lat: +e.target.value })} />
              </div>
              <div className="pde-field">
                <label htmlFor="pdeLon">Longitude</label>
                <input id="pdeLon" type="number" value={location.lon} onChange={(e) => setLocation({ ...location, lon: +e.target.value })} />
              </div>
            </div>

            <div className="pde-field">
              <label htmlFor="pdeTz">Timezone (UTC+)</label>
              <input id="pdeTz" type="number" value={location.tz} onChange={(e) => setLocation({ ...location, tz: +e.target.value })} />
            </div>
            <div className="pde-step1-hint" style={{ marginTop: -8 }}>Default: Bengaluru, IN</div>

            <button className="pde-btn" style={{ width: '100%', padding: 10, fontSize: 14, marginBottom: 20 }} onClick={() => setMapMode('location')}>Set location on map…</button>

            <button
              className="pde-primary-btn"
              onClick={requestLocationConfirm}
            >
              Next: Configuration →
            </button>
          </div>
        )}
        {currentStep === 2 && (
        <>
        <CollapsibleSection title="Grid connection" defaultOpen>
          <div className="pde-field-row">
            <div className="pde-field-sm"><label>Grid voltage (V)</label><input type="number" step="1" value={gridConnection.voltage} onChange={(e) => setGridConnection({ ...gridConnection, voltage: +e.target.value })} /></div>
            <div className="pde-field-sm">
              <label>Phase</label>
              <select value={gridConnection.phase} onChange={(e) => setGridConnection({ ...gridConnection, phase: +e.target.value })}>
                <option value={1}>1-Phase</option>
                <option value={3}>3-Phase</option>
              </select>
            </div>
          </div>
          <div className="pde-field-row">
            <div className="pde-field-sm"><label>Sanctioned load (kW)</label><input type="number" min="0" step="any" value={gridConnection.sanctionedLoadKw} onChange={(e) => setGridConnection({ ...gridConnection, sanctionedLoadKw: e.target.value })} placeholder="e.g. 140" /></div>
            <div className="pde-field-sm"><label>DISCOM</label><input type="text" value={gridConnection.discom} onChange={(e) => setGridConnection({ ...gridConnection, discom: e.target.value })} placeholder="e.g. DHBVN" /></div>
          </div>
        </CollapsibleSection>
        <CollapsibleSection title="Panel configuration">
          <div className={panelSpec.make !== CUSTOM_MODULE_MAKE ? 'pde-field-row' : undefined}>
            <div className="pde-field-sm">
              <label>Make</label>
              <select
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
              <div className="pde-field-sm">
                <label>Model</label>
                <select
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
          </div>
          {panelSpec.make === CUSTOM_MODULE_MAKE ? (
            <>
              <div className="pde-field-sm"><label>Model name</label><input type="text" value={panelSpec.model} onChange={(e) => setPanelSpec({ ...panelSpec, model: e.target.value })} placeholder="e.g. My module 550W" /></div>
              <div className="pde-field-row">
                <div className="pde-field-sm"><label>Width ({units})</label><SliderInput unit={units} min={0.3} max={2.5} step={0.05} value={panelSpec.width} onChange={(v) => setPanelSpec({ ...panelSpec, width: v })} /></div>
                <div className="pde-field-sm"><label>Height ({units})</label><SliderInput unit={units} min={0.3} max={2.5} step={0.05} value={panelSpec.height} onChange={(v) => setPanelSpec({ ...panelSpec, height: v })} /></div>
              </div>
              <div className="pde-field-row">
                <div className="pde-field-sm"><label>Wattage (W)</label><SliderInput min={100} max={800} step={10} value={panelSpec.wattage} onChange={(v) => setPanelSpec({ ...panelSpec, wattage: v })} /></div>
                <div className="pde-field-sm"><label>Temp coeff. Voc (%/°C)</label><input type="number" step="0.01" value={panelSpec.tempCoeffVoc} onChange={(e) => setPanelSpec({ ...panelSpec, tempCoeffVoc: +e.target.value })} /></div>
              </div>
              <div className="pde-field-row">
                <div className="pde-field-sm"><label>Voc (V)</label><input type="number" step="0.01" value={panelSpec.voc} onChange={(e) => setPanelSpec({ ...panelSpec, voc: +e.target.value })} /></div>
                <div className="pde-field-sm"><label>Vmp (V)</label><input type="number" step="0.01" value={panelSpec.vmp} onChange={(e) => setPanelSpec({ ...panelSpec, vmp: +e.target.value })} /></div>
              </div>
              <div className="pde-field-row">
                <div className="pde-field-sm"><label>Isc (A)</label><input type="number" step="0.01" value={panelSpec.isc} onChange={(e) => setPanelSpec({ ...panelSpec, isc: +e.target.value })} /></div>
                <div className="pde-field-sm"><label>Imp (A)</label><input type="number" step="0.01" value={panelSpec.imp} onChange={(e) => setPanelSpec({ ...panelSpec, imp: +e.target.value })} /></div>
              </div>
            </>
          ) : (
            <div className="pde-field-sm-hint">
              {panelSpec.width.toFixed(2)}×{panelSpec.height.toFixed(2)} m · {panelSpec.wattage} W<br />
              Voc {panelSpec.voc} V · Vmp {panelSpec.vmp} V · Isc {panelSpec.isc} A · Imp {panelSpec.imp} A<br />
              Temp coeff. Voc {panelSpec.tempCoeffVoc}%/°C
            </div>
          )}
        </CollapsibleSection>
        <CollapsibleSection title="Inverter (default)">
          <div className={inverterChoice.make !== CUSTOM_INVERTER_MAKE ? 'pde-field-row' : undefined}>
            <div className="pde-field-sm">
              <label>Make</label>
              <select
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
              <div className="pde-field-sm">
                <label>Model</label>
                <select
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
          </div>
          {inverterChoice.make === CUSTOM_INVERTER_MAKE ? (
            <>
              <div className="pde-field-sm"><label>Model name</label><input type="text" value={inverterChoice.model} onChange={(e) => setInverterChoice({ ...inverterChoice, model: e.target.value })} placeholder="e.g. My inverter 50kW" /></div>
              <div className="pde-field-row">
                <div className="pde-field-sm"><label>AC power (kW)</label><input type="number" step="0.1" value={inverterChoice.acPowerKw} onChange={(e) => setInverterChoice({ ...inverterChoice, acPowerKw: +e.target.value })} /></div>
                <div className="pde-field-sm"><label>Max DC voltage (V)</label><input type="number" step="1" value={inverterChoice.maxDcVoltage} onChange={(e) => setInverterChoice({ ...inverterChoice, maxDcVoltage: +e.target.value })} /></div>
              </div>
              <div className="pde-field-row">
                <div className="pde-field-sm"><label>MPPT channels</label><input type="number" step="1" value={inverterChoice.mpptCount} onChange={(e) => setInverterChoice({ ...inverterChoice, mpptCount: +e.target.value })} /></div>
                <div className="pde-field-sm"><label>Max current/MPPT (A)</label><input type="number" step="0.1" value={inverterChoice.maxCurrentPerMppt} onChange={(e) => setInverterChoice({ ...inverterChoice, maxCurrentPerMppt: +e.target.value })} /></div>
              </div>
              <div className="pde-field-row">
                <div className="pde-field-sm"><label>MPPT V min (V)</label><input type="number" step="1" value={inverterChoice.mpptVoltageMin} onChange={(e) => setInverterChoice({ ...inverterChoice, mpptVoltageMin: +e.target.value })} /></div>
                <div className="pde-field-sm"><label>MPPT V max (V)</label><input type="number" step="1" value={inverterChoice.mpptVoltageMax} onChange={(e) => setInverterChoice({ ...inverterChoice, mpptVoltageMax: +e.target.value })} /></div>
              </div>
              <div className="pde-field-row">
                <div className="pde-field-sm"><label>Max AC current (A)</label><input type="number" step="0.1" value={inverterChoice.maxAcCurrent} onChange={(e) => setInverterChoice({ ...inverterChoice, maxAcCurrent: +e.target.value })} /></div>
                <div className="pde-field-sm"><label>AC voltage (V)</label><input type="number" step="1" value={inverterChoice.acVoltage} onChange={(e) => setInverterChoice({ ...inverterChoice, acVoltage: +e.target.value })} /></div>
              </div>
              <div className="pde-field-sm"><label>Phase</label><input type="number" step="1" value={inverterChoice.phase} onChange={(e) => setInverterChoice({ ...inverterChoice, phase: +e.target.value })} /></div>
            </>
          ) : (
            <div className="pde-field-sm-hint">
              {inverterChoice.acPowerKw} kW · {inverterChoice.phase}-Phase · {inverterChoice.acVoltage} V AC<br />
              Max DC {inverterChoice.maxDcVoltage} V · {inverterChoice.mpptCount} MPPT × {inverterChoice.maxCurrentPerMppt} A<br />
              MPPT window {inverterChoice.mpptVoltageMin}–{inverterChoice.mpptVoltageMax} V
            </div>
          )}
          {inverterSuggestion && (
            <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, padding: 10, fontSize: 12.5, color: '#7a5c00', marginTop: 10 }}>
              💡 A smaller inverter would fit this site better: <strong>{inverterSuggestion.model}</strong> ({inverterSuggestion.acPowerKw} kW) needs the same {inverterSuggestion.numInverters} inverter{inverterSuggestion.numInverters === 1 ? '' : 's'} but runs at {(inverterSuggestion.suggestedUtilization * 100).toFixed(0)}% utilization instead of {(inverterSuggestion.currentUtilization * 100).toFixed(0)}%.
            </div>
          )}
          <div className="pde-field-sm" style={{ marginTop: 10 }}>
            <label>MPPT voltage utilization (%)</label>
            <SliderInput min={100} max={140} step={1} value={mpptVoltageUtilizationPct} onChange={setMpptVoltageUtilizationPct} />
          </div>
          <div className="pde-field-sm-hint">
            how far a string's cold-weather voltage may push past this inverter's rated MPPT window (100% = never exceed it) when sizing modules per string - still capped by its absolute max DC voltage rating either way.
          </div>
        </CollapsibleSection>
        <CollapsibleSection title="String sizing">
          <div className="pde-field-sm"><label>Target DC:AC ratio</label><SliderInput min={0.8} max={1.5} step={0.01} value={targetDcAcRatio} onChange={setTargetDcAcRatio} /></div>
          <div className="pde-field-row">
            <div className="pde-field-sm"><label>Design min temp (°C)</label><input type="number" step="1" value={designTemp.min} onChange={(e) => setDesignTemp({ ...designTemp, min: +e.target.value })} /></div>
            <div className="pde-field-sm"><label>Design max temp (°C)</label><input type="number" step="1" value={designTemp.max} onChange={(e) => setDesignTemp({ ...designTemp, max: +e.target.value })} /></div>
          </div>
          <div className="pde-field-sm-hint" style={{ marginBottom: 10 }}>
            {designTempStatus === 'loading' && 'fetching this site\'s temperature range (NASA POWER)…'}
            {designTempStatus === 'ready' && 'this site\'s own monthly min/max (NASA POWER, 2001-2020 climatology) - edit above to override.'}
            {designTempStatus === 'error' && 'couldn\'t fetch this site\'s temperature data - edit above to set it manually.'}
            {designTempStatus === 'idle' && 'confirm a location (step 1) to fetch this automatically, or edit manually now.'}
          </div>
          {(() => {
            const sizing = sizeStrings(panelSpec, inverterChoice, designTemp.min, designTemp.max, mpptVoltageUtilizationPct);
            if (!sizing.valid) {
              return <div className="pde-field-error">No valid string configuration for this module/inverter/temperature combination.</div>;
            }
            return (
              <div className="pde-field-sm-hint" style={{ lineHeight: 1.7 }}>
                Modules per string: {sizing.minModulesPerString}–{sizing.maxModulesPerString}<br />
                Max strings per MPPT: {sizing.maxStringsPerMppt}<br />
                Max modules per MPPT: {sizing.maxModulesPerMppt}<br />
                Max modules per inverter: {sizing.maxModulesPerInverter}
              </div>
            );
          })()}
        </CollapsibleSection>
        <button
          className="pde-primary-btn"
          onClick={() => advanceToStep(3)}
        >
          Next: Roof setup →
        </button>
        </>
        )}
      </div>
      ) : null}

      {/* CENTER: the map (picking a location), the plan/3D view (once a
          location's confirmed and the user has moved past step 2), or
          nothing at all before either has happened — the app starts as
          just the left panel. Steps 1/2 never show the plan/3D view, even
          once locationConfirmed, so a user working through Project &
          Location or Configuration doesn't land in the design canvas as
          if they could keep building there - it only ever appears from
          Roof setup (step 3) onward. */}
      {currentStep === 1 && mapMode === 'location' && (
        <div style={mobileMapFullView
          ? { width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
          : { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
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

      {mapMode !== 'location' && locationConfirmed && currentStep > 2 && currentStep !== 5 && currentStep !== 7 && currentStep !== 8 && (
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
        {/* On mobile, step 4's map gets a capped height instead of
            flex:1 filling the whole screen - otherwise the layout-summary
            block right after it (see its own comment further down) is
            technically reachable by scrolling, but only after scrolling
            through an entire screen-height map first, which reads as
            "buried at the end of the map" rather than its own separate
            section. A fixed portion of the screen keeps both visible
            together, or close to it, instead of one long combined
            scroll. 65% (not a smaller share) plus the same 480px floor
            desktop uses - the floating toolbar + icon rail (steps 3/4 can
            stack 4-5 icons) need real room, or they run past the bottom
            of a too-short map box since they're position:absolute and
            don't get clipped/scrolled by it. */}
        <div style={isMobile && currentStep === 4
          ? { flex: '0 0 65%', minHeight: 480, display: 'flex', flexDirection: 'column', position: 'relative' }
          : { flex: '1 1 auto', minHeight: 480, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* View/edit toolbar + icon rail (steps 3-6) - one floating
              top-left stack instead of two independently-positioned pieces,
              so the rail sits directly under the toolbar with no dead
              space between them regardless of how tall the toolbar's own
              wrapped row ends up being. Floats over the canvas instead of
              taking a row/column of their own, so the canvas always gets
              the full height/width. Each button already has its own opaque
              background (see btn()/iconBtn()), so no extra enclosing box is
              needed for legibility over the map/plan. On mobile, `right`
              stops short of the fixed compass (see the right-side rail
              further down - always rendered, 44px wide there) instead of
              running the full width and wrapping underneath/behind it. */}
          <div style={{ position: 'absolute', top: 12, left: 12, right: isMobile ? 64 : 12, zIndex: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', pointerEvents: 'auto' }}>
            {/* One toggle instead of two separate buttons - always shows
                the 3D cube (see icons.jsx), "pressed" (active/blue) only
                while actually in 3D, unpressed for the 2D plan; click flips
                to the other. Icon-only, so data-tooltip (instant hover,
                see PlantDesignEditor.css) rather than a plain `title` now
                that there's no visible text to already convey it. */}
            <button
              className={iconBtn(viewMode === '3d')}
              onClick={() => setViewMode((m) => (m === 'plan' ? '3d' : 'plan'))}
              data-tooltip={viewMode === 'plan' ? 'Viewing 2D plan - click for 3D view' : 'Viewing 3D view - click for 2D plan'}
              aria-label={viewMode === 'plan' ? 'Viewing 2D plan - click for 3D view' : 'Viewing 3D view - click for 2D plan'}
            >
              <Cube3DIcon />
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
                useful to show disabled, so it's just absent instead.
                "Default" is 1x unless minPlanZoom's own floor (see its
                comment - can exceed 1 on a wide screen) forces more. */}
            {viewMode === 'plan' && (planZoom !== Math.max(1, minPlanZoom) || panOffset.x !== 0 || panOffset.y !== 0) && (
              <button
                className={iconBtn(false)}
                onClick={() => {
                  const z = Math.max(1, minPlanZoom);
                  setPlanZoom(z);
                  setPanOffset(clampPanOffsetForZoom({ x: 0, y: 0 }, z));
                }}
                data-tooltip="Reset zoom and pan back to the default fit-to-content view" aria-label="Reset view"
              >
                ⊙
              </button>
            )}
            <button
              className={iconBtn(false)}
              onClick={undo} disabled={historyRef.current.past.length === 0}
              data-tooltip="Undo (Ctrl/Cmd+Z)" aria-label="Undo"
            >
              ↶
            </button>
            <button
              className={iconBtn(false)}
              onClick={redo} disabled={historyRef.current.future.length === 0}
              data-tooltip="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo"
            >
              ↷
            </button>
            {/* Roof-wide annual sun exposure heatmap (see roofSunSamples/
                sunExposureColor) - usable as soon as a roof exists, well
                before any grid/panel does, so it's meaningful right after
                Roof setup itself. 2D plan only - there's no 3D rendering
                of it. */}
            {viewMode === 'plan' && roofs.length > 0 && (
              isMobile ? (
                <button
                  className={iconBtn(shadowAnalysis)} onClick={() => setShadowAnalysis((v) => !v)}
                  data-tooltip="Shadow analysis: heatmap of each part of the roof's own annual sun exposure"
                  aria-label="Toggle shadow analysis heatmap"
                >
                  <SunIcon />
                </button>
              ) : (
                <button
                  className={btn(shadowAnalysis)} onClick={() => setShadowAnalysis((v) => !v)}
                  title="Heatmap of each part of the roof's own annual sun exposure - red gets the most, blue the least"
                >
                  Shadow analysis
                </button>
              )
            )}
            {viewMode === '3d' && (
              <button className={btn(!showPanels)} onClick={() => setShowPanels((v) => !v)}>
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
              isMobile ? (
                <button
                  className={iconBtn(efficiencyView)} onClick={() => setEfficiencyView((v) => !v)}
                  data-tooltip={`Efficiency view: color each panel by its own annual output (${totalPanelCount} panel${totalPanelCount === 1 ? '' : 's'})`}
                  aria-label="Toggle efficiency view"
                >
                  <EfficiencyIcon />
                </button>
              ) : (
                <button
                  className={btn(efficiencyView)} onClick={() => setEfficiencyView((v) => !v)}
                  title="Color each panel by its own annual output as a % of the best panel on site"
                >
                  Efficiency view{efficiencyView ? ` · ${totalPanelCount} panel${totalPanelCount === 1 ? '' : 's'}` : ''}
                </button>
              )
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
                className={iconBtn(drawingRoof)}
                onClick={drawingRoof ? cancelRoofDraw : startRoofDraw}
              >
                {drawingRoof ? <CloseIcon /> : <PitchedRoofIcon />}
              </button>
              <div style={{ position: 'relative' }}>
                <button
                  data-tooltip="Add an obstacle (tree, AC unit, chimney, ...)"
                  aria-label="Add an obstacle"
                  className={iconBtn(obstaclePickerOpen || !!placingShape)}
                  onClick={() => {
                    cancelActiveModes();
                    setObstaclePickerOpen((v) => !v);
                  }}
                >
                  <PlusIcon />
                </button>
                {obstaclePickerOpen && (
                  <div style={{ position: 'absolute', left: 48, top: 0, background: '#fff', border: '1px solid #e2e2e2', borderRadius: 8, padding: 8, boxShadow: '0 4px 18px rgba(0,0,0,0.18)', width: 220, zIndex: 5 }}>
                    <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 6 }}>Add obstacle</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: 204 }}>
                      {Object.entries(OBSTACLE_PRESETS).map(([k, p]) => {
                        const ObstacleIcon = OBSTACLE_ICONS[k];
                        return (
                          <button
                            key={k} className={iconBtn(placingShape === k)}
                            data-tooltip={p.label} aria-label={p.label}
                            onClick={() => {
                              resetClickSuppression();
                              const isSelf = placingShape === k;
                              cancelActiveModes();
                              if (!isSelf) {
                                if ((p as any).drawable) switchToPlanFor(`Switched to the 2D plan to trace the ${(p as any).label.toLowerCase()}.`);
                                setPlacingShape(k);
                              }
                            }}
                          >
                            {ObstacleIcon ? <ObstacleIcon /> : p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {/* Point counts for roof/obstacle outlines being drawn now
                  show on the canvas itself, next to the last point placed
                  (see the SVG's own pointCountBadge) - this single-click
                  placement hint stays here since it's not a running count
                  that would need to track a moving point. */}
              {placingShape && !OBSTACLE_PRESETS[placingShape]?.drawable && (
                <div style={{ fontSize: 10, color: '#2f6fed', textAlign: 'center', background: '#fff', borderRadius: 4, padding: '2px 4px' }}>
                  click plan
                </div>
              )}
              <button
                data-tooltip={roofs.length === 0 ? 'Draw at least one roof first' : 'Continue to Panel/Grid setup'}
                aria-label="Continue to Panel/Grid setup"
                onClick={() => advanceToStep(4)} disabled={roofs.length === 0}
                className={`${iconBtn(false)} pde-primary`}
              >
                <ArrowRightIcon />
              </button>
            </>
            )}

            {currentStep === 4 && (
            <>
              <div style={{ position: 'relative' }}>
                <button
                  data-tooltip={roofs.length > 1 ? 'Fill a roof (or all roofs) with panels' : 'Fill the whole roof with panels'}
                  aria-label="Fill roof with panels"
                  onClick={handleFillClick} disabled={roofs.length === 0}
                  className={iconBtn(fillPickerOpen, roofs.length === 0)}
                >
                  <FillGridIcon />
                </button>
                {fillPickerOpen && (
                  <div style={{ position: 'absolute', left: 42, top: 0, zIndex: 1000 }}>
                    <RoofPickerList
                      title="Fill which roof?"
                      rows={roofPickerRows()}
                      allOption={{ label: `All roofs (${roofs.length})`, onPick: () => fillRoofs() }}
                      onPick={(id) => fillRoofs([id])}
                      onHover={setHoveredPickRoofId}
                      onClose={closeRoofPickers}
                    />
                  </div>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <button
                  data-tooltip={gridTablePickerOpen ? "Close table picker" : "Add grid by size (rows × cols)"}
                  aria-label="Add grid by size"
                  onClick={() => { closeRoofPickers(); setGridTablePickerOpen(!gridTablePickerOpen); }} disabled={roofs.length === 0}
                  className={iconBtn(gridTablePickerOpen, roofs.length === 0)}
                >
                  <TableGridIcon />
                </button>
                {gridTablePickerOpen && (
                  <div style={{ position: 'absolute', left: 42, top: 0, zIndex: 1000 }}>
                    {tablePickSize ? (
                      <RoofPickerList
                        title="Place grid on which roof?"
                        subtitle={`${tablePickSize.rows} × ${tablePickSize.cols} (${tablePickSize.rows * tablePickSize.cols} panels)`}
                        rows={roofPickerRows()}
                        onPick={(id) => handleAddFixedGrid(tablePickSize.rows, tablePickSize.cols, id)}
                        onHover={setHoveredPickRoofId}
                        onClose={() => { closeRoofPickers(); setGridTablePickerOpen(false); }}
                        onBack={() => { setTablePickSize(null); setHoveredPickRoofId(null); }}
                      />
                    ) : (
                      <TablePickerGrid
                        onSelect={(r, c) => handleTableSizePicked(r, c)}
                        onClose={() => setGridTablePickerOpen(false)}
                      />
                    )}
                  </div>
                )}
              </div>
              <button
                data-tooltip={placingGrid ? 'Cancel placing this grid' : 'Draw a custom panel area'}
                aria-label={placingGrid ? 'Cancel placing this grid' : 'Draw a custom panel area'}
                onClick={placingGrid ? cancelGridPlacement : startGridPlacement} disabled={roofs.length === 0}
                className={iconBtn(placingGrid, roofs.length === 0)}
              >
                {placingGrid ? <CloseIcon /> : <DrawAreaIcon />}
              </button>
              {gridPlacementError && (
                <div style={{ fontSize: 10, color: '#c0392b', textAlign: 'center', background: '#fff', borderRadius: 4, padding: '2px 4px' }}>{gridPlacementError}</div>
              )}
              <button
                data-tooltip={totalPanelCount === 0 ? 'Place at least one grid first' : 'Continue to Output estimate'}
                aria-label="Continue to Output estimate"
                onClick={() => advanceToStep(5)} disabled={totalPanelCount === 0}
                className={`${iconBtn(false)} pde-primary`}
              >
                <ArrowRightIcon />
              </button>
            </>
            )}

            {currentStep === 6 && (
              <button
                data-tooltip="Continue to Electrical Design (SLD)"
                aria-label="Continue to Electrical Design (SLD)"
                onClick={() => advanceToStep(7)}
                className={`${iconBtn(false)} pde-primary`}
              >
                <ArrowRightIcon />
              </button>
            )}
          </div>
          </div>

          {viewNotice && (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 8, background: '#1c2b4a', color: '#fff', fontSize: 12, padding: '6px 12px', borderRadius: 999, boxShadow: '0 2px 10px rgba(0,0,0,0.2)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              {viewNotice}
            </div>
          )}
          {viewMode === '3d' && (
            <div style={{ flex: 1, minHeight: 0, borderRadius: 10, border: '1px solid #d5d5d5', overflow: 'hidden', position: 'relative' }}>
              <React.Suspense fallback={<div style={{ padding: 16, fontSize: 13, color: '#888' }}>Loading 3D view…</div>}>
              <Scene3D
                formatLength={(m) => formatLength(m, units, 1)}
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
                    azimuth: getRoofAzimuth(roof, location),
                    // Same frame the Dimensions popover measures width/length
                    // in, so Scene3D's on-roof dimension labels match it.
                    dimensionFrameAzimuth: roof.polygon ? autoRoofAzimuth(roof, location) : 0,
                    // A roof can (eventually) hold more than one grid (see
                    // README's "Panel grids" entry) - each carries its own
                    // packed layout/structure/shading/efficiency, plus its
                    // own `rotation` for Scene3D to apply as a render-time
                    // transform (see layoutEngine.js's gridPivot comment).
                    grids: roof.grids.map((g) => ({
                      id: g.id,
                      selected: selectedGridKeys.has(gridKey(roof.id, g.id)),
                      // Delete row/column/panel mode for this grid: panel
                      // clicks pick (onPickPanelForDelete) instead of
                      // selecting, picked ones render solid red.
                      deleteMode: !!gridDeleteMode && selectedGrid?.id === g.id && gridOwnerRoof?.id === roof.id,
                      deletePickedIds: deletePickedIdsFor(roof.id, g),
                      // Same set the 2D plan highlights (obstacle or
                      // other-grid overlap) - light red in 3D too.
                      overlapIds: overlapPanelIdsByGrid[gridKey(roof.id, g.id)],
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
                canSelectRoofs={currentStep === 3}
                highlightRoofId={hoveredPickRoofId}
                focusPoint={selectionFocus}
                onPickPanelForDelete={(p, multi) => pickPanelForDelete(p, multi)}
                onBackgroundClick={cancelActiveModes}
                // One roof's edges as clickable bars in 3D, for whichever
                // edge-picking mode is active (mirror / margin override /
                // align to edge) - same handlers as the 2D plan's slivers.
                edgePick={
                  mirrorRoofId != null ? {
                    roofId: mirrorRoofId, hovered: hoveredMirrorEdge, picked: [],
                    onHover: setHoveredMirrorEdge, onPick: (i) => mirrorRoof(mirrorRoofId, i),
                  } : marginEditRoofId != null ? {
                    roofId: marginEditRoofId, hovered: hoveredMarginEdge, picked: [...selectedMarginEdges],
                    onHover: setHoveredMarginEdge, onPick: (i, additive) => toggleMarginEdge(i, additive),
                  } : alignEdgeRoofId != null ? {
                    roofId: alignEdgeRoofId, hovered: hoveredAlignEdge, picked: [],
                    onHover: setHoveredAlignEdge, onPick: (i) => pickAlignEdge(alignEdgeRoofId, i),
                  } : null
                }
                // Adding to the selected grid - same "+" handles, drag ghosts
                // and Add -> Panels slots as the 2D plan.
                gridAdd={gridOwnerRoof && selectedGrid && (selectedGridHandles.length || addDragPreview || addPanelsMode) ? {
                  roofId: gridOwnerRoof.id,
                  handles: selectedGridHandles,
                  activeSide: addDrag?.side ?? null,
                  label: addDragPreview?.label ?? null,
                  ghosts: addDragPreview?.ghosts ?? [],
                  slots: addPanelsMode ? addPanelSlots.map((sl) => ({ ...sl, picked: addPanelsPicks.has(sl.key) })) : [],
                  onHandleDown: (side, x, y, stepPx) => startAddDrag(gridOwnerRoof.id, selectedGrid.id, side, x, y, stepPx, '3d'),
                  onSlotDown: (key) => paintSlot(key, true),
                } : null}
                // Same step the 2D plan's panels are clickable in (see the
                // panel <g>'s pointerEvents there).
                canSelectGrids={currentStep === 4}
                onSelectGrid={selectGridFrom3D}
                showPanels={showPanels}
                ghostPanels={currentStep === 3}
                mapImagePlacement={backdropPlacement}
                mapImageWidePlacement={backdropWidePlacement}
                onCompassAngleChange={setCompass3DAngleDeg}
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
                    type="range" min="5" max="19" step="0.0625" value={selectedHour}
                    onChange={(e) => { setSunPlaying(false); setSelectedHour(+e.target.value); }}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 11, opacity: 0.85, width: 60, textAlign: 'right' }}>Sunset 19:00</span>
                  <span style={{ fontSize: 12, fontWeight: 600, width: 54, textAlign: 'right' }}>
                    {(() => {
                      // Rounds to the nearest whole minute via total-minutes
                      // math (not (selectedHour % 1) * 60 directly), which
                      // rounding a value like 18.999375h -> 59.9625min ->
                      // "60" would otherwise render as "18:60".
                      const totalMinutes = Math.round(selectedHour * 60);
                      const hh = Math.floor(totalMinutes / 60), mm = totalMinutes % 60;
                      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                    })()}
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
            ref={svgRef} viewBox={`0 0 ${planViewBoxWidth} ${PLAN_VIEWBOX_HEIGHT}`} preserveAspectRatio="xMidYMid meet"
            style={{ display: viewMode === 'plan' ? 'block' : 'none', flex: 1, minHeight: 0, width: '100%', height: '100%', background: '#eef3ea', borderRadius: 10, border: '1px solid #d5d5d5', cursor: (placingShape || drawingRoof || placingGrid) ? 'crosshair' : (isPanning ? 'grabbing' : 'grab') }}
            onClick={onSvgClick}
            onDoubleClick={onSvgDoubleClick}
            onWheel={onPlanWheel}
            onMouseDown={onSvgMouseDown}
            onMouseMove={onSvgDrawMouseMove}
            onMouseLeave={() => { if (shadowAnalysis) setSunHoverInfo(null); if (drawCursorWorld) setDrawCursorWorld(null); }}
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

            {/* Overridden-margin edges for the selected roof, shown whenever
                it's selected (not only inside margin-edit mode, where the
                pick block above already colors them): a purple edge line plus
                a numbered badge with the override value, laid parallel to the
                edge just outside the roof, matching the numbered rows in the
                Panel margin popover. */}
            {selectedRoof && !mirrorRoofId && !alignEdgeRoofId && (() => {
              const overrides = selectedRoof.edgeMarginOverrides || {};
              const poly = getRoofPolygon(selectedRoof);
              const n = poly.length;
              const idxs = Object.keys(overrides).map(Number).filter((i) => i < n && overrides[i] != null);
              if (idxs.length === 0) return null;
              const editing = marginEditRoofId === selectedRoof.id;
              // Screen-space centroid (vertex average - plenty to tell which
              // side of an edge is "inside" for picking the outward normal).
              const pts = poly.map((p) => toScreen(p.x, p.y));
              const cx = pts.reduce((a, p) => a + p.sx, 0) / n;
              const cy = pts.reduce((a, p) => a + p.sy, 0) / n;
              return idxs.map((i) => {
                const s1 = pts[i];
                const s2 = pts[(i + 1) % n];
                const mid = { sx: (s1.sx + s2.sx) / 2, sy: (s1.sy + s2.sy) / 2 };
                const dx = s2.sx - s1.sx, dy = s2.sy - s1.sy;
                const len = Math.hypot(dx, dy) || 1;
                // Unit normal pointing away from the roof, so the badge sits
                // just outside the edge rather than over the usable area.
                let nx = -dy / len, ny = dx / len;
                if ((mid.sx - cx) * nx + (mid.sy - cy) * ny < 0) { nx = -nx; ny = -ny; }
                const offset = 15;
                const bx = mid.sx + nx * offset, by = mid.sy + ny * offset;
                // Parallel to the edge, flipped by 180° when needed so the
                // text never reads upside-down.
                let angle = Math.atan2(dy, dx) * 180 / Math.PI;
                if (angle > 90) angle -= 180;
                else if (angle < -90) angle += 180;
                const hot = hoveredOverrideEdge === i;
                const text = `${i + 1} · ${formatLength(overrides[i], units, 2)}`;
                const w = text.length * 6.2 + 12;
                return (
                  <g key={`override-edge-${i}`} style={{ pointerEvents: 'none' }}>
                    {!editing && (
                      <line x1={s1.sx} y1={s1.sy} x2={s2.sx} y2={s2.sy} stroke="#8e44ad" strokeWidth={hot ? 6 : 3} strokeDasharray={hot ? undefined : '6 4'} />
                    )}
                    <g transform={`translate(${bx} ${by}) rotate(${angle})`}>
                      <rect x={-w / 2} y={-9} width={w} height={18} rx={9} fill={hot ? '#8e44ad' : '#fff'} stroke="#8e44ad" strokeWidth={1.5} />
                      <text x={0} y={4} textAnchor="middle" fontSize={11} fontWeight={600} fill={hot ? '#fff' : '#8e44ad'}>{text}</text>
                    </g>
                  </g>
                );
              });
            })()}

            {/* Align-to-edge mode: same "visible sliver + wide invisible
                hit-area" pattern as mirror/margin mode above. Hovering an
                edge also draws an arrow from its midpoint in the direction
                panels would face (edgeAlignedAzimuth) so the pick is
                unambiguous before clicking. */}
            {alignEdgeRoofId && (() => {
              const rp = roofPolygons.find((r) => r.id === alignEdgeRoofId);
              if (!rp) return null;
              const poly = rp.polygon;
              const n = poly.length;
              return poly.map((p, i) => {
                const next = poly[(i + 1) % n];
                const s1 = toScreen(p.x, p.y);
                const s2 = toScreen(next.x, next.y);
                const hovered = hoveredAlignEdge === i;
                const az = hovered ? edgeAlignedAzimuth(poly, i, location) : null;
                const mid = { sx: (s1.sx + s2.sx) / 2, sy: (s1.sy + s2.sy) / 2 };
                // World +y is north, screen +y is down - hence -cos.
                const tip = az != null ? { sx: mid.sx + Math.sin(az * Math.PI / 180) * 36, sy: mid.sy - Math.cos(az * Math.PI / 180) * 36 } : null;
                return (
                  <g key={`align-edge-${i}`}>
                    <line
                      x1={s1.sx} y1={s1.sy} x2={s2.sx} y2={s2.sy}
                      stroke={hovered ? '#e0873c' : '#2f6fed'}
                      strokeWidth={hovered ? 6 : 3}
                      style={{ pointerEvents: 'none' }}
                    />
                    {tip && (
                      <g style={{ pointerEvents: 'none' }}>
                        <line x1={mid.sx} y1={mid.sy} x2={tip.sx} y2={tip.sy} stroke="#e0873c" strokeWidth={2.5} />
                        <circle cx={tip.sx} cy={tip.sy} r={4} fill="#e0873c" />
                        <text x={tip.sx + 6} y={tip.sy - 6} fontSize={11} fontWeight={600} fill="#e0873c" stroke="#fff" strokeWidth={3} paintOrder="stroke">{Math.round(az!) % 360}°</text>
                      </g>
                    )}
                    <line
                      x1={s1.sx} y1={s1.sy} x2={s2.sx} y2={s2.sy}
                      stroke="transparent" strokeWidth={16}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredAlignEdge(i)}
                      onMouseLeave={() => setHoveredAlignEdge((h) => (h === i ? null : h))}
                      onClick={(e) => { e.stopPropagation(); pickAlignEdge(alignEdgeRoofId, i); }}
                    />
                  </g>
                );
              });
            })()}

            {/* The in-progress point count used to float in the left icon
                rail as its own text badge - it shifted every button below
                it up/down each time a point was added (or the badge itself
                appeared/disappeared), and sat far from the actual drawing.
                Anchored on the canvas next to the last placed point
                instead: it moves with the drawing and never touches the
                rail's own layout. */}
            {(() => {
              function pointCountBadge(points) {
                if (points.length === 0) return null;
                const last = points[points.length - 1];
                const s = toScreen(last.x, last.y);
                const label = `${points.length} pt${points.length === 1 ? '' : 's'}`;
                const w = 16 + label.length * 6;
                return (
                  <g transform={`translate(${s.sx + 10}, ${s.sy - 26})`} style={{ pointerEvents: 'none' }}>
                    <rect x={0} y={0} width={w} height={17} rx={4} fill="#fff" stroke="#2f6fed" strokeWidth={1} />
                    <text x={w / 2} y={12} fontSize={10} fontWeight={600} fill="#2f6fed" textAnchor="middle">{label}</text>
                  </g>
                );
              }
              // The "next" segment, from the last placed point to wherever
              // the pointer is right now - finer-dotted than the already-
              // placed segments (which use a wider dash) so it reads as
              // "not committed yet", with the angle it'd land at (0/90/180/
              // 270 = perfectly horizontal/vertical on screen) labeled at
              // its midpoint so a straight or clean-angle edge is easy to
              // line up by eye before clicking.
              function previewSegment(points) {
                if (points.length === 0 || !drawCursorWorld) return null;
                const last = points[points.length - 1];
                const a = toScreen(last.x, last.y);
                const b = toScreen(drawCursorWorld.x, drawCursorWorld.y);
                const dx = b.sx - a.sx, dy = b.sy - a.sy;
                if (Math.hypot(dx, dy) < 1) return null;
                const angleDeg = Math.round((((Math.atan2(-dy, dx) * 180) / Math.PI) + 360) % 360);
                const midX = (a.sx + b.sx) / 2, midY = (a.sy + b.sy) / 2;
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <line x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke="#2f6fed" strokeWidth={1.5} strokeDasharray="1.5 3" opacity={0.8} />
                    <circle cx={b.sx} cy={b.sy} r={4} fill="none" stroke="#2f6fed" strokeWidth={1.5} strokeDasharray="1.5 1.5" />
                    <g transform={`translate(${midX + 8}, ${midY - 8})`}>
                      <rect x={0} y={-11} width={30} height={15} rx={3} fill="#fff" stroke="#2f6fed" strokeWidth={1} />
                      <text x={15} y={0} fontSize={9} fontWeight={600} fill="#2f6fed" textAnchor="middle">{angleDeg}°</text>
                    </g>
                  </g>
                );
              }
              return (
                <>
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
                      {previewSegment(roofDrawPoints)}
                      {pointCountBadge(roofDrawPoints)}
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
                      {previewSegment(obstacleDrawPoints)}
                      {pointCountBadge(obstacleDrawPoints)}
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
                      {previewSegment(gridDrawPoints)}
                      {pointCountBadge(gridDrawPoints)}
                    </>
                  )}
                </>
              );
            })()}

            {/* Roof setup (step 3) is about the roof outline itself - any
                grids already packed on it are faded to a faint, non-
                interactive ghost so they don't hide the roof being edited,
                while still showing that they exist (several roof edits
                clear them - see ROOF_FIELDS_NEEDING_REPACK). Scene3D does
                the same via its ghostPanels prop. */}
            <g opacity={currentStep === 3 ? 0.15 : 1} style={currentStep === 3 ? { pointerEvents: 'none' } : undefined}>
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
              const overlappingIds = overlapPanelIdsByGrid[gridKey(roof.id, g.id)] || new Set();
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
                // Overlapping (an obstacle or another grid) is a light red
                // with a red outline; a panel picked for deletion stays the
                // solid red - so the two never read as the same state. In a
                // selected grid every panel goes blue (the whole grid reads
                // as selected), and an overlapping one keeps just the red
                // outline so the clash is still visible.
                const overlaps = overlappingIds.has(p.id);
                const overlapFill = overlaps && !gSelected;
                const gridAzimuth = slopeDirectionAzimuth(gridDirection(g, roof));
                const slopeRotation = gridAzimuth - 180;
                const rotation = -(p.rotation || 0) - (g.rotation || 0) + slopeRotation;
                const pct = pctMap?.[p.id];
                const w = p.w * scale, h = p.d * scale;
                const isMultiRow = (g.panelsPerRow ?? 1) > 1;
                const yInset = isMultiRow ? Math.min(1.5, h * 0.1) : 0;
                const rectY = s.sy + yInset;
                const rectH = Math.max(1, h - yInset * 2);
                const deletePicked = deleteModeActive && gridDeleteSelection && (
                  (gridDeleteMode === 'row' && gridDeleteSelection.rackY === p.rackY)
                  || (gridDeleteMode === 'column' && columnMatchIds?.has(p.id))
                  || (gridDeleteMode === 'panel' && gridDeleteSelection.panelIds?.includes(p.id))
                );
                return (
                  <g key={`${roof.id}-${g.id}-${p.id}`} transform={rotation ? `rotate(${rotation} ${center.sx} ${center.sy})` : undefined}>
                    <rect
                      x={s.sx} y={rectY} width={w} height={rectH}
                      fill={deletePicked ? '#c0392b' : overlapFill ? '#f5b7b1' : pct != null ? efficiencyColor(pct) : shaded ? '#e0873c' : (gSelected ? '#4a7dd8' : '#1c2b4a')}
                      // White at every state now (previously '#0a1428' when
                      // idle - nearly the same navy as the fill it sat on,
                      // so adjacent panels blurred into one slab instead of
                      // reading as separate modules; matches the white
                      // <Edges> the 3D view's own Panel now draws for the
                      // same reason).
                      stroke={!deletePicked && overlaps ? (gSelected ? '#e74c3c' : '#d9534f') : '#fff'} strokeWidth={deletePicked ? 2 : overlaps ? (gSelected ? 2 : 1.2) : gSelected ? 1.5 : 0.6}
                      // Editing a grid (drag/select/delete-mode picking)
                      // only belongs to Panel/Grid setup (step 4) - outside
                      // it (Roof setup in particular, where panels from an
                      // earlier pass through step 4 are still visible for
                      // context) these rects step out of the hit-test
                      // entirely, so a click meant for the roof beneath
                      // (selecting/dragging it, or placing a new obstacle)
                      // reaches it instead of grabbing the panel on top.
                      style={{ cursor: deleteModeActive ? 'pointer' : movingGrids ? 'grabbing' : 'pointer', pointerEvents: (currentStep !== 4 || placingGrid || addPanelsMode || addDrag) ? 'none' : 'auto' }}
                      onMouseDown={(e) => {
                        if (deleteModeActive) {
                          e.stopPropagation();
                          // Panel mode: Cmd(Mac)/Ctrl(Win)+click toggles the
                          // panel in/out of a multi-pick (pickPanelForDelete).
                          pickPanelForDelete(p, e.metaKey || e.ctrlKey);
                          return;
                        }
                        startGridDrag(e, roof.id, g.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {pct != null && w > 10 && h > 8 && (
                      <text
                        x={s.sx + w / 2} y={s.sy + h / 2} textAnchor="middle" dominantBaseline="middle"
                        fontSize={Math.min(w, h) * 0.4} fill={!deletePicked && overlapFill ? '#922b21' : '#fff'} style={{ pointerEvents: 'none', fontWeight: 600 }}
                      >
                        {pct}%
                      </text>
                    )}
                  </g>
                );
              });
            }))}
            </g>

            {/* Roof hovered in a RoofPickerList (Fill roof / Add grid by
                size) - drawn above the panels, since a roof's own fill sits
                underneath them and would be hidden on an already-filled roof. */}
            {hoveredPickRoofId != null && roofPolygons
              .filter((rp) => hoveredPickRoofId === 'all' || rp.id === hoveredPickRoofId)
              .map((rp) => (
                <polygon
                  key={`pick-highlight-${rp.id}`}
                  points={rp.polygon.map((p) => { const sp = toScreen(p.x, p.y); return `${sp.sx},${sp.sy}`; }).join(' ')}
                  fill="rgba(47,111,237,0.18)" stroke="#2f6fed" strokeWidth={3}
                  style={{ pointerEvents: 'none' }}
                />
              ))}

            {/* Rotate mode (the grid rail's Rotate popover is open): a
                curved double-arrow handle just outside each corner of the
                selected grid's real (rotated) outline - grab any of them to
                rotate about the grid's own pivot (startGridRotate, Shift
                snaps to 15°), with the live angle shown at the pivot while
                dragging. Replaces the old always-on single dot above the
                grid's center, which was easy to miss and gave no feedback. */}
            {currentStep === 4 && rightPanelOpenGroup === 'gridRotate' && selectedGrid && gridOwnerRoof && (() => {
              const bounds = gridLocalBounds(selectedGrid);
              if (!bounds) return null;
              const direction = gridDirection(selectedGrid, gridOwnerRoof);
              const pivot = gridPivot(selectedGrid);
              const rot = selectedGrid.rotation || 0;
              const toWorld = (pt) => rotateAroundPivot(toSlopeWorld(pt, direction), pivot, rot);
              const corners = [
                { x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY },
                { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY },
              ].map((c) => toScreen(toWorld(c).x, toWorld(c).y));
              return (
                <RotateHandles
                  corners={corners}
                  center={toScreen(pivot.x, pivot.y)}
                  dragging={rotatingGrids}
                  angleLabel={`${Math.round(rot)}°`}
                  onStart={startGridRotate}
                />
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
                // While placing/drawing anything, a click landing on an
                // existing obstacle belongs to that tool (e.g. pasting a
                // copy right on top of / next to its original) - let it
                // bubble to the plan instead of swallowing it here.
                if (placingShape || drawingRoof || placingGrid) return;
                e.stopPropagation();
                if (swallowClickAfterDragRef.current) { swallowClickAfterDragRef.current = false; return; }
                if (!placingShape && !drawingRoof) selectObstacle(o.id);
              };
              const obstacleCursor = (drawingRoof || placingShape || placingGrid) ? 'inherit' : (movingObstacle && selected ? 'grabbing' : 'grab');
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
                    style={{ cursor: obstacleCursor }}
                    onMouseDown={(e) => startObstacleDrag(e, o.id)}
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
                    style={{ cursor: obstacleCursor }}
                    onMouseDown={(e) => startObstacleDrag(e, o.id)}
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
                  style={{ cursor: obstacleCursor }}
                  transform={`rotate(${-o.rotation} ${s.sx} ${s.sy})`}
                  onMouseDown={(e) => startObstacleDrag(e, o.id)}
                  onClick={handleSelectObstacle}
                />
              );
            })}

            {/* Corner handles for the selected drawn obstacle, drawn right
                after the obstacles themselves so they sit on top - same
                look/feel as the roof's own vertex handles (wide invisible
                hit-circle + small visible dot that fills on hover/drag). */}
            {selectedObstacle?.shape === 'polygon' && selectedObstacle.polygon && !drawingRoof && !placingShape && !placingGrid && selectedObstacle.polygon.map((p, i) => {
              const s = toScreen(p.x, p.y);
              const dragging = draggingObstacleVertex === i;
              const hovered = hoveredObstacleVertex === i;
              return (
                <g key={`obstacle-vertex-${i}`}>
                  <circle
                    cx={s.sx} cy={s.sy} r={12}
                    fill="transparent"
                    style={{ cursor: dragging ? 'grabbing' : 'pointer' }}
                    onMouseDown={(e) => startObstacleVertexDrag(e, i)}
                    onMouseEnter={() => setHoveredObstacleVertex(i)}
                    onMouseLeave={() => setHoveredObstacleVertex((h) => (h === i ? null : h))}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <circle
                    cx={s.sx} cy={s.sy} r={dragging ? 6 : 4.5}
                    fill={dragging || hovered ? '#2f6fed' : '#fff'}
                    stroke="#2f6fed" strokeWidth={2}
                    style={{ pointerEvents: 'none' }}
                  />
                </g>
              );
            })}

            {/* Copy click-to-place preview: the copied obstacle's outline,
                dashed, centred on the pointer. */}
            {placingShape === 'copy' && obstacleClipboard && drawCursorWorld && (() => {
              const src = obstacleClipboard;
              const dx = drawCursorWorld.x - src.x, dy = drawCursorWorld.y - src.y;
              const style = { fill: 'rgba(47,111,237,0.18)', stroke: '#2f6fed', strokeWidth: 1.5, strokeDasharray: '5 4', pointerEvents: 'none' as const };
              if (src.shape === 'polygon' && src.polygon) {
                return <polygon points={src.polygon.map((p) => { const sp = toScreen(p.x + dx, p.y + dy); return `${sp.sx},${sp.sy}`; }).join(' ')} {...style} style={{ pointerEvents: 'none' }} />;
              }
              const c = toScreen(drawCursorWorld.x, drawCursorWorld.y);
              if (src.shape === 'box') {
                const w = src.width * scale, d = src.depth * scale;
                return <rect x={c.sx - w / 2} y={c.sy - d / 2} width={w} height={d} transform={`rotate(${-(src.rotation || 0)} ${c.sx} ${c.sy})`} {...style} style={{ pointerEvents: 'none' }} />;
              }
              return <circle cx={c.sx} cy={c.sy} r={Math.max((src.radius || 0.5) * scale, 5)} {...style} style={{ pointerEvents: 'none' }} />;
            })()}

            {/* Obstacle rotate mode (its Rotate popover is open) - same
                corner-arrow handles as a grid's (RotateHandles). */}
            {rightPanelOpenGroup === 'obstacleRotate' && isRotatableObstacle(selectedObstacle) && !drawingRoof && !placingShape && !placingGrid && (() => {
              const { pivot, corners } = obstacleRotateFrame(selectedObstacle);
              const angle = selectedObstacle.shape === 'box'
                ? Math.round(selectedObstacle.rotation || 0)
                : Math.round(longEdgeAngle(selectedObstacle.polygon));
              return (
                <RotateHandles
                  corners={corners.map((c) => toScreen(c.x, c.y))}
                  center={toScreen(pivot.x, pivot.y)}
                  dragging={rotatingObstacle}
                  angleLabel={`${angle}°`}
                  onStart={startObstacleRotate}
                />
              );
            })()}

            {/* Adding to the selected grid. A green "+" just outside the
                middle of each side (gridSideHandles): click adds one row
                (front/back) or column (left/right); drag outward to add more -
                a live ghost shows what lands (green) and what's skipped for
                falling off the roof's usable area or into an obstacle (red),
                with a running count. Add -> Panels shows free slots around the
                grid instead: click or drag across them to pick, Enter to add. */}
            {addDragPreview && addDragPreview.ghosts.map((gh) => (
              <polygon
                key={`add-ghost-${gh.key}`}
                points={gh.corners.map((c) => { const sp = toScreen(c.x, c.y); return `${sp.sx},${sp.sy}`; }).join(' ')}
                fill={gh.ok ? 'rgba(34,197,94,0.35)' : 'rgba(220,38,38,0.16)'}
                stroke={gh.ok ? '#16a34a' : '#dc2626'} strokeWidth={1.2} strokeDasharray={gh.ok ? undefined : '4 3'}
                style={{ pointerEvents: 'none' }}
              />
            ))}
            {(() => {
              // One size for all four handles: from the smaller of the row and
              // column steps on screen (each side used its own before, so row
              // and column handles came out different sizes).
              const stepLens = selectedGridHandles.map((h) => {
                const a = toScreen(h.mid.x, h.mid.y), b = toScreen(h.mid.x + h.step.x, h.mid.y + h.step.y);
                return Math.hypot(b.sx - a.sx, b.sy - a.sy);
              }).filter((l) => l > 0);
              const handleR = stepLens.length ? Math.max(3.5, Math.min(10, Math.min(...stepLens) * 0.45)) : 10;
              return selectedGridHandles.map((h) => {
              const m = toScreen(h.mid.x, h.mid.y);
              const e2 = toScreen(h.mid.x + h.step.x, h.mid.y + h.step.y);
              const stepPx = { x: e2.sx - m.sx, y: e2.sy - m.sy };
              const len = Math.hypot(stepPx.x, stepPx.y) || 1;
              const ux = stepPx.x / len, uy = stepPx.y / len;
              // Sized from one row/column step on screen (roughly a panel),
              // capped at the normal 10px - zoomed far out, a fixed-size
              // handle dwarfed the grid it belongs to.
              const r = handleR;
              const c = { sx: m.sx + ux * (r + 6), sy: m.sy + uy * (r + 6) };
              const active = addDrag?.side === h.side;
              const fill = active ? '#15803d' : '#16a34a';
              const rr = active ? r * 1.2 : r;
              const arm = r * 0.45;
              return (
                <g key={`add-handle-${h.side}`}>
                  <circle cx={c.sx} cy={c.sy} r={rr} fill={fill} stroke="#fff" strokeWidth={Math.max(1, r * 0.2)} style={{ pointerEvents: 'none' }} />
                  <path d={`M ${c.sx - arm} ${c.sy} H ${c.sx + arm} M ${c.sx} ${c.sy - arm} V ${c.sy + arm}`} stroke="#fff" strokeWidth={Math.max(1, r * 0.22)} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                  <circle
                    cx={c.sx} cy={c.sy} r={Math.max(8, r + 5)} fill="transparent" style={{ cursor: 'pointer' }}
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); startAddDrag(gridOwnerRoof.id, selectedGrid.id, h.side, e.clientX, e.clientY, stepPx, '2d'); }}
                    onMouseEnter={() => setHoveredAddHandle(h.side)}
                    onMouseLeave={() => setHoveredAddHandle((cur) => (cur === h.side ? null : cur))}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {/* Hover hint (while not dragging - the drag shows its own count). */}
                  {!addDrag && hoveredAddHandle === h.side && (
                    <text
                      x={c.sx + ux * (r + 10)} y={c.sy + uy * (r + 10) + 4} textAnchor={ux > 0.5 ? 'start' : ux < -0.5 ? 'end' : 'middle'}
                      fontSize={12} fontWeight={700} fill="#14532d" stroke="#fff" strokeWidth={3} paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}
                    >
                      {h.axis === 'row' ? 'Add row' : 'Add column'}
                    </text>
                  )}
                  {active && addDragPreview && (
                    // Past the far end of the preview, not over it.
                    <text
                      x={c.sx + stepPx.x * addDrag.count + ux * (r + 12)} y={c.sy + stepPx.y * addDrag.count + uy * (r + 12) + 4} textAnchor={ux > 0.5 ? 'start' : ux < -0.5 ? 'end' : 'middle'}
                      fontSize={12} fontWeight={700} fill="#14532d" stroke="#fff" strokeWidth={3} paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}
                    >
                      {addDragPreview.label}
                    </text>
                  )}
                </g>
              );
              });
            })()}
            {addPanelsMode && addPanelSlots.map((slot) => {
              const picked = addPanelsPicks.has(slot.key);
              return (
                <polygon
                  key={`add-slot-${slot.key}`}
                  points={slot.corners.map((c) => { const sp = toScreen(c.x, c.y); return `${sp.sx},${sp.sy}`; }).join(' ')}
                  fill={picked ? 'rgba(34,197,94,0.55)' : 'rgba(34,197,94,0.07)'}
                  stroke="#16a34a" strokeWidth={picked ? 1.6 : 1} strokeDasharray={picked ? undefined : '4 3'}
                  style={{ cursor: 'pointer' }}
                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); paintSlot(slot.key, true); }}
                  onMouseEnter={() => paintSlot(slot.key, false)}
                  onClick={(e) => e.stopPropagation()}
                />
              );
            })}

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
              const poly = rp.polygon;
              const xs = poly.map((p) => p.x);
              const ys = poly.map((p) => p.y);
              const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
              const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
              // Cardinal reference for the slope direction (downhill towards eave)
              const ref = { N: { x: 0, y: 1 }, S: { x: 0, y: -1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 } }[roof.slopeDirection || 'S'];
              // Find the polygon edge whose outward normal best aligns with the
              // cardinal slope direction — that edge is the eave, and its normal
              // is the roof's actual downhill axis. For axis-aligned roofs this is
              // identical to the cardinal vector; for rotated roofs it follows the
              // polygon's own geometry so the arrow lies along the drawn slope.
              let dir = ref;
              let bestDot = -1;
              for (let i = 0; i < poly.length; i++) {
                const a = poly[i], b = poly[(i + 1) % poly.length];
                const ex = b.x - a.x, ey = b.y - a.y;
                const len = Math.hypot(ex, ey);
                if (len < 1e-9) continue;
                const nx = -ey / len, ny = ex / len;
                const d = nx * ref.x + ny * ref.y;
                if (Math.abs(d) > bestDot) {
                  bestDot = Math.abs(d);
                  dir = { x: nx * Math.sign(d), y: ny * Math.sign(d) };
                }
              }
              // Arrow length is 60 % of the polygon's extent along the slope axis
              const projections = poly.map((p) => (p.x - cx) * dir.x + (p.y - cy) * dir.y);
              const halfLen = (Math.max(...projections) - Math.min(...projections)) * 0.3;
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
              placing grids. Desktop only: it's a small floating corner
              overlay there, but that same treatment on a phone screen
              covers real map/canvas area with text - mobile instead gets
              an in-flow block below the canvas (see further down, after
              this canvas box closes) sharing the same renderLayoutSummary
              content. */}
          {!isMobile && currentStep === 4 && totalPanelCount > 0 && (
            <div style={{ position: 'absolute', left: 12, bottom: viewMode === '3d' ? 88 : 12, zIndex: 6, ...sectionStyle, padding: '6px 10px', fontSize: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>
              {renderLayoutSummary()}
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
              selected. On mobile, a selected roof/grid/obstacle's full
              icon list can run taller than the screen (compass + name +
              5-6 property icons) - `bottom: 12` alongside `top: 12` caps
              the column to the canvas's own height and `overflowY: auto`
              scrolls the rest into view, instead of it just running off
              the bottom with no way to reach it. Desktop is tall enough
              that this never triggers, so it keeps the old unbounded
              column. Each icon's own popover still opens fine while this
              scrolls (see RailPopover's own comment - `position: fixed`
              on mobile escapes this container's clipping). */}
          {(() => {
            const toggleGroup = (key) => {
              cancelActiveModes();
              setRightPanelOpenGroup((g) => (g === key ? null : key));
            };

            return (
              <div
                className="tooltip-left"
                style={{
                  position: 'absolute', top: 12, right: 12, zIndex: 6,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  // `maxHeight` (not `bottom`, which forced this box to
                  // always span the full canvas height even with only the
                  // compass in it) - an empty stretch below a short icon
                  // list was still part of this div's own hit-testable
                  // box, so a touch-scroll starting there got captured by
                  // this rail (nested inside its own scroll container)
                  // instead of bubbling to the page underneath, making the
                  // mobile stats block below the canvas unreachable unless
                  // you'd already scrolled the rail's own list to its end
                  // first. Sizing to content (capped, not forced) keeps
                  // the dead zone limited to whatever's actually visible.
                  ...(isMobile ? { maxHeight: 'calc(100% - 24px)' } : {}),
                }}
              >
                {/* Orientation legend - in the 2D plan, north is always up
                    (toScreen never rotates, see geoConvert.js's x=east/
                    y=north convention), so the whole dial stays fixed. The
                    3D view's camera orbits freely, so there north isn't a
                    fixed screen direction any more: the dial instead
                    rotates live to keep its "N" pointing at true north,
                    driven by compass3DAngleDeg (see Scene3D.jsx's
                    compassAngleDeg, reported through onCompassAngleChange).
                    Sized up from the original 40px box - illegible at that
                    size once it had to double as a real reference in 3D,
                    not just a static corner icon. */}
                <div
                  data-tooltip={viewMode === 'plan' ? 'Plan view: north is up' : 'Compass: needle points true north'}
                  aria-label={viewMode === 'plan' ? 'Compass: north is up' : 'Compass: needle points true north'}
                  style={{ width: isMobile ? 44 : 60, height: isMobile ? 44 : 60, borderRadius: 10, background: '#fff', border: '1px solid #ccc', boxShadow: 'var(--app-shadow, 0 1px 3px rgba(16,24,40,0.08))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <svg width={isMobile ? 34 : 46} height={isMobile ? 34 : 46} viewBox="0 0 36 36">
                    <g transform={viewMode === '3d' && compass3DAngleDeg ? `rotate(${compass3DAngleDeg} 18 18)` : undefined}>
                      <circle cx="18" cy="18" r="13" fill="#fafafa" stroke="#ddd" strokeWidth="1" />
                      <line x1="18" y1="18" x2="18" y2="11" stroke="#e0873c" strokeWidth="2" />
                      <polygon points="18,7 15,12 21,12" fill="#e0873c" />
                      <text x="18" y="6" fontSize="6.5" fontWeight="700" textAnchor="middle" fill="#e0873c">N</text>
                      <text x="18" y="33" fontSize="6.5" textAnchor="middle" fill="#888">S</text>
                      <text x="4" y="20" fontSize="6.5" textAnchor="middle" fill="#888">W</text>
                      <text x="32" y="20" fontSize="6.5" textAnchor="middle" fill="#888">E</text>
                    </g>
                  </svg>
                </div>

                {/* Everything below the compass (a selected roof/grid/
                    obstacle's own property icons) scrolls on its own on
                    mobile - `display: contents` on desktop makes this
                    wrapper a no-op there, so its children stay direct
                    flex items of the rail exactly as before. The compass
                    above stays outside this wrapper so it never scrolls
                    out of view itself. No `flex: 1` - that forced this to
                    fill all leftover space in the rail (see the rail's
                    own `maxHeight` comment above) even with little or no
                    content; sizing to content, with `minHeight: 0` letting
                    it shrink below that against the rail's own maxHeight
                    when there IS enough content to need scrolling. */}
                <div style={isMobile
                  ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minHeight: 0, overflowY: 'auto', width: '100%', paddingBottom: 4 }
                  : { display: 'contents' }}>
                {selectedRoof && (() => {
                  const roofIdx = roofs.findIndex((r) => r.id === selectedRoof.id);
                  // Drawn roofs measure/resize along their own sides (see
                  // orientedRoofExtents), framed by the auto azimuth rather
                  // than any manual override so the axes always follow the
                  // building itself.
                  const frameAz = selectedRoof.polygon ? autoRoofAzimuth(selectedRoof, location) : 0;
                  const bounds = selectedRoof.polygon ? orientedRoofExtents(selectedRoof.polygon, frameAz) : null;
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
                        <button data-tooltip="Dimensions" aria-label="Dimensions" className={iconBtn(rightPanelOpenGroup === 'roofDims')} onClick={() => toggleGroup('roofDims')}><RulerIcon /></button>
                        <RailPopover open={rightPanelOpenGroup === 'roofDims'} width={300}>
                            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Dimensions</div>
                            <div style={sliderRowStyle}>{sliderRowLabel('Width', units)}<SliderInput unit={units} numberWidth={58} min={1} max={150} step={0.1} value={bounds ? +bounds.width.toFixed(1) : selectedRoof.width} onChange={(v) => resizeRoof(selectedRoof.id, 'width', v)} /></div>
                            <div style={sliderRowStyle}>{sliderRowLabel('Length', units)}<SliderInput unit={units} numberWidth={58} min={1} max={150} step={0.1} value={bounds ? +bounds.length.toFixed(1) : selectedRoof.length} onChange={(v) => resizeRoof(selectedRoof.id, 'length', v)} /></div>
                            <div style={sliderRowStyle}>{sliderRowLabel(selectedRoof.type === 'pitched' ? 'Building height (eave)' : 'Building height', units)}<SliderInput unit={units} numberWidth={58} min={0} max={50} step={0.5} value={selectedRoof.buildingHeight} onChange={(v) => updateRoof(selectedRoof.id, 'buildingHeight', v)} /></div>
                            {selectedRoof.type === 'pitched' && (
                              // A pitched roof's building height is its eave (the low
                              // edge, where the deck starts climbing); the ridge is
                              // derived from the pitch and depth - shown read-only so
                              // "which side is the height?" never needs guessing.
                              <div style={{ fontSize: 11, color: '#555', margin: '-4px 0 8px' }}>
                                Ridge (highest point): {formatLength(Math.max(...getRoofPolygon(selectedRoof).map((p) => roofSurfaceHeightAt(selectedRoof, p))), units, 1)} at {selectedRoof.pitchDeg ?? 0}° pitch
                              </div>
                            )}
                            <div style={sliderRowStyle}>{sliderRowLabel('Boundary', units)}<SliderInput unit={units} numberWidth={58} min={0} max={5} step={0.1} value={selectedRoof.boundaryHeight ?? 0} onChange={(v) => updateRoof(selectedRoof.id, 'boundaryHeight', v)} /></div>
                            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                              {selectedRoof.polygon
                                ? `${selectedRoof.polygon.length} points. Width runs along the panel rows, length across them — or drag corner handles on the 2D plan.`
                                : 'Drag corner handles on the 2D plan to resize.'}
                            </div>
                        </RailPopover>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Panel margin" aria-label="Panel margin" className={iconBtn(rightPanelOpenGroup === 'roofMargin')} onClick={() => toggleGroup('roofMargin')}><MarginIcon /></button>
                        <RailPopover open={rightPanelOpenGroup === 'roofMargin'} width={300}>
                            {(() => {
                              const editing = marginEditRoofId === selectedRoof.id;
                              const defaultMargin = selectedRoof.edgeMargin ?? 0.1;
                              const overrides = selectedRoof.edgeMarginOverrides || {};
                              const edgeCount = getRoofPolygon(selectedRoof).length;
                              // Only indices that still exist on the current outline -
                              // a stale override on a since-removed vertex is ignored by
                              // the packer too, so listing it would just confuse.
                              const overrideList = Object.keys(overrides)
                                .map(Number)
                                .filter((i) => i < edgeCount && overrides[i] != null)
                                .sort((x, y) => x - y);
                              const sel = [...selectedMarginEdges];
                              const selValue = sel.length ? (overrides[sel[0]] ?? defaultMargin) : defaultMargin;
                              const selHasOverride = sel.some((i) => overrides[i] != null);
                              return (
                                <>
                                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Panel margin</div>
                                  <div style={sliderRowStyle}>
                                    {sliderRowLabel('Default', units)}
                                    <SliderInput unit={units} numberWidth={58} min={0} max={3} step={0.05} value={defaultMargin} onChange={(v) => updateRoof(selectedRoof.id, 'edgeMargin', v)} />
                                  </div>

                                  <button
                                    className={btn(editing)}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 10px', marginTop: 2 }}
                                    onClick={() => {
                                      cancelActiveModes();
                                      if (!editing) setMarginEditRoofId(selectedRoof.id);
                                    }}
                                  >
                                    <MarginIcon size={14} />
                                    {editing ? 'Done picking edges' : 'Override specific edges'}
                                  </button>

                                  {editing && (
                                    <div style={{ background: '#f6f0fb', borderRadius: 6, padding: 8, marginTop: 8 }}>
                                      {sel.length === 0 ? (
                                        <div style={{ fontSize: 11, color: '#8e44ad', lineHeight: 1.4 }}>
                                          Click edges on the 2D plan to select them (shift-click to add more).
                                        </div>
                                      ) : (
                                        <>
                                          <div style={sliderRowStyle}>
                                            {sliderRowLabel(`${sel.length} edge${sel.length === 1 ? '' : 's'}`, units)}
                                            <SliderInput unit={units} numberWidth={58} min={0} max={3} step={0.05} value={selValue} onChange={(v) => setEdgeMarginOverrides(selectedRoof.id, sel, v)} />
                                          </div>
                                          <button
                                            className={btn(false)}
                                            disabled={!selHasOverride}
                                            style={{ width: '100%' }}
                                            onClick={() => setEdgeMarginOverrides(selectedRoof.id, sel, null)}
                                          >
                                            ↺ Use default for selected
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}

                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>Edge overrides</span>
                                    {overrideList.length > 0 && (
                                      <button
                                        className={btn(false)}
                                        style={{ padding: '2px 8px', fontSize: 10 }}
                                        onClick={() => setEdgeMarginOverrides(selectedRoof.id, overrideList, null)}
                                      >
                                        Reset all
                                      </button>
                                    )}
                                  </div>
                                  {overrideList.length === 0 ? (
                                    <div style={{ fontSize: 11, color: '#999' }}>None — every edge uses the default.</div>
                                  ) : (
                                    <div className="pde-override-list">
                                      {overrideList.map((i) => (
                                        <div
                                          key={i}
                                          className={`pde-override-row${hoveredOverrideEdge === i ? ' pde-hover' : ''}`}
                                          onMouseEnter={() => setHoveredOverrideEdge(i)}
                                          onMouseLeave={() => setHoveredOverrideEdge((h) => (h === i ? null : h))}
                                        >
                                          <span className="pde-override-dot">{i + 1}</span>
                                          <span style={{ flex: 1 }}>Edge {i + 1}</span>
                                          <span style={{ fontWeight: 600, color: '#8e44ad' }}>{formatLength(overrides[i], units, 2)}</span>
                                          <button
                                            aria-label={`Reset edge ${i + 1} to default`}
                                            data-tooltip="Use default"
                                            className="pde-override-remove"
                                            onClick={() => setEdgeMarginOverrides(selectedRoof.id, [i], null)}
                                          >
                                            <CloseIcon size={12} />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                        </RailPopover>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Roof type" aria-label="Roof type" className={iconBtn(rightPanelOpenGroup === 'roofType')} onClick={() => toggleGroup('roofType')}><PitchedRoofIcon /></button>
                        <RailPopover open={rightPanelOpenGroup === 'roofType'}>
                            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Roof type</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              {[
                                { value: 'flat', label: 'Flat', Icon: FlatRoofIcon },
                                { value: 'pitched', label: 'Pitched', Icon: PitchedRoofIcon },
                              ].map(({ value, label, Icon }) => (
                                <button
                                  key={value}
                                  aria-pressed={selectedRoof.type === value}
                                  className={btn(selectedRoof.type === value)}
                                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 8px', fontSize: 12 }}
                                  onClick={() => updateRoof(selectedRoof.id, 'type', value)}
                                >
                                  <Icon size={22} />
                                  {label}
                                </button>
                              ))}
                            </div>
                            {selectedRoof.type === 'pitched' && (
                              <>
                                <div style={{ ...labelStyle, marginTop: 12 }}><span>pitch (°)</span><SliderInput min={0} max={60} step={1} value={selectedRoof.pitchDeg} onChange={(v) => updateRoof(selectedRoof.id, 'pitchDeg', v)} /></div>
                                <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'flex-start' }}>
                                  <div>
                                    <div style={{ fontSize: 12, color: '#555', marginBottom: 3 }}>Slope direction</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 22px)', gridTemplateRows: 'repeat(3, 22px)', gap: 2 }}>
                                      <span />
                                      <button
                                        className={compassBtn(selectedRoof.slopeDirection === 'N')}
                                        style={{ gridColumn: 2, gridRow: 1 }}
                                        onClick={() => updateRoof(selectedRoof.id, 'slopeDirection', 'N')}
                                        title="Slope facing North (up)"
                                      >↑</button>
                                      <span />
                                      <button
                                        className={compassBtn(selectedRoof.slopeDirection === 'W')}
                                        style={{ gridColumn: 1, gridRow: 2 }}
                                        onClick={() => updateRoof(selectedRoof.id, 'slopeDirection', 'W')}
                                        title="Slope facing West (left)"
                                      >←</button>
                                      <span style={{ gridColumn: 2, gridRow: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#bbb' }}>⌂</span>
                                      <button
                                        className={compassBtn(selectedRoof.slopeDirection === 'E')}
                                        style={{ gridColumn: 3, gridRow: 2 }}
                                        onClick={() => updateRoof(selectedRoof.id, 'slopeDirection', 'E')}
                                        title="Slope facing East (right)"
                                      >→</button>
                                      <span />
                                      <button
                                        className={compassBtn(selectedRoof.slopeDirection === 'S')}
                                        style={{ gridColumn: 2, gridRow: 3 }}
                                        onClick={() => updateRoof(selectedRoof.id, 'slopeDirection', 'S')}
                                        title="Slope facing South (down)"
                                      >↓</button>
                                      <span />
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                        </RailPopover>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Azimuth" aria-label="Azimuth" className={iconBtn(rightPanelOpenGroup === 'roofAzimuth')} onClick={() => toggleGroup('roofAzimuth')}><CompassIcon /></button>
                        <RailPopover open={rightPanelOpenGroup === 'roofAzimuth'}>
                            {(() => {
                              const az = getRoofAzimuth(selectedRoof, location);
                              const equatorAz = location.lat >= 0 ? 180 : 0;
                              const off = Math.round(azimuthOffset(az, equatorAz));
                              const aligning = alignEdgeRoofId === selectedRoof.id;
                              const isManual = selectedRoof.azimuth != null;
                              const dirWord = equatorAz === 180 ? 'south' : 'north';
                              return (
                                <>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span style={{ fontWeight: 600, fontSize: 12 }}>Azimuth</span>
                                    <span className={`pde-azimuth-badge${isManual ? ' pde-manual' : ''}`}>{isManual ? 'Manual' : 'Auto'}</span>
                                  </div>
                                  <div style={labelStyle}>
                                    <span style={{ whiteSpace: 'nowrap' }}>facing (°)</span>
                                    <SliderInput min={0} max={359} step={1} value={Math.round(az) % 360} onChange={(v) => updateRoof(selectedRoof.id, 'azimuth', v)} />
                                  </div>
                                  <div style={{ fontSize: 11, color: off > 45 ? '#c0392b' : '#888', marginBottom: 10 }}>
                                    {off === 0 ? `Due ${dirWord}` : `${off}° off ${dirWord}`}
                                    {off > 45 ? ' — expect noticeably lower yield' : ''}
                                  </div>
                                  {(() => {
                                    // Pitched roofs fill from the edge nearest this
                                    // azimuth (packingAzimuth) - say so when that
                                    // isn't the exact angle typed.
                                    const packed = packingAzimuth(selectedRoof, location);
                                    if (selectedRoof.type !== 'pitched' || azimuthOffset(packed, az) < 0.5) return null;
                                    return (
                                      <div style={{ fontSize: 11, color: '#888', marginTop: -6, marginBottom: 10 }}>
                                        Pitched roof: panels fill from the nearest edge, facing {Math.round(packed) % 360}°
                                      </div>
                                    );
                                  })()}
                                  <button
                                    className={btn(aligning)}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 10px' }}
                                    onClick={() => {
                                      // Cancels any other active mode first, but leaves this
                                      // popover open so the hint below stays visible.
                                      cancelActiveModes();
                                      if (!aligning) setAlignEdgeRoofId(selectedRoof.id);
                                    }}
                                  >
                                    <AlignEdgeIcon size={14} />
                                    {aligning ? 'Picking edge… click to cancel' : 'Align to roof edge'}
                                  </button>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                                    <button
                                      className={btn(false)}
                                      disabled={!isManual}
                                      title={isManual ? 'Face the opposite side of the same rows' : 'Set an azimuth first'}
                                      onClick={() => updateRoof(selectedRoof.id, 'azimuth', Math.round(((az + 180) % 360) * 100) / 100)}
                                    >
                                      ⇅ Flip 180°
                                    </button>
                                    <button
                                      className={btn(false)}
                                      disabled={!isManual}
                                      title={isManual ? 'Go back to the auto-calculated azimuth' : 'Already on auto'}
                                      onClick={() => updateRoof(selectedRoof.id, 'azimuth', null)}
                                    >
                                      ↺ Reset to auto
                                    </button>
                                  </div>
                                  <div style={{ fontSize: 11, color: '#888', marginTop: 8, lineHeight: 1.4 }}>
                                    {aligning
                                      ? 'Click a roof edge on the 2D plan — panel rows will run parallel to it.'
                                      : '0° N · 90° E · 180° S · 270° W. Changing it clears this roof\'s panels so you can re-fill.'}
                                  </div>
                                </>
                              );
                            })()}
                        </RailPopover>
                      </div>

                      <button
                        data-tooltip={mirrorRoofId === selectedRoof.id ? 'Click an edge on the plan to mirror across it (click again to cancel)' : 'Mirror this roof across an edge'}
                        aria-label="Mirror this roof"
                        className={iconBtn(mirrorRoofId === selectedRoof.id)}
                        onClick={() => {
                          const isSelf = mirrorRoofId === selectedRoof.id;
                          cancelActiveModes();
                          if (!isSelf) {
                            setMirrorRoofId(selectedRoof.id);
                          }
                        }}
                      ><MirrorIcon /></button>
                      <button data-tooltip="Remove this roof" aria-label="Remove this roof" className={`${iconBtn(false)} pde-danger`} onClick={() => removeRoof(selectedRoof.id)}><TrashIcon /></button>
                      <button data-tooltip="Deselect" aria-label="Deselect" className={iconBtn(false)} onClick={() => setSelectedRoofId(null)}><CloseIcon /></button>
                    </>
                  );
                })()}

                {selectedObstacle && (() => {
                  const isCutout = selectedObstacle.label === 'Cutout';
                  const isTree = selectedObstacle.label === 'Tree';
                  const isDrawn = selectedObstacle.shape === 'polygon';
                  // Skylights/walkways sit (near-)flush with the deck - a
                  // 0-30m slider would make their few-cm heights unsettable.
                  const isFlush = selectedObstacle.label === 'Skylight' || selectedObstacle.label === 'Walkway';
                  return (
                    <>
                      <div style={{ fontSize: 10, color: '#555', fontWeight: 600, textAlign: 'center' }}>{selectedObstacle.label}</div>

                      {/* Every obstacle sizes through one Dimensions popover
                          (same aligned slider rows as the roof's own), with
                          fields per shape: tree height + canopy radius, other
                          cylinders height + radius, boxes width/depth/height/
                          rotation, drawn (polygon) shapes height + boundary.
                          Position comes from dragging on the plan
                          (startObstacleDrag), never typed-in x/y. */}
                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Dimensions" aria-label="Dimensions" className={iconBtn(rightPanelOpenGroup === 'obstacleDims')} onClick={() => toggleGroup('obstacleDims')}><RulerIcon /></button>
                        <RailPopover open={rightPanelOpenGroup === 'obstacleDims'} width={300}>
                            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Dimensions</div>
                            {isTree ? (
                              <>
                                  <div style={sliderRowStyle}>{sliderRowLabel('Height', units)}<SliderInput unit={units} numberWidth={58} min={0.5} max={30} step={0.1} value={selectedObstacle.height} onChange={(v) => updateObstacle(selectedObstacle.id, 'height', v)} /></div>
                                  <div style={sliderRowStyle}>{sliderRowLabel('Canopy radius', units)}<SliderInput unit={units} numberWidth={58} min={0.2} max={15} step={0.1} value={selectedObstacle.radius} onChange={(v) => updateObstacle(selectedObstacle.id, 'radius', v)} /></div>
                                  {(() => {
                                    // Trunk height: auto (a fixed share of the height) until
                                    // set by hand. Canopy height is what's left - shown, not
                                    // edited, so it can't disagree with the total. A hand-set
                                    // trunk also lifts the tree's shadow off its base in the
                                    // shading math (see treeTrunkHeight / shadowPolygon).
                                    const { trunk, manual } = treeTrunkHeight(selectedObstacle);
                                    return (
                                      <>
                                        <div style={sliderRowStyle}>{sliderRowLabel(manual ? 'Trunk height' : 'Trunk (auto)', units)}<SliderInput unit={units} numberWidth={58} min={0} max={+(selectedObstacle.height * 0.9).toFixed(1)} step={0.1} value={+trunk.toFixed(1)} onChange={(v) => updateObstacle(selectedObstacle.id, 'trunkHeight', v)} /></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11, color: '#555', margin: '-4px 0 6px' }}>
                                          <span>Canopy: {formatLength(Math.max(0, selectedObstacle.height - trunk), units, 1)} tall</span>
                                          {manual && (
                                            <button
                                              onClick={() => updateObstacle(selectedObstacle.id, 'trunkHeight', null)}
                                              style={{ border: 'none', background: 'none', color: '#2f6fed', cursor: 'pointer', fontSize: 11, padding: 0 }}
                                            >
                                              reset to auto
                                            </button>
                                          )}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#888', lineHeight: 1.4 }}>
                                          {manual
                                            ? 'Shading treats only the canopy as solid, so low sun can pass under it.'
                                            : 'Auto: 35% of the height. Set it to model a high canopy (e.g. a coconut palm) - shading then lets low sun pass under it.'}
                                        </div>
                                      </>
                                    );
                                  })()}
                                  <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Drag it on the 2D plan to move it.</div>
                                </>
                            ) : isDrawn ? (
                              <>
                                  {(() => {
                                    const ext = orientedRoofExtents(selectedObstacle.polygon, longestEdgeFrameAzimuth(selectedObstacle.polygon));
                                    return (
                                      <>
                                        <div style={sliderRowStyle}>{sliderRowLabel('Length', units)}<SliderInput unit={units} numberWidth={58} min={0.1} max={50} step={0.05} value={+ext.width.toFixed(2)} onChange={(v) => resizeObstacle(selectedObstacle.id, 'length', v)} /></div>
                                        <div style={sliderRowStyle}>{sliderRowLabel('Width', units)}<SliderInput unit={units} numberWidth={58} min={0.1} max={50} step={0.05} value={+ext.length.toFixed(2)} onChange={(v) => resizeObstacle(selectedObstacle.id, 'width', v)} /></div>
                                      </>
                                    );
                                  })()}
                                  {/* A Cutout has no height of its own (see
                                      OBSTACLE_PRESETS.cutout) - it removes the
                                      full building height - so no sliders, just
                                      a note, rather than an inert 0. */}
                                  {isCutout ? (
                                    <div style={{ fontSize: 11, color: '#555', lineHeight: 1.4, marginBottom: 4 }}>
                                      A cutout removes this area through the full building height, so it has no height to set.
                                    </div>
                                  ) : (
                                    <>
                                      <div style={sliderRowStyle}>{sliderRowLabel('Height', units)}<SliderInput unit={units} numberWidth={58} min={isFlush ? 0 : 0.1} max={isFlush ? 2 : 30} step={isFlush ? 0.01 : 0.1} value={selectedObstacle.height} onChange={(v) => updateObstacle(selectedObstacle.id, 'height', v)} /></div>
                                      <div style={sliderRowStyle}>{sliderRowLabel('Boundary', units)}<SliderInput unit={units} numberWidth={58} min={0} max={5} step={0.1} value={selectedObstacle.boundaryHeight ?? 0} onChange={(v) => updateObstacle(selectedObstacle.id, 'boundaryHeight', v)} /></div>
                                    </>
                                  )}
                                  <div style={{ fontSize: 11, color: '#888', marginTop: 4, lineHeight: 1.4 }}>Length runs along its longest edge. {selectedObstacle.polygon?.length ?? 0} points — drag corners on the 2D plan to reshape, or the shape to move it.</div>
                                </>
                            ) : selectedObstacle.shape === 'cylinder' ? (
                              <>
                                <div style={sliderRowStyle}>{sliderRowLabel('Height', units)}<SliderInput unit={units} numberWidth={58} min={0.05} max={10} step={0.05} value={selectedObstacle.height} onChange={(v) => updateObstacle(selectedObstacle.id, 'height', v)} /></div>
                                <div style={sliderRowStyle}>{sliderRowLabel('Radius', units)}<SliderInput unit={units} numberWidth={58} min={0.01} max={5} step={0.01} value={selectedObstacle.radius} onChange={(v) => updateObstacle(selectedObstacle.id, 'radius', v)} /></div>
                                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Drag it on the 2D plan to move it.</div>
                              </>
                            ) : (
                              <>
                                <div style={sliderRowStyle}>{sliderRowLabel('Width', units)}<SliderInput unit={units} numberWidth={58} min={0.1} max={10} step={0.05} value={selectedObstacle.width} onChange={(v) => updateObstacle(selectedObstacle.id, 'width', v)} /></div>
                                <div style={sliderRowStyle}>{sliderRowLabel('Depth', units)}<SliderInput unit={units} numberWidth={58} min={0.1} max={10} step={0.05} value={selectedObstacle.depth} onChange={(v) => updateObstacle(selectedObstacle.id, 'depth', v)} /></div>
                                <div style={sliderRowStyle}>{sliderRowLabel('Height', units)}<SliderInput unit={units} numberWidth={58} min={0.05} max={10} step={0.05} value={selectedObstacle.height} onChange={(v) => updateObstacle(selectedObstacle.id, 'height', v)} /></div>
                                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Drag it on the 2D plan to move it.</div>
                              </>
                            )}
                        </RailPopover>
                      </div>

                      {isRotatableObstacle(selectedObstacle) && (
                        <div style={{ position: 'relative' }}>
                          <button data-tooltip="Rotate" aria-label="Rotate" className={iconBtn(rightPanelOpenGroup === 'obstacleRotate')} onClick={() => toggleGroup('obstacleRotate')}><RotateIcon /></button>
                          <RailPopover open={rightPanelOpenGroup === 'obstacleRotate'} width={300}>
                              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Rotate</div>
                              {/* Degrees, not a length - no `unit`, so the m/ft
                                  toggle never converts it. */}
                              {selectedObstacle.shape === 'box' ? (
                                <>
                                  <div style={sliderRowStyle}>
                                    {sliderRowLabel('Rotation', '°')}
                                    <SliderInput numberWidth={58} min={-180} max={180} step={1} value={Math.round((((selectedObstacle.rotation || 0) + 180) % 360 + 360) % 360 - 180)} onChange={(v) => updateObstacle(selectedObstacle.id, 'rotation', v)} />
                                  </div>
                                  <button className={btn(false)} disabled={!selectedObstacle.rotation} style={{ width: '100%', marginTop: 2 }} onClick={() => updateObstacle(selectedObstacle.id, 'rotation', 0)}>
                                    ↺ Reset to 0°
                                  </button>
                                </>
                              ) : (
                                <>
                                  <div style={sliderRowStyle}>
                                    {sliderRowLabel('Angle', '°')}
                                    <SliderInput numberWidth={58} min={0} max={179} step={1} value={Math.round(longEdgeAngle(selectedObstacle.polygon)) % 180} onChange={(v) => setDrawnObstacleAngle(selectedObstacle.id, v)} />
                                  </div>
                                  <button className={btn(false)} disabled={Math.round(longEdgeAngle(selectedObstacle.polygon)) % 180 === 0} style={{ width: '100%', marginTop: 2 }} onClick={() => setDrawnObstacleAngle(selectedObstacle.id, 0)}>
                                    ⇆ Square to east–west
                                  </button>
                                  <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>Angle of its longest edge from east–west.</div>
                                </>
                              )}
                              <div style={{ fontSize: 11, color: '#888', marginTop: 8, lineHeight: 1.4 }}>
                                {viewMode === '3d'
                                  ? 'Use the slider here, or switch to the 2D plan to drag the curved-arrow handles.'
                                  : 'Or drag any of the curved-arrow handles at its corners on the 2D plan. Hold Shift to snap to 15°.'}
                              </div>
                          </RailPopover>
                        </div>
                      )}

                      {isTree && (
                        <div style={{ position: 'relative' }}>
                          <button data-tooltip="Canopy" aria-label="Canopy" className={iconBtn(rightPanelOpenGroup === 'obstacleCanopy')} onClick={() => toggleGroup('obstacleCanopy')}><TreeIcon /></button>
                          <RailPopover open={rightPanelOpenGroup === 'obstacleCanopy'} width={280}>
                              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Canopy</div>
                              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${TREE_CANOPIES.length}, 1fr)`, gap: 8 }}>
                                {TREE_CANOPIES.map((c) => {
                                  const CanopyIcon = CANOPY_ICONS[c];
                                  const name = c[0].toUpperCase() + c.slice(1);
                                  return (
                                    <button
                                      key={c}
                                      aria-pressed={selectedObstacle.canopy === c}
                                      className={btn(selectedObstacle.canopy === c)}
                                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px', fontSize: 12 }}
                                      onClick={() => updateObstacle(selectedObstacle.id, 'canopy', c)}
                                    >
                                      {CanopyIcon ? <CanopyIcon size={22} /> : null}
                                      {name}
                                    </button>
                                  );
                                })}
                              </div>
                          </RailPopover>
                        </div>
                      )}

                      {/* Not just the one-time prompt at creation (see
                          promptOverlapRemovalIfNeeded) - a grid regenerated
                          or moved after this obstacle was already placed
                          can newly overlap it too, with nothing prompting
                          for that. Only shown when there's actually
                          something to remove right now. */}
                      {(() => {
                        const overlaps = findPanelsOverlappingObstacle(selectedObstacle);
                        if (overlaps.length === 0) return null;
                        return (
                          <button
                            data-tooltip={`Remove ${overlaps.length} panel${overlaps.length === 1 ? '' : 's'} overlapping this obstacle`}
                            aria-label="Remove overlapping panels"
                            className={`${iconBtn(false)} pde-danger`}
                            onClick={() => removeOverlappingPanels(overlaps)}
                          >
                            <DeletePanelIcon />
                          </button>
                        );
                      })()}
                      <button
                        data-tooltip={placingShape === 'copy' ? 'Click on the plan to place the copy (Esc to cancel)' : 'Copy - then click where to place it (or Cmd/Ctrl+C, Cmd/Ctrl+V)'}
                        aria-label="Copy this obstacle"
                        className={iconBtn(placingShape === 'copy')}
                        onClick={() => {
                          if (placingShape === 'copy') { setPlacingShape(null); return; }
                          resetClickSuppression();
                          cancelActiveModes();
                          copyObstacle(selectedObstacle);
                          setPlacingShape('copy');
                        }}
                      ><DuplicateIcon /></button>
                      <button data-tooltip="Remove this obstacle" aria-label="Remove this obstacle" className={`${iconBtn(false)} pde-danger`} onClick={() => removeObstacle(selectedObstacle.id)}><TrashIcon /></button>
                      <button data-tooltip="Deselect" aria-label="Deselect" className={iconBtn(false)} onClick={() => setSelectedObstacleId(null)}><CloseIcon /></button>
                    </>
                  );
                })()}

                {selectedGrid && (() => {
                  const gridIndex = gridOwnerRoof.grids.findIndex((g) => g.id === selectedGrid.id);
                  const autoTilt = gridOwnerRoof.type === 'pitched' ? gridOwnerRoof.pitchDeg : computeAutoTilt(location);
                  const resolvedTilt = selectedGrid.panelTiltDeg ?? autoTilt;
                  const Ls = selectedGrid.orientation === 'landscape' ? panelSpec.width : panelSpec.height;
                  const recommendedRowSpacing = +computeAutoRowSpacing({ location, tilt: computeAutoTilt(location), Ls }).toFixed(2);
                  const isPitchedGrid = gridOwnerRoof.type === 'pitched';
                  // Mirrors generateLayout's own default (pitched 0, flat 1.0).
                  const defaultRowSpacing = isPitchedGrid ? 0 : 1.0;
                  // A pitched grid filled before pitched grids defaulted to 0
                  // stored the flat default 1.0 - below the panel depth, so it
                  // never had any effect there (generateLayout clamps the pitch
                  // to depth + gap). Shown as the default it behaves as.
                  const legacyPitchedDefault = isPitchedGrid && selectedGrid.rowSpacing === 1.0;
                  const resolvedRowSpacing = legacyPitchedDefault ? 0 : (selectedGrid.rowSpacing ?? defaultRowSpacing);
                  return (
                    <>
                      <div style={{ fontSize: 10, color: '#555', fontWeight: 600, textAlign: 'center' }}>
                        {roofLabel(gridOwnerRoof, roofs.findIndex((r) => r.id === gridOwnerRoof.id))}
                        {gridOwnerRoof.grids.length > 1 ? ` · Grid ${gridIndex + 1}` : ''}
                      </div>

                      <button
                        data-tooltip={(selectedGrid.orientation ?? 'portrait') === 'portrait' ? 'Portrait - click for Landscape' : 'Landscape - click for Portrait'}
                        aria-label="Toggle panel orientation"
                        className={iconBtn(true)}
                        onClick={() => updateGridSettings(gridOwnerRoof.id, selectedGrid.id, { orientation: (selectedGrid.orientation ?? 'portrait') === 'portrait' ? 'landscape' : 'portrait' })}
                      >
                        {(selectedGrid.orientation ?? 'portrait') === 'portrait' ? 'P' : 'L'}
                      </button>

                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Add rows, columns or panels" aria-label="Add rows, columns or panels" className={iconBtn(rightPanelOpenGroup === 'gridAdd' || !!addPanelsMode)} onClick={() => toggleGroup('gridAdd')}><PlusIcon /></button>
                        <RailPopover open={rightPanelOpenGroup === 'gridAdd'} width={280}>
                          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Add</div>
                          <div style={{ fontSize: 11, color: '#555', lineHeight: 1.45, marginBottom: 10 }}>
                            <b>Rows &amp; columns:</b> drag a green <b>+</b> on any side of the grid outward - or click it to add just one.
                            Panels that wouldn't fit on the roof or would hit an obstacle are skipped.
                          </div>
                          <button
                            aria-pressed={!!addPanelsMode}
                            className={btn(!!addPanelsMode)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 10px' }}
                            onClick={() => (addPanelsMode ? exitAddPanels() : startAddPanels(gridOwnerRoof.id, selectedGrid.id))}
                          >
                            <DeletePanelIcon size={18} /> Panels
                          </button>
                          {addPanelsMode && (
                            <>
                              <div style={{ fontSize: 11, color: '#2f6fed', marginTop: 8, lineHeight: 1.4 }}>
                                Click free slots around the grid to pick them, or drag across several on the 2D plan. Enter adds them, Esc exits.
                              </div>
                              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <button
                                  className={btn(true)} style={{ flex: 1, padding: '7px 8px' }}
                                  disabled={addPanelsPicks.size === 0}
                                  onClick={commitAddPanels}
                                >
                                  Add {addPanelsPicks.size} panel{addPanelsPicks.size === 1 ? '' : 's'}
                                </button>
                                <button className={btn(false)} style={{ padding: '7px 10px' }} disabled={addPanelsPicks.size === 0} onClick={() => setAddPanelsPicks(new Set())}>Clear</button>
                              </div>
                            </>
                          )}
                        </RailPopover>
                      </div>

                      <div style={{ position: 'relative' }}>
                        {/* One delete button instead of two identical-looking
                            red trash icons (this one used to only cover row/
                            column/panel, with a separate "Delete selected
                            grid(s)" icon further down doing the same visual
                            thing for a totally different scope) - "Grid"
                            joins row/column/panel as a fourth option here,
                            deleting immediately on click since there's
                            nothing further to pick on the canvas for it. */}
                        <button data-tooltip="Delete row / column / panel / grid" aria-label="Delete row, column, panel, or grid" className={`${iconBtn(rightPanelOpenGroup === 'gridDelete' || !!gridDeleteMode)} pde-danger`} onClick={() => toggleGroup('gridDelete')}><TrashIcon /></button>
                        <RailPopover open={rightPanelOpenGroup === 'gridDelete'} width={280}>
                            {(() => {
                              // Only computed while this popover is open - the
                              // panel-vs-panel test isn't free on a big site.
                              const overlapIds = findOverlappingPanelsInGrid(gridOwnerRoof.id, selectedGrid.id);
                              const card = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px', fontSize: 12 } as const;
                              return (
                                <>
                                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Delete</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                    {['row', 'column', 'panel'].map((mode) => {
                                      const ModeIcon = DELETE_MODE_ICONS[mode];
                                      return (
                                        <button
                                          key={mode}
                                          aria-pressed={gridDeleteMode === mode}
                                          className={btn(gridDeleteMode === mode)}
                                          style={card}
                                          onClick={() => {
                                            const isSelf = gridDeleteMode === mode;
                                            cancelActiveModes();
                                            if (!isSelf) setGridDeleteMode(mode);
                                          }}
                                        >
                                          {ModeIcon ? <ModeIcon size={20} /> : null}
                                          {mode[0].toUpperCase() + mode.slice(1)}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {gridDeleteMode && (
                                    <div style={{ fontSize: 11, color: '#2f6fed', marginTop: 8, lineHeight: 1.4 }}>
                                      {gridDeleteMode === 'panel'
                                        ? 'Click a panel to pick it (Cmd/Ctrl+click to pick more than one), then press Delete/Backspace to remove it. Esc to exit.'
                                        : `Click a panel to pick its ${gridDeleteMode}, then press Delete/Backspace to remove it. Esc to exit.`}
                                    </div>
                                  )}
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                                    <button
                                      className={`${btn(false)} pde-overlap-btn`}
                                      style={card}
                                      disabled={overlapIds.length === 0}
                                      title={overlapIds.length === 0 ? 'No panels in this grid overlap an obstacle or another grid' : `Remove ${overlapIds.length} panel${overlapIds.length === 1 ? '' : 's'} overlapping an obstacle or another grid`}
                                      onClick={() => {
                                        cancelActiveModes();
                                        removeOverlappingPanels(overlapIds.map((panelId) => ({ roofId: gridOwnerRoof.id, gridId: selectedGrid.id, panelId })));
                                      }}
                                    >
                                      <DeletePanelIcon size={20} />
                                      Overlapping{overlapIds.length > 0 ? ` (${overlapIds.length})` : ''}
                                    </button>
                                    <button
                                      className={`${btn(false)} pde-danger-btn`}
                                      style={card}
                                      onClick={() => deleteSelectedGrids()}
                                    >
                                      <TrashIcon size={20} />
                                      Whole grid
                                    </button>
                                  </div>
                                </>
                              );
                            })()}
                        </RailPopover>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Rack settings" aria-label="Rack settings" className={iconBtn(rightPanelOpenGroup === 'gridRack')} onClick={() => toggleGroup('gridRack')}><RackTiltIcon /></button>
                        <RailPopover open={rightPanelOpenGroup === 'gridRack'}>
                            {(() => {
                              // Flush on the slope (pitched roof filled toward its
                              // slope edge): back-to-back rows, no racks - the engine
                              // pins this to 1 (see isFlushOnSlope), so the control
                              // is shown locked rather than looking like it does
                              // something.
                              const flush = isFlushOnSlope(gridOwnerRoof, slopeDirectionAzimuth(gridDirection(selectedGrid, gridOwnerRoof)));
                              return (
                                <>
                                  <div style={labelStyle}>
                                    <span>Panels per row (depth)</span>
                                    <SliderInput
                                      min={1} max={20} step={1} disabled={flush}
                                      value={flush ? 1 : selectedGrid.panelsPerRow}
                                      onChange={(v) => updateGridSettings(gridOwnerRoof.id, selectedGrid.id, { panelsPerRow: Math.max(1, Math.round(v)) })}
                                    />
                                  </div>
                                  <div style={{ fontSize: 11, color: '#888' }}>
                                    {flush
                                      ? 'Not used here: panels follow the roof slope and lie flush in back-to-back rows.'
                                      : 'How many panels stack front-to-back on one rack row (e.g. 2 for a "2-up" layout) before the next shading-safe row starts.'}
                                  </div>
                                </>
                              );
                            })()}

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
                              <span>Row spacing ({units})</span>
                              <SliderInput
                                unit={units} min={isPitchedGrid ? 0 : 0.5} max={10} step={0.05}
                                value={resolvedRowSpacing}
                                onChange={(v) => updateGridSettings(gridOwnerRoof.id, selectedGrid.id, { rowSpacing: v })}
                              />
                            </div>
                            {isPitchedGrid && resolvedRowSpacing !== 0 && (
                              <button
                                onClick={() => updateGridSettings(gridOwnerRoof.id, selectedGrid.id, { rowSpacing: 0 })}
                                style={{ border: 'none', background: 'none', color: '#2f6fed', cursor: 'pointer', fontSize: 11, padding: 0, marginBottom: 4 }}
                              >
                                reset to default (0)
                              </button>
                            )}
                            {gridOwnerRoof.type === 'flat' && (
                              <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                {selectedGrid.rowSpacing != null && selectedGrid.rowSpacing !== 1.0 && (
                                  <button
                                    onClick={() => updateGridSettings(gridOwnerRoof.id, selectedGrid.id, { rowSpacing: 1.0 })}
                                    style={{ border: 'none', background: 'none', color: '#2f6fed', cursor: 'pointer', fontSize: 11, padding: 0 }}
                                  >
                                    reset to default (1.00m)
                                  </button>
                                )}
                                {selectedGrid.rowSpacing !== recommendedRowSpacing && (
                                  <button
                                    onClick={() => updateGridSettings(gridOwnerRoof.id, selectedGrid.id, { rowSpacing: recommendedRowSpacing })}
                                    style={{ border: 'none', background: 'none', color: '#2f6fed', cursor: 'pointer', fontSize: 11, padding: 0 }}
                                  >
                                    use recommended ({formatLength(recommendedRowSpacing, units, 2)})
                                  </button>
                                )}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: '#888' }}>
                              {isPitchedGrid ? (
                                <>Default is 0: rows packed back to back, as flush panels on a pitched roof don't shade each other. Raise it to space out tilted racks (row-to-row pitch).</>
                              ) : (<>
                              Default row spacing is 1.00m. Recommended uses the shading-safe row-to-row spacing computed from this site's own latitude ({formatLength(recommendedRowSpacing, units, 2)}).
                              </>)}
                            </div>
                        </RailPopover>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Mounting" aria-label="Mounting" className={iconBtn(rightPanelOpenGroup === 'gridStructure')} onClick={() => toggleGroup('gridStructure')}><GroundMountIcon /></button>
                        <RailPopover open={rightPanelOpenGroup === 'gridStructure'} width={300}>
                            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Mounting</div>
                            {/* Full-width rows rather than side-by-side cards -
                                the strategy names ("Ground mount (min.
                                pillars)") are too long to fit three across. */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {Object.entries(STRUCTURE_STRATEGIES).map(([key, s]) => {
                                const StrategyIcon = STRUCTURE_ICONS[key];
                                const active = (selectedGrid.structureStrategy ?? 'truss') === key;
                                return (
                                  <button
                                    key={key}
                                    aria-pressed={active}
                                    className={btn(active)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', fontSize: 12, textAlign: 'left', width: '100%' }}
                                    onClick={() => updateGridSettings(gridOwnerRoof.id, selectedGrid.id, { structureStrategy: key })}
                                  >
                                    {StrategyIcon ? <StrategyIcon size={20} /> : null}
                                    {(s as any).label}
                                  </button>
                                );
                              })}
                            </div>
                            <div style={{ ...sliderRowStyle, marginTop: 12 }}>
                              {sliderRowLabel('Min pillar', units)}
                              <SliderInput
                                unit={units} numberWidth={58} min={0} max={5} step={0.05}
                                value={gridOwnerRoof.minPillarHeight ?? 0}
                                onChange={(v) => updateRoof(gridOwnerRoof.id, 'minPillarHeight', v)}
                              />
                            </div>
                        </RailPopover>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <button data-tooltip="Rotate" aria-label="Rotate" className={iconBtn(rightPanelOpenGroup === 'gridRotate')} onClick={() => toggleGroup('gridRotate')}><RotateIcon /></button>
                        <RailPopover open={rightPanelOpenGroup === 'gridRotate'} width={300}>
                            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Rotate</div>
                            {/* Degrees, not a length - no `unit`, so the m/ft
                                toggle never converts it. */}
                            <div style={sliderRowStyle}>
                              {sliderRowLabel('Rotation', '°')}
                              <SliderInput
                                numberWidth={58} min={-180} max={180} step={1}
                                value={Math.round(selectedGrid.rotation || 0)}
                                onChange={(v) => updateRoofGrids(gridOwnerRoof.id, (grids) => grids.map((g) => (g.id === selectedGrid.id ? { ...g, rotation: v } : g)))}
                              />
                            </div>
                            <button
                              className={btn(false)}
                              disabled={!selectedGrid.rotation}
                              style={{ width: '100%', marginTop: 2 }}
                              onClick={() => updateRoofGrids(gridOwnerRoof.id, (grids) => grids.map((g) => (g.id === selectedGrid.id ? { ...g, rotation: 0 } : g)))}
                            >
                              ↺ Reset to 0°
                            </button>
                            <div style={{ fontSize: 11, color: '#888', marginTop: 8, lineHeight: 1.4 }}>
                              {viewMode === '3d'
                                ? 'Use the slider here, or switch to the 2D plan to drag the curved-arrow handles.'
                                : 'Or drag any of the curved-arrow handles at the grid\'s corners on the 2D plan. Hold Shift to snap to 15°.'}
                            </div>
                        </RailPopover>
                      </div>

                      <button data-tooltip="Duplicate selected grid(s)" aria-label="Duplicate selected grid(s)" className={iconBtn(false)} onClick={duplicateSelectedGrids}><DuplicateIcon /></button>
                      <button data-tooltip="Deselect" aria-label="Deselect" className={iconBtn(false)} onClick={() => setSelectedGridKeys(new Set())}><CloseIcon /></button>
                    </>
                  );
                })()}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Mobile counterpart of the desktop floating layout-summary
            overlay above (same renderLayoutSummary content) - a normal
            in-flow block below the canvas instead of a corner overlay, so
            it scrolls into view under the map rather than sitting on top
            of it and covering panels/roofs with text. */}
        {isMobile && currentStep === 4 && totalPanelCount > 0 && (
          <div style={{ ...sectionStyle, margin: '8px 12px 12px', fontSize: 12, flexShrink: 0 }}>
            {renderLayoutSummary()}
          </div>
        )}
      </div>
      )}

      {currentStep === 7 && (
        <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ flex: 1, minHeight: 0 }}>
          <SldView
            projectName={projectName}
            capacityNote={capacityNote}
            gridConnection={gridConnection}
            panelSpec={panelSpec}
            inverterChoice={inverterChoice}
            sitePlan={sitePlan}
            totalPanelCount={totalPanelCount}
            totalCapacityKW={totalCapacityKW}
            targetDcAcRatio={targetDcAcRatio}
            mpptVoltageUtilizationPct={mpptVoltageUtilizationPct}
            onInverterChoiceChange={setInverterChoice}
            onTargetDcAcRatioChange={setTargetDcAcRatio}
            onMpptVoltageUtilizationPctChange={setMpptVoltageUtilizationPct}
          />
          </div>
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="pde-primary-btn" style={{ width: 'auto', padding: '10px 20px' }} onClick={() => advanceToStep(8)}>
              Continue to Design Report →
            </button>
          </div>
        </div>
      )}

      {/* Design Report (step 8) - the customer-facing document: overview,
          configuration, output and SLD as fixed A4 pages (DesignReport.tsx).
          The only place a PDF is produced - Download and Attach to Work
          Order both export exactly these pages (designReportPdf.ts). */}
      {currentStep === 8 && (() => {
        const equatorAz = location.lat >= 0 ? 180 : 0;
        const dirWord = equatorAz === 180 ? 'south' : 'north';
        const roofRows: ReportRoofRow[] = roofs.flatMap((roof, roofIdx) => {
          const withPanels = roof.grids.filter((g) => g.count > 0);
          return withPanels.map((g, gi) => {
            const az = Math.round(((resolvedGridAzimuth(g) % 360) + 360) % 360) % 360;
            const off = Math.round(azimuthOffset(az, equatorAz));
            return {
              key: gridKey(roof.id, g.id),
              name: roofLabel(roof, roofIdx) + (withPanels.length > 1 ? ` · Array ${gi + 1}` : ''),
              type: roof.type === 'pitched' ? `Pitched (${Math.round(roof.pitchDeg ?? 0)}°)` : 'Flat',
              tiltDeg: Math.round(g.tilt ?? 0),
              azimuthDeg: az,
              facing: off === 0 ? `due ${dirWord}` : `${off}° off ${dirWord}`,
              panels: g.count,
              kw: g.capacityKW ?? 0,
            };
          });
        });
        const inverterCount = sitePlan.inverters.length;
        const acKw = inverterCount * (inverterChoice?.acPowerKw ?? 0);
        const rendering3D = renders3D == null && !renders3DFailed;
        const busy = reportBusy != null || rendering3D;
        // Mid-morning on the March equinox: soft, readable shadows the same
        // for every report, rather than whatever time the sun slider was
        // last left at.
        const captureSun = solarPosition(location.lat, location.lon, new Date(selectedDate.getFullYear(), 2, 21), 10.5, location.tz);
        return (
          <div ref={reportRef} style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'auto', background: 'var(--app-bg, #f3f4f6)', borderRadius: 10 }}>
            <div className="pde-report-toolbar">
              <div>
                <div className="pde-step1-heading" style={{ marginBottom: 0 }}>Design Report</div>
                <div className="pde-field-sm-hint">Customer-ready summary of this design. What you see below is exactly what gets downloaded or attached.</div>
              </div>
              <div className="pde-report-toolbar-actions">
                {rendering3D && totalPanelCount > 0 && <span className="pde-field-sm-hint">Preparing 3D views…</span>}
                <button className={`pde-save-btn${linkedWorkOrderId && onAttachPdf ? ' pde-save-btn--secondary' : ''}`} onClick={handleDownloadReport} disabled={busy || totalPanelCount === 0}>
                  {reportBusy === 'download' ? 'Generating PDF…' : 'Download PDF'}
                </button>
                {linkedWorkOrderId && onAttachPdf && (
                  <button className="pde-save-btn" onClick={handleAttachReport} disabled={busy || totalPanelCount === 0}>
                    {reportBusy === 'attach' ? 'Attaching…' : 'Attach to Work Order'}
                  </button>
                )}
              </div>
            </div>
            {totalPanelCount === 0 ? (
              <div className="pde-field-sm-hint" style={{ padding: 24 }}>Place at least one grid (Panel/Grid setup) to generate a report.</div>
            ) : (
              <DesignReport
                branding={reportContext?.branding ?? { entityName: 'SolarOS' }}
                client={reportContext?.client ?? null}
                projectName={projectName}
                siteAddress={reportContext?.siteAddress ?? null}
                location={location}
                locationImages={{
                  wide: backdropWidePlacement ? { url: backdropWidePlacement.url, spanMeters: backdropWidePlacement.widthMeters } : null,
                  tight: backdropPlacement ? { url: backdropPlacement.url, spanMeters: backdropPlacement.widthMeters } : null,
                }}
                siteFocus={(() => {
                  const pts = roofs.flatMap((r) => getRoofPolygon(r));
                  if (pts.length === 0) return { x: 0, y: 0, radius: 15 };
                  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
                  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
                  return { x: cx, y: cy, radius: Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy))) };
                })()}
                capacityKw={totalCapacityKW}
                panelCount={totalPanelCount}
                panelSpec={panelSpec}
                inverterChoice={inverterChoice}
                inverterCount={inverterCount}
                gridConnection={gridConnection}
                dcAcRatio={acKw > 0 ? totalCapacityKW / acKw : null}
                designTemp={designTemp ?? null}
                roofRows={roofRows}
                output={outputResult}
                ghiStatus={ghiStatus}
                sitePlan={reportSitePlan}
                renders3D={renders3D}
                renders3DFailed={renders3DFailed}
                views3D={reportViews3D}
                sld={
                  <SldView
                    embedded
                    projectName={projectName}
                    capacityNote={capacityNote}
                    gridConnection={gridConnection}
                    panelSpec={panelSpec}
                    inverterChoice={inverterChoice}
                    sitePlan={sitePlan}
                    totalPanelCount={totalPanelCount}
                    totalCapacityKW={totalCapacityKW}
                    targetDcAcRatio={targetDcAcRatio}
                    mpptVoltageUtilizationPct={mpptVoltageUtilizationPct}
                  />
                }
              />
            )}
            {/* Off-screen Scene3D in capture mode - renders the report's
                fixed-angle 3D views once, then unmounts (renders3D set). */}
            {rendering3D && totalPanelCount > 0 && reportImagesReady && (
              <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: 1200, height: 800, pointerEvents: 'none' }}>
                <React.Suspense fallback={null}>
                  <Scene3D
                    roofs={roofs.map((roof) => ({
                      id: roof.id,
                      polygon: getRoofPolygon(roof),
                      usablePolygon: roofUsablePolygons.find((u) => u.id === roof.id)?.polygon ?? [],
                      buildingHeight: roof.buildingHeight,
                      boundaryHeight: roof.boundaryHeight,
                      type: roof.type,
                      pitchDeg: roof.pitchDeg,
                      slopeDirection: roof.slopeDirection,
                      azimuth: getRoofAzimuth(roof, location),
                      grids: roof.grids.map((g) => ({
                        id: g.id,
                        selected: false,
                        deleteMode: false,
                        layout: g,
                        structure: structuresByGrid[gridKey(roof.id, g.id)],
                      })),
                    }))}
                    panelSpec={panelSpec}
                    obstacles={obstacles}
                    sunElevation={captureSun.elevation}
                    sunAzimuth={captureSun.azimuth}
                    mapImagePlacement={backdropPlacement}
                    mapImageWidePlacement={backdropWidePlacement}
                    capture={{ views: reportViews3D, onDone: setRenders3D }}
                  />
                </React.Suspense>
              </div>
            )}
          </div>
        );
      })()}

      {/* Output estimate (step 5) - no canvas alongside it (see the CENTER
          block's own condition, excluding step 5), same simple single-
          column treatment as steps 1/2 instead of the old narrow 280px
          data panel that used to sit beside the plan/3D view. */}
      {currentStep === 5 && (
        <div style={isMobile ? { width: '100%', flexShrink: 0 } : { width: 480, flexShrink: 0, overflowY: 'auto', height: '100%' }}>
          <div className="pde-step1-card">
            <div className="pde-step1-heading">Output estimate</div>
            <div className="pde-step1-subtext">Estimated energy output for this design, based on shading, module specs, and this site's own irradiance.</div>

            {totalPanelCount === 0 ? (
              <div className="pde-field-sm-hint">Place at least one grid (Panel/Grid setup) to see an estimate.</div>
            ) : (
              <>
                <div className="pde-field-row">
                  <div className="pde-field-sm"><label>Panels</label><div className="pde-stat-value">{totalPanelCount} across {roofs.length} roof{roofs.length === 1 ? '' : 's'}</div></div>
                  <div className="pde-field-sm"><label>Capacity</label><div className="pde-stat-value">{totalCapacityKW.toFixed(1)} kW</div></div>
                </div>
                <div className="pde-field-sm">
                  <label>Module</label>
                  <div className="pde-stat-value">{panelSpec.make} {panelSpec.model} · {panelSpec.wattage} W</div>
                </div>
                {/* The facing each grid's output was actually computed with
                    (its packed azimuth + any manual grid rotation -
                    resolvedGridAzimuth, the same value computeOutput reads
                    via resolvedGrid), so the estimate never silently reads
                    as "assumed due south". */}
                {(() => {
                  const equatorAz = location.lat >= 0 ? 180 : 0;
                  const dirWord = equatorAz === 180 ? 'south' : 'north';
                  const rows = roofs.flatMap((roof, roofIdx) => {
                    const withPanels = roof.grids.filter((g) => g.count > 0);
                    return withPanels.map((g, gi) => {
                      const az = ((resolvedGridAzimuth(g) % 360) + 360) % 360;
                      return {
                        key: gridKey(roof.id, g.id),
                        name: roofLabel(roof, roofIdx) + (withPanels.length > 1 ? ` · Grid ${gi + 1}` : ''),
                        az: Math.round(az) % 360,
                        off: Math.round(azimuthOffset(az, equatorAz)),
                        tilt: Math.round(g.tilt ?? 0),
                        kw: g.capacityKW ?? 0,
                      };
                    });
                  });
                  if (rows.length === 0) return null;
                  return (
                    <div className="pde-field-sm">
                      <label>Orientation</label>
                      <div className="pde-orientation-list">
                        {rows.map((r) => (
                          <div key={r.key} className="pde-orientation-row">
                            <span className="pde-orientation-name">{r.name}</span>
                            <span>
                              <strong>{r.az}°</strong>
                              <span style={{ color: r.off > 45 ? '#c0392b' : '#888' }}>{r.off === 0 ? ` · due ${dirWord}` : ` · ${r.off}° off ${dirWord}`}</span>
                            </span>
                            <span style={{ color: '#888' }}>tilt {r.tilt}°</span>
                            <span style={{ fontWeight: 600 }}>{r.kw.toFixed(1)} kW</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {/* Energy-weighted (unlike the old "% of samples shaded"
                    figure this replaced): a shadow at noon costs far more
                    than one at 7 AM, and this counts it that way. */}
                {outputResult && (
                  <div className="pde-field-sm">
                    <label>
                      Shading loss{' '}
                      <InfoTip text="Energy lost over a typical year to shadows from the obstacles drawn on the plan. An estimate: each panel counts as fully shaded or unshaded by its centre point, string and bypass-diode effects aren't modelled, and anything not drawn (neighbouring buildings, trees, or flat-roof panel rows shading each other) isn't included. Real losses can be higher, especially without optimisers." />
                    </label>
                    <div className="pde-stat-value">
                      {formatPct(shadingLossPct(outputResult))} ({formatKWh(outputResult.totalLostKWh)}/yr)
                    </div>
                  </div>
                )}

                {outputResult ? (
                  <div className="pde-field-row" style={{ marginBottom: 20 }}>
                    <div className="pde-field-sm">
                      <label>Annual output</label>
                      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--app-text, #222)' }}>{formatKWh(outputResult.totalKWh)}</div>
                    </div>
                    {/* kWh per kWp per year - the installer's standard
                        sanity check (roughly 1,400-1,600 across most of
                        India), independent of system size. */}
                    <div className="pde-field-sm">
                      <label>
                        Specific yield{' '}
                        <InfoTip text="Units generated per year for each kW of panels installed (annual kWh ÷ system kWp). Lets you compare designs regardless of size - a good unshaded system in most of India gives about 1,400-1,600." />
                      </label>
                      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--app-text, #222)' }}>
                        {totalCapacityKW > 0 ? Math.round(outputResult.totalKWh / totalCapacityKW).toLocaleString('en-IN') : '-'}
                        <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--app-text-muted, #888)' }}> kWh/kWp/yr</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="pde-field-sm-hint" style={{ marginBottom: 20 }}>Calculating…</div>
                )}
              </>
            )}

            <CollapsibleSection title="Assumptions">
                <div className="pde-field-sm"><label>System derate</label><SliderInput min={0} max={1} step={0.01} value={assumptions.systemDerate} onChange={(v) => setAssumptions({ ...assumptions, systemDerate: v })} /></div>
                <div className="pde-field-sm"><label>Diffuse fraction</label><SliderInput min={0} max={1} step={0.05} value={assumptions.diffuseFraction} onChange={(v) => setAssumptions({ ...assumptions, diffuseFraction: v })} /></div>
                <div className="pde-field-sm-hint">
                  Irradiance:{' '}
                  {ghiStatus === 'loading' && 'fetching this site\'s own monthly averages (NASA POWER)…'}
                  {ghiStatus === 'ready' && 'this site\'s own monthly averages (NASA POWER, 2001-2020 climatology).'}
                  {ghiStatus === 'error' && 'couldn\'t fetch this site\'s data - using illustrative sample averages instead.'}
                  {ghiStatus === 'idle' && 'illustrative sample monthly averages.'}
                </div>
            </CollapsibleSection>

            <button className="pde-primary-btn" style={{ marginTop: 16 }} onClick={() => advanceToStep(7)}>
              Continue to Electrical Design (SLD) →
            </button>
          </div>
        </div>
      )}

      {/* RIGHT: step 5's chart pane - monthly bars for the typical year,
          or (after clicking a month's bar) that month's typical-day hourly
          curve. Fills the space beside the summary card. */}
      {currentStep === 5 && totalPanelCount > 0 && (
        <div style={isMobile ? { width: '100%', flexShrink: 0 } : { flex: 1, minWidth: 0, height: '100%', overflowY: 'auto' }}>
          <OutputChartPanel
            result={outputResult}
            drillMonth={outputDrillMonth}
            onDrillMonth={setOutputDrillMonth}
            ghiStatus={ghiStatus}
            isMobile={isMobile}
          />
        </div>
      )}

      {/* RIGHT: step 6's own data panel - Cost estimate's editable
          pricing, moved out of the old sidebar accordion now that the
          canvas is full-bleed for this step too. Hidden from navigation
          for now (see visibleSteps) but left otherwise intact. */}
      {currentStep === 6 && (
        <div style={{ width: 280, flexShrink: 0, overflowY: 'auto', height: '100%' }}>
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
        </div>
      )}
    </div>

    <ConfirmDialog
      open={leaveBlocker.state === 'blocked'}
      title="Leave without saving?"
      message="This design has changes that haven't been saved. If you leave now, they'll be lost."
      confirmLabel="Leave without saving"
      cancelLabel="Stay on this page"
      onConfirm={() => leaveBlocker.proceed?.()}
      onCancel={() => leaveBlocker.reset?.()}
    />
    <ConfirmDialog
      open={pendingLocationChange !== null}
      title="Change location?"
      message="Changing the site location clears the roofs, panel layout, and output/cost estimates you've already worked on for this design - you'll need to draw the roof and place panels again for the new location."
      confirmLabel="Change location"
      cancelLabel="Keep current location"
      onConfirm={() => {
        if (pendingLocationChange) {
          handleLocationConfirm(pendingLocationChange);
          advanceToStep(2);
        }
        setPendingLocationChange(null);
      }}
      onCancel={() => setPendingLocationChange(null)}
    />

    <ConfirmDialog
      open={obstacleOverlapPrompt !== null}
      title="Remove overlapping panels?"
      message={(() => {
        const n = obstacleOverlapPrompt?.hits.length ?? 0;
        return `This obstacle overlaps ${n} panel${n === 1 ? '' : 's'} already placed. Remove ${n === 1 ? 'it' : 'them'} now, or keep ${n === 1 ? 'it' : 'them'} and clean this up later - regenerating the grid (e.g. "Fill roof") will skip this area either way.`;
      })()}
      confirmLabel="Remove panels"
      cancelLabel="Keep panels"
      onConfirm={() => {
        if (obstacleOverlapPrompt) removeOverlappingPanels(obstacleOverlapPrompt.hits);
        setObstacleOverlapPrompt(null);
      }}
      onCancel={() => setObstacleOverlapPrompt(null)}
    />
    </div>
  );
}
