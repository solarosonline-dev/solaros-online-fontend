import { toRad, solarPosition } from './solarMath.js';
import {
  getRoofPolygon, insetPolygon, polygonScanlineSegments, isOnRoof, pointInPolygon, shadowPolygon,
  slopeDirectionAzimuth, toSlopeLocal, toSlopeWorld,
} from './geometry.js';

// ============================================================
// Reference data
// ============================================================
// Illustrative sample daily global-horizontal insolation (kWh/m^2/day) by
// month, roughly typical for a South Indian city. NOT live data — swap for
// PVGIS/Solcast before relying on this for real proposals.
export const SAMPLE_MONTHLY_GHI = [5.6, 6.2, 6.6, 6.4, 5.8, 4.3, 3.9, 4.1, 4.6, 4.9, 5.1, 5.4];

// `drawable: true` means this preset is traced freehand (any number of
// points, closed like a roof outline) on the 2D plan instead of
// click-placed at a fixed default size/shape - an elevation's footprint
// varies too much (a neighboring building, a roof-level lift room or
// parapet, a stair enclosure) to have one sensible default the way a tree
// or an AC unit does. Its `shape` ends up 'polygon' once actually drawn
// (see solar_layout_engine.jsx's addDrawnObstacle) - `height` here is
// just its default before that, low enough to read as a low upstand/curb
// rather than a full extra storey.
export const OBSTACLE_PRESETS = {
  tree: { label: 'Tree', shape: 'cylinder', radius: 2, height: 6 },
  elevation: { label: 'Elevation', shape: 'polygon', height: 1, boundaryHeight: 0, drawable: true },
  tank: { label: 'Water Tank', shape: 'cylinder', radius: 0.6, height: 1.2 },
  ac: { label: 'AC Unit', shape: 'box', width: 0.9, depth: 0.9, height: 0.6, rotation: 0 },
  vent: { label: 'Vent Pipe', shape: 'cylinder', radius: 0.08, height: 0.35 },
  chimney: { label: 'Chimney', shape: 'box', width: 0.6, depth: 0.6, height: 1, rotation: 0 },
  // Flush with the roof deck rather than raised - real height is a couple
  // cm of frame proud of the surface, low enough that shadowPolygon's own
  // `relativeHeight <= 0` guard (see below) skips casting a shadow from it
  // at all. It still blocks panel placement like every other obstacle
  // (generateLayout's own keep-out check doesn't care about height), which
  // is really the only thing that matters for a skylight or roof hatch.
  // Drawn freehand like Elevation, not click-placed at a fixed size - real
  // skylights come in enough shapes (single pane, ganged strip, light well)
  // that one default rectangle doesn't fit most of them.
  skylight: { label: 'Skylight', shape: 'polygon', height: 0.05, boundaryHeight: 0, drawable: true },
  dish: { label: 'Satellite Dish', shape: 'cylinder', radius: 0.35, height: 0.4 },
  turbineVent: { label: 'Turbine Vent', shape: 'cylinder', radius: 0.2, height: 0.3 },
  // A site marker, not a real keep-out object - unlike every other preset
  // here, it doesn't block panel placement (generateLayout's blocking
  // check) or cast/receive shadow (shadowCastingHeight's callers), it's
  // just shown in both views for reference. `marker: true` is spread onto
  // the obstacle instance itself, same as every other preset field.
  lightningArrestor: { label: 'Lightning Arrestor', shape: 'cylinder', radius: 0.04, height: 1.5, marker: true },
  // Same "flush, no shadow, still blocks placement" treatment as skylight
  // (see above) - a maintenance/access walkway keeps panels off it but has
  // no real height of its own. Drawn freehand too: a walkway is a path,
  // not a fixed-size shape.
  walkway: { label: 'Walkway', shape: 'polygon', height: 0.02, boundaryHeight: 0, drawable: true },
  // Unlike every other obstacle here, a Cutout doesn't sit ON the roof -
  // it REMOVES that section of the building/roof footprint, a real
  // light well/courtyard open from roof to ground in 3D (flat roofs only
  // for v1 - see Scene3D.jsx's roofCutouts comment). Drawn freehand like
  // Elevation. `height: 0` because it has no height of its own to set (no
  // height field is shown for it in the obstacle footer - see
  // solar_layout_engine.jsx) - it's also what keeps shadowPolygon's own
  // `relativeHeight <= 0` guard skipping it as a shadow caster, same
  // mechanism as skylight/walkway above, just for a different reason (a
  // hole can't cast a shadow either way).
  cutout: { label: 'Cutout', shape: 'polygon', height: 0, boundaryHeight: 0, drawable: true },
};

// Sampling a scanline exactly at a row's own front/back edge is a
// degenerate case whenever that Y happens to be the polygon's own extreme
// Y (the very first/last row of a roof, right at the eave or ridge) *and*
// that extreme point is a single vertex rather than a flat edge - true of
// almost any hand-drawn (non-axis-aligned) corner. The scanline then
// touches the polygon at a single point, a genuinely zero-width segment,
// not a floating-point artifact - nudging the sample a hair inward keeps
// it a hair inside the polygon instead, which is where a real panel's own
// front/back edge needs to be checked. This is what "corners a few
// centimeters off square" cost a whole row before this nudge existed.
const SCANLINE_EDGE_EPS = 0.01;

// The X-ranges valid for a panel's *entire* depth, not just the single
// scanline through its center - `polygonScanlineSegments` only samples one
// Y, so a panel whose row happens to cross a diagonal (non-axis-aligned)
// roof edge could fit at its center line yet still have a front or back
// corner poke outside the actual boundary. Intersecting the ranges at the
// panel's own front and back edges (nudged in by SCANLINE_EDGE_EPS - see
// above) catches that: any x valid for the whole depth has to be valid at
// both.
function scanlineSegmentsForDepth(poly, centerY, halfDepth) {
  const front = polygonScanlineSegments(poly, centerY - halfDepth + SCANLINE_EDGE_EPS);
  const back = polygonScanlineSegments(poly, centerY + halfDepth - SCANLINE_EDGE_EPS);
  let intersected: any[] = [];
  front.forEach(([f0, f1]) => {
    back.forEach(([b0, b1]) => {
      const lo = Math.max(f0, b0), hi = Math.min(f1, b1);
      if (hi > lo) intersected.push([lo, hi]);
    });
  });
  if (intersected.length > 0) return intersected;
  // Front and back still left no common range at all - a genuinely narrow
  // or concave notch cutting all the way across this row's depth band,
  // not just a corner vertex (the nudge above already rules that out).
  // Rather than trusting the row's raw center scanline outright (which can
  // overhang past whichever of front/back *does* have real polygon here),
  // clip it to whichever of the two is non-empty - that still keeps the
  // row instead of dropping it, but without giving up the one edge check
  // that's actually available. Only fall back to the unclipped center when
  // neither edge touches the polygon at all.
  const center = polygonScanlineSegments(poly, centerY);
  const bound = front.length > 0 ? front : back;
  if (bound.length === 0) return center;
  let clipped: any[] = [];
  center.forEach(([c0, c1]) => {
    bound.forEach(([b0, b1]) => {
      const lo = Math.max(c0, b0), hi = Math.min(c1, b1);
      if (hi > lo) clipped.push([lo, hi]);
    });
  });
  return clipped.length > 0 ? clipped : center;
}

// Intersects every row's own X-ranges within one cluster (see
// `panelsPerRow` in generateLayout) down to a single shared set - the
// panels in a cluster all sit on one physical rack, so the rack can only
// be as wide as its *narrowest* row allows, not each row independently.
// Without this, a cluster crossing a tapering roof edge (a triangular or
// diamond-shaped roof, or just an angled corner) packs each of its rows to
// its own full available width, producing a staircase/pyramid silhouette
// that doesn't correspond to a buildable rack - the whole point of
// grouping rows into one cluster in the first place.
function intersectSegmentLists(lists) {
  return lists.reduce((acc, segs) => {
    let result: any[] = [];
    acc.forEach(([a0, a1]) => {
      segs.forEach(([b0, b1]) => {
        const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
        if (hi > lo) result.push([lo, hi]);
      });
    });
    return result;
  });
}

// ============================================================
// Layout generation
// ============================================================
// Small real-world clearance between adjacent panels within a row (typical
// rail-mount hardware needs ~10-20mm). Exported so Add row/Add column (see
// addGridRow/addGridColumn below) can space new panels identically to
// however generateLayout originally packed the grid, without either side
// drifting out of sync with the other's own copy of this number.
export const PANEL_GAP = 0.02;

// Heuristic: annual-optimal fixed tilt ~= site latitude (clamped to a
// buildable racking range). A full numerical sweep is a natural v2.
// Exported so the UI can show this same number as a flat roof's own
// "auto" panel tilt (before any user override via roof.panelTiltDeg) -
// see the Panel tilt field in solar_layout_engine.jsx.
export function computeAutoTilt(location) {
  return Math.max(10, Math.min(35, Math.round(Math.abs(location.lat))));
}

// Row spacing via the standard "no inter-row shading 9am-3pm on the
// winter solstice" design rule. Exported so the UI can show this same
// number as a flat roof's own "auto" row spacing (before any user
// override via roof.rowSpacing) - see the Row spacing field in
// solar_layout_engine.jsx.
export function computeAutoRowSpacing({ location, tilt, Ls }) {
  const decDate = new Date(2026, 11, 21);
  const { elevation: elev9am } = solarPosition(location.lat, location.lon, decDate, 9, location.tz);
  const safeElev = Math.max(elev9am, 5);
  return Math.min(
    Ls * Math.cos(toRad(tilt)) + (Ls * Math.sin(toRad(tilt))) / Math.tan(toRad(safeElev)),
    Ls * 3.5
  );
}

// `footprintPolygon` is the area this one grid packs into - the whole roof
// polygon for the default "Generate Layout" grid, or a hand-drawn polygon
// for a grid placed via the polygon tool (see README's "Panel grids"
// entry). `gridSettings` carries the per-grid overrides that used to live
// on the roof itself (panelTiltDeg/rowSpacing/structureStrategy/
// panelsPerRow) - each grid keeps its own copy once created, so a roof can
// hold more than one independently configured grid.
export function generateLayout({ roof, footprintPolygon, gridSettings = {} as any, panelSpec, obstacles, location }: any): any {
  const { type, slopeDirection } = roof;
  // A flat roof always packs/faces in world coordinates directly ('S' is
  // the identity transform below); a pitched roof packs in local
  // "south-facing" space and gets rotated into whichever direction it's
  // actually set to face (see toSlopeLocal/toSlopeWorld in geometry.js).
  const direction = type === 'pitched' ? (slopeDirection || 'S') : 'S';
  // Row-to-row spacing is separate and unaffected by PANEL_GAP - the
  // shading-derived rowPitch for flat roofs, or the flush-mounted Ls for
  // pitched roofs.
  const gap = PANEL_GAP;
  // How many panels stack in the depth direction on one rack/row (e.g. a
  // "2-up" rack) before the next shading-safe row starts. They share the
  // same tilt plane and only need the small panel-to-panel gap between
  // them, not the full inter-row shading clearance.
  const panelsPerRow = Math.max(1, Math.round(gridSettings.panelsPerRow ?? panelSpec.panelsPerRow ?? 1));
  // Orientation is a per-grid setting (like panelTiltDeg/rowSpacing/
  // structureStrategy below) rather than read off the site-wide panelSpec -
  // two grids on the same site can mount their panels differently. New
  // grids default to 'portrait'.
  const orientation = gridSettings.orientation ?? 'portrait';
  const Wp = orientation === 'landscape' ? panelSpec.height : panelSpec.width;
  const Ls = orientation === 'landscape' ? panelSpec.width : panelSpec.height;

  const roofPolygon = getRoofPolygon(roof);
  // Whole-roof grids (the default "Generate Layout" run) pack the roof's
  // own polygon and inherit its per-edge margin overrides; a polygon-tool
  // grid packs whatever footprint was drawn for it instead, with a single
  // uniform margin (the roof's own edgeMargin default) since a drawn
  // footprint has no edge indices of its own to hang per-edge overrides off.
  const targetPolygon = footprintPolygon || roofPolygon;
  const isWholeRoofFootprint = targetPolygon === roofPolygon;
  const panelTiltDeg = gridSettings.panelTiltDeg ?? null;
  const rowSpacing = gridSettings.rowSpacing ?? null;
  const structureStrategy = gridSettings.structureStrategy ?? roof.structureStrategy ?? 'truss';

  let tilt, azimuth, rowPitch;
  if (type === 'flat') {
    // `panelTiltDeg` is null by default ("auto") - only a plain field
    // override skips the latitude heuristic; see the Panel tilt field in
    // solar_layout_engine.jsx, which shows this same computeAutoTilt value
    // whenever no override is set rather than leaving the field blank.
    tilt = panelTiltDeg ?? computeAutoTilt(location);
    azimuth = location.lat >= 0 ? 180 : 0;
    rowPitch = (rowSpacing != null && rowSpacing > 0)
      // Explicit override - skip the shading-safe calc below entirely.
      ? rowSpacing
      : computeAutoRowSpacing({ location, tilt, Ls });
  } else {
    // The panel array's own mounting angle, independent of the building
    // roof's own slope (roof.pitchDeg, which only drives Scene3D's sloped
    // roof deck) - a rack can be tilted steeper or shallower than the roof
    // it sits on, not just laid flush against it. `panelTiltDeg` is null by
    // default too ("auto" = flush with the roof's own pitch, matching the
    // previous fixed 15°/15° default exactly) - a plain field override sets
    // it explicitly instead.
    tilt = panelTiltDeg ?? roof.pitchDeg;
    azimuth = slopeDirectionAzimuth(direction);
    // Assumes the rack sits close enough to flush that no extra inter-row
    // shading clearance is needed - doesn't re-derive shading-safe spacing
    // for a panel tilt set far steeper than the roof's own pitch.
    rowPitch = Ls + gap;
  }

  const footprintDepth = type === 'flat' ? Ls * Math.cos(toRad(tilt)) : Ls;
  // A manual row-spacing override (see above) is a raw user number with no
  // guarantee it's not smaller than the panel's own footprint - clamp it
  // to that floor so rows can never physically overlap front-to-back.
  rowPitch = Math.max(rowPitch, footprintDepth + gap);
  // rowPitch above is the single-panel-deep row-to-row pitch; pull out just
  // the extra clearance beyond one panel's own footprint, since that's the
  // part that still applies once per cluster regardless of how many panels
  // are stacked inside it.
  const extraRowClearance = rowPitch - footprintDepth;
  const clusterDepth = panelsPerRow * footprintDepth + (panelsPerRow - 1) * gap;
  const clusterPitch = clusterDepth + extraRowClearance;

  // Inset the roof boundary by the edge setback, then fill it cluster by
  // cluster, each cluster being `panelsPerRow` panels deep with a scanline
  // scan per panel-row: a roof can intersect the (possibly concave)
  // polygon in more than one x-range, and panels are packed independently
  // within each range so they never cross the boundary. Packing happens in
  // the roof's own local space (see `direction` above) so rows always
  // scan "south to north" there regardless of which way the roof actually
  // faces in the world.
  const localPolygon = targetPolygon.map((p) => toSlopeLocal(p, direction));
  // Per-edge margin (roof.edgeMargin is the default every edge starts at,
  // 0.5m if the roof predates this field entirely; roof.edgeMarginOverrides
  // is a sparse `{ [edgeIndex]: meters }` map for edges a user has pulled
  // back individually - see the "Roof / site configuration" README entry).
  // toSlopeLocal is a pure rotation (see geometry.js), so it preserves
  // point/edge order - edge i of roofPolygon is still edge i of
  // localPolygon, meaning edgeMargins here lines up directly with
  // roof.polygon's own edge indices without any remapping. A drawn (non
  // whole-roof) footprint has no edge indices of its own to match those
  // overrides against, so it just gets the roof's own flat default on
  // every edge instead.
  const edgeMargins = isWholeRoofFootprint
    ? targetPolygon.map((_, i) => roof.edgeMarginOverrides?.[i] ?? roof.edgeMargin ?? 0.5)
    : targetPolygon.map(() => roof.edgeMargin ?? 0.5);
  const usablePoly = insetPolygon(localPolygon, edgeMargins);
  const ys = usablePoly.map((p) => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  // Shared by both packing modes below - whether a candidate panel
  // position (in the roof's own local space) overlaps an obstacle.
  function isBlockedAt(x, rowY) {
    return obstacles.some((o) => {
      if (o.marker) return false;
      if (!isOnRoof(o, roofPolygon)) return false;
      const op = toSlopeLocal({ x: o.x, y: o.y }, direction);
      if (o.shape === 'box') {
        return Math.abs(x - op.x) < o.width / 2 + 0.3 && Math.abs(rowY - op.y) < o.depth / 2 + 0.3;
      }
      if (o.shape === 'polygon') {
        // The real polygon (in the same local space as the scan), not its
        // own bounding box - a non-rectangular drawn obstacle (a triangle,
        // an L, ...) has a bounding box far bigger than its actual
        // footprint, which used to block every panel position in that
        // whole box, not just the ones the shape itself actually covers -
        // visibly wasting real, obstacle-free roof space around anything
        // but a rectangle. `margin` samples a small cross of points around
        // the candidate position instead of the position alone, as a
        // stand-in for a true 0.3m-clearance/Minkowski-expanded polygon
        // test (matching the flat 0.3m the box/cylinder branches already
        // add to their own half-dimensions).
        const localPoly = o.polygon.map((p) => toSlopeLocal(p, direction));
        const margin = 0.3;
        const samplePoints = [
          { x, y: rowY },
          { x: x - margin, y: rowY }, { x: x + margin, y: rowY },
          { x, y: rowY - margin }, { x, y: rowY + margin },
        ];
        return samplePoints.some((pt) => pointInPolygon(pt, localPoly));
      }
      return Math.hypot(x - op.x, rowY - op.y) < (o.radius || 0.5) + 0.3;
    });
  }

  // The "Roof mount (stepped)" strategy (see STRUCTURE_STRATEGIES below) is
  // the only thing that changes packing here - every other strategy keeps
  // exactly the shared-width-per-cluster behavior below, untouched.
  const stepped = structureStrategy === 'steppedTruss';

  // Pre-calculate total depth consumed by all clusters that will fit in [minY, maxY]
  // so we can center the cluster stack vertically on the usable roof surface
  // instead of dumping all leftover space at the bottom.
  let simTop = minY;
  let totalUsedDepth = 0;
  let simClusterCount = 0;
  while (simTop + footprintDepth <= maxY + 1e-9) {
    const remainingDepth = maxY - simTop;
    const maxRowsThatFit = Math.max(1, Math.floor((remainingDepth + gap) / (footprintDepth + gap)));
    let rowsHere = Math.min(panelsPerRow, maxRowsThatFit);
    const thisClusterDepth = rowsHere * footprintDepth + (rowsHere - 1) * gap;
    simClusterCount++;
    simTop += thisClusterDepth + extraRowClearance;
  }
  if (simClusterCount > 0) {
    totalUsedDepth = (simTop - extraRowClearance) - minY;
  }
  const leftoverDepth = Math.max(0, (maxY - minY) - totalUsedDepth);
  const verticalOffset = leftoverDepth / 2;

  let panels: any[] = [];
  let idc = 0;
  let clusterTop = minY + verticalOffset;
  // Packs however many full clusters of `panelsPerRow` fit, then - unlike
  // before - keeps going with a smaller *partial* final cluster for
  // whatever depth is left over, rather than stopping the instant a full
  // cluster no longer fits. Previously any leftover depth that couldn't
  // hold a complete cluster was wasted outright: a footprint too shallow
  // for even one full cluster packed zero panels at all, and a footprint
  // with room for, say, 1.5 clusters only ever got the first 1. Each
  // iteration recomputes how many rows actually fit in the depth that's
  // left (`maxRowsThatFit`), capped at `panelsPerRow` - every cluster
  // except possibly the last still comes out exactly `panelsPerRow` deep,
  // so `clusterDepth`/`clusterPitch` above (still returned on the grid,
  // e.g. for the "rack spacing (N-up)" summary text) keep describing the
  // nominal full-size rack.
  while (clusterTop + footprintDepth <= maxY + 1e-9) {
    const remainingDepth = maxY - clusterTop;
    const maxRowsThatFit = Math.max(1, Math.floor((remainingDepth + gap) / (footprintDepth + gap)));
    let rowsHere = Math.min(panelsPerRow, maxRowsThatFit);

    if (stepped) {
      // "Roof mount (stepped)": each row packs to its own available width
      // instead of every row in the cluster sharing one intersected
      // width - see the comment on STRUCTURE_STRATEGIES.steppedTruss
      // below for why this needs its own structure algorithm to match.
      // Rows still share one column grid (anchored at whichever row's
      // own segment starts furthest left) so columns line up across rows
      // for the structure to key off, even though a given column may only
      // be present in some of them.
      let rowYs: any[] = [];
      for (let i = 0; i < rowsHere; i++) rowYs.push(clusterTop + footprintDepth / 2 + i * (footprintDepth + gap));
      const rowSegmentsList = rowYs.map((rowY) => scanlineSegmentsForDepth(usablePoly, rowY, footprintDepth / 2));
      const allX0 = rowSegmentsList.flatMap((segs) => segs.map(([s0]) => s0));
      if (allX0.length > 0) {
        const gridX0 = Math.min(...allX0);
        const gridX1 = Math.max(...rowSegmentsList.flatMap((segs) => segs.map(([, s1]) => s1)));
        let x = gridX0 + Wp / 2;
        while (x + Wp / 2 <= gridX1 + 1e-9) {
          rowYs.forEach((rowY, ri) => {
            const inSeg = rowSegmentsList[ri].some(([s0, s1]) => x - Wp / 2 >= s0 - 1e-9 && x + Wp / 2 <= s1 + 1e-9);
            if (inSeg && !isBlockedAt(x, rowY)) {
              const world = toSlopeWorld({ x, y: rowY }, direction);
              panels.push({ id: idc++, x: world.x, y: world.y, rackX: x, rackY: rowY, w: Wp, d: footprintDepth });
            }
          });
          x += Wp + gap;
        }
      }
      clusterTop += rowsHere * footprintDepth + (rowsHere - 1) * gap + extraRowClearance;
      continue;
    }

    // Every row in this cluster shares one rack, so they all pack to the
    // same X-ranges - the intersection of what each row's own depth-band
    // allows (see intersectSegmentLists above), not each row's own full
    // width. `maxRowsThatFit` above only checks that the *depth* is there;
    // for a footprint that isn't a plain axis-aligned rectangle (most
    // visibly a rotated polygon drawn via the "+ Place grid" tool), each
    // row's own valid X-range can shift enough between rows that spreading
    // them across the requested `panelsPerRow` leaves them with *no*
    // shared width at all, even though the depth geometrically fits -
    // previously that produced a whole cluster of zero panels with no
    // fallback (why a grid could go from "packs fine" to "packs nothing"
    // from one panels-per-row bump to the next). Retry with fewer rows in
    // this cluster until they actually share some width, or until only
    // one row's left - a single row can still come up empty (a genuine
    // gap in the roof at that Y), but that's a real absence of room, not
    // an artifact of forcing unrelated rows to share one rack.
    let rowYs, clusterSegments;
    for (;;) {
      rowYs = [];
      for (let i = 0; i < rowsHere; i++) rowYs.push(clusterTop + footprintDepth / 2 + i * (footprintDepth + gap));
      clusterSegments = intersectSegmentLists(rowYs.map((rowY) => scanlineSegmentsForDepth(usablePoly, rowY, footprintDepth / 2)));
      if (clusterSegments.length > 0 || rowsHere <= 1) break;
      rowsHere -= 1;
    }
    const thisClusterDepth = rowsHere * footprintDepth + (rowsHere - 1) * gap;

    rowYs.forEach((rowY) => {
      const rowSegments = scanlineSegmentsForDepth(usablePoly, rowY, footprintDepth / 2);
      rowSegments.forEach(([segX0, segX1]) => {
        let x = segX0 + Wp / 2;
        while (x + Wp / 2 <= segX1 + 1e-9) {
          if (!isBlockedAt(x, rowY)) {
            // `x`/`rackY` stay in local space - the support structure
            // (computeStructure) groups/positions racks using these, so a
            // rack still reads as a straight east-west run regardless of
            // slope direction. `x`/`y` are the real-world position used
            // everywhere else (rendering, shading, obstacle checks).
            const world = toSlopeWorld({ x, y: rowY }, direction);
            panels.push({ id: idc++, x: world.x, y: world.y, rackX: x, rackY: rowY, w: Wp, d: footprintDepth });
          }
          x += Wp + gap;
        }
      });
    });
    clusterTop += thisClusterDepth + extraRowClearance;
  }

  return {
    tilt, azimuth, rowPitch, footprintDepth, panels, panelsPerRow, clusterPitch,
    count: panels.length,
    capacityKW: (panels.length * panelSpec.wattage) / 1000,
    // Carried on the grid so it can be edited in place later (see
    // updateGridSettings in solar_layout_engine.jsx) without needing the
    // roof's own fields at all - each grid is independently configured.
    footprintPolygon: targetPolygon,
    structureStrategy,
    panelTiltDeg,
    rowSpacing,
    orientation,
    rotation: 0,
  };
}

// A grid placed via the polygon tool (as opposed to a plain whole-roof
// "Generate Layout" run) defaults its own panels-per-row to "max" - as many
// rows deep as its own drawn footprint allows, rather than a fixed count -
// since the user just drew that footprint to be exactly the size of one
// rack/table (see README's "Panel grids" entry). Replicates just the
// depth-geometry piece of generateLayout above (tilt/footprintDepth/inset)
// without actually packing anything, since all that's needed here is how
// much depth is available.
export function suggestMaxPanelsPerRow({ roof, footprintPolygon, panelSpec, location }) {
  const { type, slopeDirection } = roof;
  const direction = type === 'pitched' ? (slopeDirection || 'S') : 'S';
  const gap = PANEL_GAP;
  // Called before the grid this footprint is destined for actually exists
  // (see startGridPlacement in solar_layout_engine.jsx) - orientation is a
  // per-grid setting now (see generateLayout above), so there's no grid to
  // read one from yet; assume the same 'portrait' default a new grid gets.
  const Ls = panelSpec.height;
  const tilt = type === 'flat' ? computeAutoTilt(location) : roof.pitchDeg;
  const footprintDepth = type === 'flat' ? Ls * Math.cos(toRad(tilt)) : Ls;

  const localPolygon = footprintPolygon.map((p) => toSlopeLocal(p, direction));
  const edgeMargins = footprintPolygon.map(() => roof.edgeMargin ?? 0.5);
  const usablePoly = insetPolygon(localPolygon, edgeMargins);
  const ys = usablePoly.map((p) => p.y);
  const availableDepth = Math.max(...ys) - Math.min(...ys);

  return Math.max(1, Math.floor((availableDepth + gap) / (footprintDepth + gap)));
}

// ============================================================
// Grid move/rotate (see README's "Panel grids" entry)
// ============================================================
// Moving a grid is a plain translation - it's applied directly to every
// panel's x/y/rackX/rackY and to footprintPolygon (see updateRoofPanels'
// grid-move handler), which is safe: translating every point in a rack by
// the same real-world delta translates their local rackX/rackY by that same
// delta too (toSlopeLocal is a pure rotation, so it distributes over
// addition), so rows that shared an exact rackY before the move still do
// after it - computeStructure's row-grouping keeps working untouched.
//
// Rotating a grid is NOT applied that way. Rotating each panel's world
// position by an arbitrary angle and re-deriving rackX/rackY from the
// result would smear what used to be one straight, shading-safe row into a
// diagonal line of panels whose local Y no longer agrees - exactly the
// invariant computeStructure's `iterateRacks` depends on to group panels
// into racks at all. So a grid's `rotation` is kept as a separate
// presentation-only field instead: the packed geometry (panels/rackX/rackY/
// footprintPolygon) never changes, and every place that needs the grid's
// real on-screen/in-world position or facing (2D plan rendering + hit
// testing, Scene3D, shading, output) asks for it through
// resolvedGridPanels/resolvedGridAzimuth below, which rotate around the
// grid's own footprint center on the way out - a read-time transform, not a
// stored one.
export function gridPivot(grid) {
  const poly = grid.footprintPolygon;
  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
  return { x: cx, y: cy };
}

export function rotateAroundPivot(pt, pivot, deg) {
  if (!deg) return { x: pt.x, y: pt.y };
  const rad = toRad(deg);
  const dx = pt.x - pivot.x, dy = pt.y - pivot.y;
  return {
    x: pivot.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: pivot.y + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

// The grid's panels with `rotation` actually applied to their position -
// what every consumer outside the packing algorithm itself should use.
export function resolvedGridPanels(grid) {
  if (!grid.rotation) return grid.panels;
  const pivot = gridPivot(grid);
  return grid.panels.map((p) => ({ ...p, ...rotateAroundPivot(p, pivot, grid.rotation) }));
}

// The grid's own compass facing with `rotation` folded in - every panel in
// a grid shares one azimuth (see generateLayout above), so rotating the
// whole grid by `rotation` degrees rotates that shared facing by the same
// amount.
export function resolvedGridAzimuth(grid) {
  return grid.azimuth + (grid.rotation || 0);
}

// A grid exactly as `resolvedGridPanels`/`resolvedGridAzimuth` present it -
// for passing straight into computeOutput/getInstantShading, which only
// look at `panels`/`tilt`/`azimuth` and don't otherwise know a grid can be
// rotated.
export function resolvedGrid(grid) {
  if (!grid.rotation) return grid;
  return { ...grid, panels: resolvedGridPanels(grid), azimuth: resolvedGridAzimuth(grid) };
}

// ============================================================
// Grid <-> roof reassignment (moving a grid onto a different roof)
// ============================================================
// A grid stays a permanent data-model child of whichever roof it was
// created/duplicated on (roof.grids) - dragging it around the 2D plan
// only ever moves its panels' x/y, never which roof array it actually
// lives in. That's fine for on-screen position, but every roof-derived
// input a grid's own height/structure depends on (buildingHeight,
// flat/pitched type, pitch, slope direction, min pillar height) comes
// from the *owning* roof, not wherever the grid is now visually sitting -
// drag a grid from a 3m-tall roof onto a 6m-tall one and it renders at
// 3m, floating through the taller roof's own structure. bestRoofForGrid +
// reparentGridToRoof (called from solar_layout_engine.jsx once a grid
// drag actually ends, not live during the drag - see that file) fix this
// the same way obstacleBaseHeight already reads an obstacle's height from
// whichever roof polygon actually contains it, just applied once at drop
// time instead of continuously, since a grid's own packed geometry (not
// just a single height number) depends on it.

// Which roof (if any) a grid's panels currently overlap - tests every
// panel's actual *rendered* position (rotation included, via
// resolvedGridPanels), not just the grid's centroid, so a grid mostly
// hanging off a roof's own edge still counts as being on it - even one
// panel landing inside a roof's polygon is enough. When more than one
// roof overlaps (a grid dragged across the seam between two adjacent
// roofs of different heights), the tallest one wins - it's the one the
// grid would actually end up resting on. Returns null if the grid
// doesn't overlap any roof at all; the caller leaves it on its current
// owner in that case.
export function bestRoofForGrid(grid, roofs) {
  const panels = resolvedGridPanels(grid);
  const overlapping = new Map();
  panels.forEach((p) => {
    roofs.forEach((roof) => {
      if (!overlapping.has(roof.id) && pointInPolygon({ x: p.x, y: p.y }, getRoofPolygon(roof))) {
        overlapping.set(roof.id, roof);
      }
    });
  });
  if (overlapping.size === 0) return null;
  return [...overlapping.values()].reduce((best, r) => (r.buildingHeight > best.buildingHeight ? r : best));
}

// Re-derives a grid's roof-dependent fields once bestRoofForGrid decides
// it now belongs to `newRoof`. buildingHeight and min pillar height need
// nothing here - both are read straight off the owning roof wherever
// they're used (Scene3D, computeStructure), so simply moving the grid
// into newRoof.grids (the caller's job) is enough for those. What *does*
// need recomputing:
//  - rackX/rackY: local packing-space coordinates, derived from each
//    panel's stored (unrotated) world x/y via the roof's own slope
//    direction (toSlopeLocal) - a flat roof's is the identity, a pitched
//    one's isn't, so moving between roof types (or between two pitched
//    roofs facing different ways) leaves computeStructure's row/column
//    grouping reading these in the wrong space entirely if they're not
//    re-derived. World x/y themselves are left untouched - this never
//    moves what the user just dragged.
//  - footprintPolygon: rebuilt from the new rackX/rackY via
//    footprintPolygonFromPanels, same as every other panel-array edit in
//    this file.
//  - tilt/azimuth: only re-derived if the grid was left on "auto"
//    (panelTiltDeg null) - an explicit override is a deliberate user
//    choice and follows the grid across roofs unchanged, same as it
//    would if you changed a roof's own pitch under a grid that's already
//    got one.
// Deliberately leaves footprintDepth/rowPitch/panelsPerRow/panels[].w/.d
// alone - those only matter for a future re-pack (updateGridSettings),
// which by then reads the grid's new owning roof anyway and gets them
// right without this function needing to guess at them now.
export function reparentGridToRoof(grid, newRoof, location) {
  const direction = roofDirection(newRoof);
  const panels = grid.panels.map((p) => {
    const local = toSlopeLocal({ x: p.x, y: p.y }, direction);
    return { ...p, rackX: local.x, rackY: local.y };
  });
  const isPitched = newRoof.type === 'pitched';
  const tilt = grid.panelTiltDeg != null
    ? grid.panelTiltDeg
    : (isPitched ? newRoof.pitchDeg : computeAutoTilt(location));
  const azimuth = isPitched ? slopeDirectionAzimuth(direction) : (location.lat >= 0 ? 180 : 0);
  return {
    ...grid,
    panels,
    tilt,
    azimuth,
    footprintPolygon: footprintPolygonFromPanels(panels, direction) ?? grid.footprintPolygon,
  };
}

// ============================================================
// Add/delete a row or column (see README's "Panel grids" entry)
// ============================================================
// A "row" is every panel sharing one rackY (exact - generateLayout always
// produces exact matches within one grid); a "column" is every panel
// sharing one rackX, matched within COLUMN_TOLERANCE rather than exactly -
// unlike rows, columns aren't guaranteed to land on identical rackX across
// *different* clusters on a non-rectangular footprint (each cluster packs
// its own scanline independently - see generateLayout's cluster loop), so
// two panels a few mm apart are still treated as "the same column". This
// is a best-effort grouping, not exact, on a heavily tapered/concave grid -
// acceptable for v1, same spirit as this file's other documented
// approximations (see e.g. the concave-roof note on iterateRacks).
const COLUMN_TOLERANCE = 0.05;

function roundToTolerance(v, tol) {
  return Math.round(v / tol) * tol;
}

// The grid's own local (rackX/rackY) bounding box, covering every panel's
// full footprint (not just its center point) - the basis for both the
// Add row/column edge-picking UI (2D plan) and for rebuilding
// footprintPolygon after an add. Returns null for an empty grid (nothing
// to add a row/column *to* - see addGridRow/addGridColumn below).
export function gridLocalBounds(grid) {
  if (grid.panels.length === 0) return null;
  const halfW = grid.panels[0].w / 2;
  const halfD = grid.panels[0].d / 2;
  const xs = grid.panels.map((p) => p.rackX);
  const ys = grid.panels.map((p) => p.rackY);
  return {
    minX: Math.min(...xs) - halfW, maxX: Math.max(...xs) + halfW,
    minY: Math.min(...ys) - halfD, maxY: Math.max(...ys) + halfD,
  };
}

// Rebuilds footprintPolygon as the plain rectangle covering `bounds` (local
// space), converted to world points. Only ever used by
// footprintPolygonFromPanels below, as its fallback for whatever
// tracePanelOutline itself can't handle (a hole, or more than one
// disconnected region) - see that function's own comment for why a plain
// bounding rectangle is wrong as the *normal* case.
function rectFootprintFromBounds(bounds, direction) {
  const { minX, maxX, minY, maxY } = bounds;
  const corners = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
  return corners.map((c) => toSlopeWorld(c, direction));
}

// Traces the exact outline of the area `panels` actually cover (local rack
// space) - a rectilinear polygon that can be concave/stepped, not just
// their bounding rectangle. A grid's footprintPolygon is read back for a
// future re-pack (updateGridSettings re-runs generateLayout against it
// whenever panels-per-row/tilt/row-spacing/structure changes) - if it were
// squared off to a bounding rectangle instead, that re-pack would fill in
// whatever gap a deleted row/column/panel (or a delete-split's own
// narrower piece) had left, resurrecting panels that were deliberately
// removed. So this always reflects the *true* occupied shape instead.
//
// Panels never actually touch edge-to-edge (PANEL_GAP within a cluster,
// the bigger shading clearance between clusters), so tracing each panel's
// own physical edges directly would treat every single one as its own
// disconnected island - the real "territory" a row/column occupies runs
// to the *midpoint* between it and its neighbor, same idea as a Voronoi
// split along each axis. So cell boundaries between two adjacent occupied
// positions sit at their midpoint (whatever the real gap between them
// happens to be); only the outermost edge of the whole grid uses the
// panels' own physical edge, since there's no neighbor out there to split
// the boundary with. Rows always match by exact rackY (see
// deleteGridRow's own comment); columns are grouped by COLUMN_TOLERANCE,
// same as everywhere else in this file that groups by rackX.
//
// Once cell boundaries are built this way, adjacent occupied cells share
// a boundary and merge into one continuous region - rasterize into that
// grid of cells, walk the covered region's boundary edges into one closed
// loop, and collapse collinear runs back into straight polygon sides.
// Assumes the result is one simply-connected region with no holes - true
// for every caller in this file (a deleteGridRow/deleteGridColumn split
// already separates a disconnected result into two *separate* grids
// before this ever runs on either piece - see their own comments).
// Returns null (the caller falls back to rectFootprintFromBounds) if that
// assumption doesn't hold, or there's nothing to trace.
function tracePanelOutline(panels: any[]) {
  if (panels.length === 0) return null;
  const halfW = panels[0].w / 2, halfD = panels[0].d / 2;

  const colCenters = [...new Set(panels.map((p) => roundToTolerance(p.rackX, COLUMN_TOLERANCE)))].sort((a, b) => a - b);
  const rowCenters = [...new Set(panels.map((p) => p.rackY))].sort((a, b) => a - b);
  const midpoints = (centers, half) => {
    const bounds = [centers[0] - half];
    for (let i = 1; i < centers.length; i++) bounds.push((centers[i - 1] + centers[i]) / 2);
    bounds.push(centers[centers.length - 1] + half);
    return bounds;
  };
  const xs = midpoints(colCenters, halfW);
  const ys = midpoints(rowCenters, halfD);
  const colIndex = new Map(colCenters.map((v, i) => [v, i]));
  const rowIndex = new Map(rowCenters.map((v, i) => [v, i]));
  const nCols = xs.length - 1, nRows = ys.length - 1;
  if (nCols < 1 || nRows < 1) return null;

  const occupied = Array.from({ length: nRows }, () => new Array(nCols).fill(false));
  panels.forEach((p) => {
    const c = colIndex.get(roundToTolerance(p.rackX, COLUMN_TOLERANCE));
    const r = rowIndex.get(p.rackY);
    occupied[r!][c!] = true;
  });

  // A boundary edge exists on any side of an occupied cell that isn't
  // shared with another occupied cell. Each is stored as a directed
  // segment oriented so the occupied region is on its right - walking
  // them tail-to-head traces the outline as one consistent loop.
  let segs: any[] = [];
  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      if (!occupied[r][c]) continue;
      const x0 = xs[c], x1 = xs[c + 1], y0 = ys[r], y1 = ys[r + 1];
      if (r === 0 || !occupied[r - 1][c]) segs.push([[x0, y0], [x1, y0]]);
      if (r === nRows - 1 || !occupied[r + 1][c]) segs.push([[x1, y1], [x0, y1]]);
      if (c === 0 || !occupied[r][c - 1]) segs.push([[x0, y1], [x0, y0]]);
      if (c === nCols - 1 || !occupied[r][c + 1]) segs.push([[x1, y0], [x1, y1]]);
    }
  }
  if (segs.length === 0) return null;

  const byStart = new Map();
  segs.forEach((seg) => {
    const key = seg[0].join(',');
    if (!byStart.has(key)) byStart.set(key, []);
    byStart.get(key).push(seg);
  });

  const used = new Set();
  const first = segs[0];
  const loop = [first[0]];
  let current = first;
  used.add(current);
  for (;;) {
    const nextKey = current[1].join(',');
    if (nextKey === first[0].join(',')) break;
    const candidates = (byStart.get(nextKey) || []).filter((s) => !used.has(s));
    if (candidates.length !== 1) return null; // dead end, or an ambiguous junction (a pinch point) - bail
    current = candidates[0];
    used.add(current);
    loop.push(current[0]);
  }
  if (used.size !== segs.length) return null; // more than one loop (a hole, or a disconnected piece)

  const n = loop.length;
  let simplified: any[] = [];
  for (let i = 0; i < n; i++) {
    const prev = loop[(i - 1 + n) % n], cur = loop[i], next = loop[(i + 1) % n];
    const collinear = (prev[0] === cur[0] && cur[0] === next[0]) || (prev[1] === cur[1] && cur[1] === next[1]);
    if (!collinear) simplified.push({ x: cur[0], y: cur[1] });
  }
  return simplified.length >= 3 ? simplified : null;
}

// The one place every panel-array edit in this file (add/delete
// row/column/panel, and each piece of a delete-split) should rebuild
// footprintPolygon from - traces the real occupied outline, only falling
// back to a squared-off bounding rectangle in tracePanelOutline's own
// documented edge cases.
function footprintPolygonFromPanels(panels, direction) {
  const outline = tracePanelOutline(panels);
  if (outline) return outline.map((p) => toSlopeWorld(p, direction));
  const bounds = gridLocalBounds({ panels });
  return bounds ? rectFootprintFromBounds(bounds, direction) : null;
}

function roofDirection(roof) {
  return roof.type === 'pitched' ? (roof.slopeDirection || 'S') : 'S';
}

function withRecomputedTotals(grid, panels) {
  const wattPerPanel = grid.count > 0 ? grid.capacityKW / grid.count : 0;
  return { ...grid, panels, count: panels.length, capacityKW: panels.length * wattPerPanel };
}

// Appends one more shading-safe cluster's worth of rows (`panelsPerRow`
// deep, same as every other cluster in this grid) to the front or back of
// a grid, replicating the columns of whichever existing row sits right at
// that edge - not every column anywhere in the grid. A grid packed against
// a non-rectangular footprint (a tapered or rotated roof edge clips
// different rows by different amounts) can be stepped, so the front row
// and the back row don't necessarily share the same columns; mirroring the
// edge row itself is what keeps the new row's panel count matching it and
// each new panel adjacent to the one it's replicating. Force-added: no
// roof-boundary or obstacle checks (see README's "Panel grids" entry) -
// once a grid exists it's already treated as freely placed (the same
// philosophy grid move/rotate already use), so growing it doesn't get
// tied back to the roof it happened to be created on. Deliberately does
// NOT call generateLayout - a full re-pack of the extended footprint could
// shift/resize the *existing* panels too (different edge-margin/obstacle
// interactions against the bigger boundary), which isn't what "add a row"
// should ever do to panels that were already placed.
export function addGridRow(grid, roof, side) {
  const bounds = gridLocalBounds(grid);
  if (!bounds) return grid;
  const direction = roofDirection(roof);
  const gap = PANEL_GAP;
  const footprintDepth = grid.footprintDepth;
  const panelsPerRow = Math.max(1, grid.panelsPerRow || 1);
  // rowPitch is the single-panel-deep row-to-row pitch (see
  // generateLayout); the extra shading clearance beyond one panel's own
  // footprint is what still applies once between this new cluster and the
  // existing one, same as between any two clusters.
  const extraRowClearance = grid.rowPitch - footprintDepth;
  const clusterDepth = panelsPerRow * footprintDepth + (panelsPerRow - 1) * gap;

  const sortedRowYs = [...new Set<number>(grid.panels.map((p: any) => p.rackY))].sort((a: number, b: number) => a - b);
  const edgeRowY = side === 'front' ? sortedRowYs[0] : sortedRowYs[sortedRowYs.length - 1];
  const columnXs = grid.panels.filter((p) => p.rackY === edgeRowY).map((p) => p.rackX);
  const w = grid.panels[0].w;

  const clusterTop = side === 'front'
    ? bounds.minY - extraRowClearance - clusterDepth
    : bounds.maxY + extraRowClearance;

  let nextId = Math.max(...grid.panels.map((p) => p.id)) + 1;
  let newPanels: any[] = [];
  for (let i = 0; i < panelsPerRow; i++) {
    const rowY = clusterTop + footprintDepth / 2 + i * (footprintDepth + gap);
    columnXs.forEach((rackX) => {
      const world = toSlopeWorld({ x: rackX, y: rowY }, direction);
      newPanels.push({ id: nextId++, x: world.x, y: world.y, rackX, rackY: rowY, w, d: footprintDepth });
    });
  }

  const panels = [...grid.panels, ...newPanels];
  return {
    ...withRecomputedTotals(grid, panels),
    footprintPolygon: footprintPolygonFromPanels(panels, direction),
  };
}

// Same idea as addGridRow, but appends one panel to the left or right end of
// every existing row instead of a whole new row. Unlike addGridRow (which
// mirrors the columns of a single reference row - safe because rows always
// share an exact rackY, see the invariant noted above COLUMN_TOLERANCE),
// there's no reliable single "edge column" to mirror here: columns are only
// ever a best-effort, tolerance-based grouping in the first place, since
// each row's cluster can pack against the roof polygon with slightly
// different rackX (see COLUMN_TOLERANCE's own comment) - trying to find
// "the" edge column by clustering rackX values across the whole grid is
// exactly what broke here, because which panels a tolerance-based cluster
// picks up is sensitive to exactly where the jitter happens to fall.
// Working row-by-row sidesteps that entirely: each row's own new panel is
// placed directly off that same row's own existing edge panel, so it's
// always adjacent to it regardless of what any other row's rackX happens to
// be - no cross-row matching needed at all.
export function addGridColumn(grid, roof, side) {
  if (grid.panels.length === 0) return grid;
  const direction = roofDirection(roof);
  const gap = PANEL_GAP;
  const w = grid.panels[0].w;
  const footprintDepth = grid.footprintDepth;

  const rowYs = [...new Set(grid.panels.map((p) => p.rackY))];

  let nextId = Math.max(...grid.panels.map((p) => p.id)) + 1;
  const newPanels = rowYs.map((rowY) => {
    const rowPanels = grid.panels.filter((p) => p.rackY === rowY);
    const edgeX = side === 'left'
      ? Math.min(...rowPanels.map((p) => p.rackX))
      : Math.max(...rowPanels.map((p) => p.rackX));
    const rackX = side === 'left' ? edgeX - gap - w : edgeX + gap + w;
    const world = toSlopeWorld({ x: rackX, y: rowY }, direction);
    return { id: nextId++, x: world.x, y: world.y, rackX, rackY: rowY, w, d: footprintDepth };
  });

  const panels = [...grid.panels, ...newPanels];
  return {
    ...withRecomputedTotals(grid, panels),
    footprintPolygon: footprintPolygonFromPanels(panels, direction),
  };
}

// Removes every panel sharing `rackY` (a whole row - see the tolerance
// comment above COLUMN_TOLERANCE; rows match exactly, no tolerance
// needed). Deleting an *interior* row - one with other rows both in front
// of and behind it - leaves what's left in two pieces with nothing
// physically connecting them any more, so this returns an array: one grid
// if the row was at the front or back edge (nothing on the far side of it
// goes missing, so the remainder is still one contiguous grid, same as
// before this split behavior existed), two if it was interior (a front
// grid and a back grid, each keeping every other setting - tilt/row
// spacing/structure/panels-per-row/rotation - from the original). Only
// the first piece keeps `source: 'wholeRoof'` when the original had it -
// see regenerateAllGrids in solar_layout_engine.jsx, which tracks a
// roof's primary grid by finding the *first* grid with that source; a
// second piece keeping it too would make a later "Fill full roof" run
// leave that second piece behind as an orphaned duplicate instead of
// managing it. This file stays free of Date.now()/Math.random() (see
// AGENTS.md's "Conventions") - solar_layout_engine.jsx's
// applyGridDeleteSelection is responsible for giving whichever piece
// isn't first a fresh id before it goes into `roofs` state.
export function deleteGridRow(grid, rackY, roof) {
  const direction = roofDirection(roof);
  const sortedYs = [...new Set(grid.panels.map((p) => p.rackY) as any[])].sort((a, b) => a - b);
  const panels = grid.panels.filter((p) => p.rackY !== rackY);
  const idx = sortedYs.indexOf(rackY);
  const isInterior = idx > 0 && idx < sortedYs.length - 1;
  if (!isInterior || panels.length === 0) {
    return [{ ...withRecomputedTotals(grid, panels), footprintPolygon: footprintPolygonFromPanels(panels, direction) ?? grid.footprintPolygon }];
  }

  const front = panels.filter((p) => p.rackY < rackY);
  const back = panels.filter((p) => p.rackY > rackY);
  return [front, back].filter((ps) => ps.length > 0).map((ps, i) => ({
    ...withRecomputedTotals(grid, ps),
    footprintPolygon: footprintPolygonFromPanels(ps, direction),
    source: i === 0 ? grid.source : (grid.source === 'wholeRoof' ? 'drawn' : grid.source),
  }));
}

// Groups a grid's panels by row (exact rackY, same invariant as everywhere
// else in this file) and sorts each row left to right by rackX - the basis
// for matching "the same column" by position instead of by a shared rackX,
// since rows can have different panel counts (a grid stepped by a tapered
// or rotated roof edge) and there's then no single geometric rackX every
// row's "column" panel actually shares (see addGridColumn's own comment on
// why it moved away from rackX-based matching for the same reason).
function rowGroupsByPosition(grid) {
  const rowGroups = new Map();
  grid.panels.forEach((p) => {
    if (!rowGroups.has(p.rackY)) rowGroups.set(p.rackY, []);
    rowGroups.get(p.rackY).push(p);
  });
  rowGroups.forEach((ps) => ps.sort((a, b) => a.rackX - b.rackX));
  return rowGroups;
}

// The "column" `panelId` belongs to, defined by its left-to-right position
// within its own row rather than by rackX - every other row's panel at that
// same position (if that row reaches that far) is the match; a row too
// short to have a panel there is simply left out. `index` is 0 for the
// leftmost panel in `panelId`'s own row. Shared by the "select column" UI
// (for highlighting the match before it's deleted) and deleteGridColumn
// (for actually deleting it) so both agree on exactly the same set.
export function columnIndexMatch(grid, panelId) {
  const rowGroups = rowGroupsByPosition(grid);
  const clicked = grid.panels.find((p) => p.id === panelId);
  if (!clicked) return { index: -1, matches: [], rowGroups };
  const index = rowGroups.get(clicked.rackY).indexOf(clicked);
  const matches: any[] = [];
  rowGroups.forEach((ps) => { if (index < ps.length) matches.push(ps[index]); });
  return { index, matches, rowGroups };
}

// Same idea as deleteGridRow, but removes the panel at `panelId`'s own
// column position (see columnIndexMatch above) from every row that reaches
// it, splitting left/right on an interior position the same way deleteGridRow
// splits front/back on an interior row.
export function deleteGridColumn(grid, panelId, roof) {
  const direction = roofDirection(roof);
  const { index, matches, rowGroups } = columnIndexMatch(grid, panelId);
  if (index < 0) return [grid];

  const removeIds = new Set(matches.map((p) => p.id));
  const panels = grid.panels.filter((p) => !removeIds.has(p.id));
  const isInterior = index > 0 && matches.some((p) => index < rowGroups.get(p.rackY).length - 1);
  if (!isInterior || panels.length === 0) {
    return [{ ...withRecomputedTotals(grid, panels), footprintPolygon: footprintPolygonFromPanels(panels, direction) ?? grid.footprintPolygon }];
  }

  const left: any[] = [];
  const right: any[] = [];
  rowGroups.forEach((ps) => {
    ps.forEach((p, i) => {
      if (removeIds.has(p.id)) return;
      (i < index ? left : right).push(p);
    });
  });
  return [left, right].filter((ps) => ps.length > 0).map((ps, i) => ({
    ...withRecomputedTotals(grid, ps),
    footprintPolygon: footprintPolygonFromPanels(ps, direction),
    source: i === 0 ? grid.source : (grid.source === 'wholeRoof' ? 'drawn' : grid.source),
  }));
}

// Removes just the one panel.
export function deleteGridPanel(grid, panelId, roof) {
  const panels = grid.panels.filter((p) => p.id !== panelId);
  return { ...withRecomputedTotals(grid, panels), footprintPolygon: footprintPolygonFromPanels(panels, roofDirection(roof)) ?? grid.footprintPolygon };
}

// ============================================================
// Mounting structure strategies
// ============================================================
// Every strategy below computes { racks, panelHeights, totals } for the
// same layout, using a shared generic member representation so Scene3D can
// render any strategy the same way instead of knowing its specific shape:
//   racks: [{ y, depth, segments: [{ xStart, xEnd, midX, members }] }]
//   members: [{ kind, from: [x,y,z], to: [x,y,z], thickness }, ...]
// `from`/`to` are local coordinates relative to the segment's own group
// origin (midX, rack center-Y, roof height) - Scene3D positions/rotates
// that group once (matching the panels it holds) and every member is just
// a straight bar between two local points, styled by `kind`.
// `totals` is { [kind]: { length, count } }, always a direct sum of the
// members actually returned - not a separate estimate.
const PILLAR_SPACING = 3; // max meters between intermediate pillar positions along a row
const PILLAR_END_MARGIN_FRAC = 0.08; // pillars stay inset from a segment's own ends, not right at them
const MAX_PILLAR_END_MARGIN = 0.4;
const LEG_END_MARGIN_FRAC = 0.12; // legs also stay inset from the chord's own front/back ends, not right at them
const MAX_LEG_END_MARGIN = 0.4;
const BRACE_BASE_MARGIN_FRAC = 0.15; // braces attach above the pillar's own base, not right at it
const MAX_BRACE_BASE_MARGIN = 0.3;
const DEFAULT_MIN_PILLAR_HEIGHT = 0.15; // fallback when roof.minPillarHeight isn't set
// The two support bars cross each panel at 20%/80% of its own depth, not
// right at its edges - roughly where real racking clamps go to minimize
// cantilever bending.
const PURLIN_FRACTIONS = [0.2, 0.8];

// Member thicknesses, shared with Scene3D's rendering, used here to stack
// the layers correctly: chords carry the load, purlins rest on top of the
// chords, and panels rest on top of the purlins - each layer offset up by
// the one below it rather than all three sharing one plane.
const PILLAR_THICKNESS = 0.08;
const CHORD_THICKNESS = 0.08;
const PURLIN_THICKNESS = 0.03;
const BRACE_THICKNESS = 0.05;
const PANEL_THICKNESS = 0.03;
const PURLIN_PLANE_OFFSET = CHORD_THICKNESS / 2 + PURLIN_THICKNESS / 2;
const PANEL_PLANE_OFFSET = CHORD_THICKNESS / 2 + PURLIN_THICKNESS + PANEL_THICKNESS / 2;

// Groups panels into racks (`layout.panelsPerRow` panels stacked
// front-to-back sharing one structure, not one per panel), and within each
// rack, into contiguous x-segments (a concave roof can leave more than one
// run of panels on the same rack, each needing its own independent
// structure). Shared by every strategy below.
// Groups/positions racks using each panel's own `rackX`/`rackY` - its
// position in the roof's local "south-facing" space (see generateLayout's
// `direction` handling) - rather than its real-world `x`/`y`, so a rack
// still reads as a straight east-west run and this whole module doesn't
// need to know which way the roof actually faces. The resulting
// `rackTop`/`xStart`/`xEnd`/`midX` values are therefore local-space too;
// Scene3D rotates a rack's own anchor position back into the world via
// the same toSlopeWorld transform when it renders one.
function* iterateRacks(layout) {
  const footprintDepth = layout.footprintDepth;
  const panelsPerRow = Math.max(1, layout.panelsPerRow || 1);
  const rowMap = new Map();
  layout.panels.forEach((p) => {
    if (!rowMap.has(p.rackY)) rowMap.set(p.rackY, []);
    rowMap.get(p.rackY).push(p);
  });
  const sortedYs = [...rowMap.keys()].sort((a, b) => a - b);

  for (let ci = 0; ci * panelsPerRow < sortedYs.length; ci++) {
    const rackYs = sortedYs.slice(ci * panelsPerRow, ci * panelsPerRow + panelsPerRow);
    const rackTop = rackYs[0] - footprintDepth / 2;
    const rackDepth = rackYs[rackYs.length - 1] + footprintDepth / 2 - rackTop;

    // The first sub-row's x-extent stands in for the whole rack's
    // structure - a simplification: on a concave roof a different sub-row
    // sharing this rack could in principle have a different extent, which
    // isn't captured here.
    const representative = rowMap.get(rackYs[0]).slice().sort((a, b) => a.rackX - b.rackX);
    let runs: any[] = [];
    let current = [representative[0]];
    for (let i = 1; i < representative.length; i++) {
      const prevEdge = current[current.length - 1].rackX + current[current.length - 1].w / 2;
      const nextStart = representative[i].rackX - representative[i].w / 2;
      if (nextStart - prevEdge > 0.05) {
        runs.push(current);
        current = [representative[i]];
      } else {
        current.push(representative[i]);
      }
    }
    runs.push(current);

    const xSegments = runs.map((segPanels) => ({
      xStart: segPanels[0].rackX - segPanels[0].w / 2,
      xEnd: segPanels[segPanels.length - 1].rackX + segPanels[segPanels.length - 1].w / 2,
    }));

    yield { rackYs, rackTop, rackDepth, xSegments, rowMap };
  }
}

// The Y coordinate (world, pre-azimuth-rotation) of the roof's own front
///eave edge - the first (lowest-Y) rack's own top edge. A pitched roof's
// panel array is one continuous sloped plane, so height needs to climb
// from this single shared origin all the way to the back/ridge edge, not
// reset to a flat baseline at the start of every row the way a flat
// roof's independently-tilted racks do (each of those really is its own
// separate raised structure, so resetting per rack is correct there).
function pitchedRoofFrontY(layout) {
  let minY = Infinity;
  for (const { rackTop } of iterateRacks(layout)) {
    if (rackTop < minY) minY = rackTop;
  }
  return minY;
}

// The Y coordinate of the roof's own back/ridge edge - the last
// (highest-Y) rack's own bottom edge. Used alongside pitchedRoofFrontY
// when the rack's own tilt is shallower than the roof's own pitch (see
// pitchedHeightAtY) - the two edges of the roof play different limiting
// roles depending on which of the two angles is steeper.
function pitchedRoofRidgeY(layout) {
  let maxY = -Infinity;
  for (const { rackTop, rackDepth } of iterateRacks(layout)) {
    if (rackTop + rackDepth > maxY) maxY = rackTop + rackDepth;
  }
  return maxY;
}

// How high a rack needs to stand at local-space position `y` to stay
// minPillarHeight clear of the roof's own sloped deck along its whole run,
// given the rack's own tilt can be set shallower OR steeper than the
// roof's own pitch (see roof.panelTiltDeg vs roof.pitchDeg):
//  - tilt >= pitch: the rack's own plane climbs at least as fast as the
//    deck does, so anchoring a constant minPillarHeight stand at the
//    eave and climbing at `tilt` from there keeps it clear everywhere
//    else too - the eave is the tightest point, and this is just the
//    plain single-origin climb used everywhere else in this file.
//  - tilt < pitch: the deck climbs *faster* than the rack does, so a
//    stand anchored at the eave would eventually be overtaken by the
//    deck further back (the panels ending up buried in the roof) - the
//    ridge is the tightest point instead, so the stand is anchored there
//    and gets *taller* toward the eave rather than the ridge.
function pitchedHeightAtY(y, { frontY, ridgeY, minPillarHeight, tiltRad, pitchRad }) {
  if (tiltRad >= pitchRad) {
    return minPillarHeight + (y - frontY) * Math.tan(tiltRad);
  }
  const totalDepth = ridgeY - frontY;
  return minPillarHeight + totalDepth * Math.tan(pitchRad) - (ridgeY - y) * Math.tan(tiltRad);
}

// Every panel on a rack shares the one continuous tilted plane, so a panel
// further back sits correspondingly higher - not at the same height as the
// one in front of it. Shared by computePanelHeights and
// computeSteppedPanelHeights below - they differ only in how panels are
// grouped for the flat-roof branch's `rackTop` baseline (see the comment on
// computeSteppedPanelHeights for why that grouping actually matters here,
// unlike everywhere else in this file where "which rack a panel belongs to"
// is just a bookkeeping detail).
function heightsForPanelGroups(groups, { roof, layout, minPillarHeight }) {
  const isPitched = roof.type === 'pitched';
  const tiltRad = toRad(layout.tilt);
  const pitchRad = isPitched ? toRad(roof.pitchDeg) : 0;
  const footprintDepth = layout.footprintDepth;
  const panelHeights = new Map();
  const frontY = isPitched ? pitchedRoofFrontY(layout) : 0;
  const ridgeY = isPitched ? pitchedRoofRidgeY(layout) : 0;

  for (const { rackTop, panels } of groups) {
    panels.forEach((p) => {
      const footprintFrontY = p.rackY - footprintDepth / 2;
      const footprintBackY = footprintFrontY + footprintDepth;
      if (isPitched) {
        panelHeights.set(p.id, {
          frontHeight: pitchedHeightAtY(footprintFrontY, { frontY, ridgeY, minPillarHeight, tiltRad, pitchRad }) + PANEL_PLANE_OFFSET,
          backHeight: pitchedHeightAtY(footprintBackY, { frontY, ridgeY, minPillarHeight, tiltRad, pitchRad }) + PANEL_PLANE_OFFSET,
        });
        return;
      }
      const frontOffset = footprintFrontY - rackTop;
      const backOffset = frontOffset + footprintDepth;
      panelHeights.set(p.id, {
        frontHeight: minPillarHeight + frontOffset * Math.tan(tiltRad) + PANEL_PLANE_OFFSET,
        backHeight: minPillarHeight + backOffset * Math.tan(tiltRad) + PANEL_PLANE_OFFSET,
      });
    });
  }
  return panelHeights;
}

function computePanelHeights({ roof, layout, minPillarHeight }) {
  let groups: any[] = [];
  for (const { rackYs, rackTop, rowMap } of iterateRacks(layout)) {
    let panels: any[] = [];
    rackYs.forEach((y) => rowMap.get(y).forEach((p) => panels.push(p)));
    groups.push({ rackTop, panels });
  }
  return heightsForPanelGroups(groups, { roof, layout, minPillarHeight });
}

// The Roof mount (stepped) strategy's own panel-height calc - NOT just
// computePanelHeights reused, because its `rackTop` baseline means
// something different here. Every other strategy's rackTop is the whole
// rack's own front edge (iterateRacks), the same reference
// computeSteppedTrussStructure resets each BAY's own height to
// minPillarHeight against instead (see that function and
// iterateSteppedRackBays' own comment on why a tapering-end column gets
// its own shorter bay). A panel in such a bay is on the SAME tilted plane
// as the rest of its rack, just starting further back - so heighting it
// against the whole rack's rackTop (like computePanelHeights does) climbs
// it higher than the bay's own reset-to-minPillarHeight legs actually
// reach, floating it above its own support. Bug seen in practice: on an
// irregular (e.g. L-shaped) roof with panelsPerRow deep enough for a
// tapering column to fall inside the same rack as a full-depth one, this
// showed as panels visibly hovering above their legs once Roof mount
// (stepped) was selected - worse the deeper panelsPerRow went, since a
// taller rack grouping makes a mid-rack extent change more likely.
function computeSteppedPanelHeights({ roof, layout, minPillarHeight }) {
  return heightsForPanelGroups(iterateSteppedRackBays(layout), { roof, layout, minPillarHeight });
}

// Two thin purlins per panel on the rack, crossing perpendicular to the
// chords at 20%/80% of that panel's own depth (not at its edges) and
// spanning the segment's full width - shared by every strategy ("purlins
// run the same way" regardless of what's holding the chords up). Takes the
// caller's own `heightAtY` rather than rebuilding it, since a pitched
// roof's isn't always the simple single-origin climb a flat roof's is
// (see pitchedHeightAtY).
function buildPurlinMembers({ rackYs, footprintDepth, heightAtY, xStart, xEnd, centerY }) {
  const halfLen = (xEnd - xStart) / 2;
  let members: any[] = [];
  rackYs.forEach((y) => {
    const frontEdge = y - footprintDepth / 2;
    PURLIN_FRACTIONS.forEach((f) => {
      const py = frontEdge + f * footprintDepth;
      const h = heightAtY(py) + PURLIN_PLANE_OFFSET;
      const z = py - centerY;
      members.push({ kind: 'purlin', from: [-halfLen, h, z], to: [halfLen, h, z], thickness: PURLIN_THICKNESS });
    });
  });
  return members;
}

function addTotal(totals, kind, length, count) {
  if (!totals[kind]) totals[kind] = { length: 0, count: 0 };
  totals[kind].length += length;
  totals[kind].count += count;
}

// Strategy 1: truss - a leg at each pillar position along the row, spaced
// every PILLAR_SPACING and inset from the segment's own ends, joined by one
// wide tilted chord spanning the rack's full depth. Legs are *also* spaced
// every PILLAR_SPACING along the depth axis (reusing the same constant -
// one leg at the chord's own front/back ends plus intermediate legs for any
// rack deeper than PILLAR_SPACING, rather than just the two end legs an
// unbraced long chord would sag under) - see the "Mounting structure" entry
// in README.md's history. A pitched roof's racks all climb from the same
// shared front edge (see pitchedRoofFrontY) rather than each resetting to a
// flat baseline, so the chords/pillars connect into one continuous sloped
// structure across the whole array instead of a disconnected stack of
// individually-tilted rows.
function computeTrussStructure({ roof, layout }) {
  const isPitched = roof.type === 'pitched';
  const tiltRad = toRad(layout.tilt);
  const pitchRad = isPitched ? toRad(roof.pitchDeg) : 0;
  const footprintDepth = layout.footprintDepth;
  const minPillarHeight = roof.minPillarHeight ?? DEFAULT_MIN_PILLAR_HEIGHT;
  const frontY = isPitched ? pitchedRoofFrontY(layout) : 0;
  const ridgeY = isPitched ? pitchedRoofRidgeY(layout) : 0;
  const heightAtY = (y, rackTop) => isPitched
    ? pitchedHeightAtY(y, { frontY, ridgeY, minPillarHeight, tiltRad, pitchRad })
    : minPillarHeight + (y - rackTop) * Math.tan(tiltRad);

  let racks: any[] = [];
  const totals = {};

  for (const { rackYs, rackTop, rackDepth, xSegments } of iterateRacks(layout)) {
    const frontHeight = heightAtY(rackTop, rackTop);
    const backHeight = heightAtY(rackTop + rackDepth, rackTop);
    const centerY = rackTop + rackDepth / 2;
    const halfDepth = rackDepth / 2;

    // Legs attach inset from the chord's own front/back ends too, so the
    // chord overhangs a little past its two supports at both ends rather
    // than a leg sitting right at the tip. Between those two inset ends,
    // legs are spaced every PILLAR_SPACING along the depth axis (same rule
    // used along a row's width) - `legYs` is just the two end legs when the
    // usable depth fits in one PILLAR_SPACING, with intermediate legs added
    // for anything deeper.
    const legInset = Math.min(MAX_LEG_END_MARGIN, rackDepth * LEG_END_MARGIN_FRAC);
    const usableLegDepth = Math.max(rackDepth - 2 * legInset, 0);
    const numDepthLegs = Math.max(2, Math.ceil(usableLegDepth / PILLAR_SPACING) + 1);
    const legYs = Array.from({ length: numDepthLegs }, (_, i) => rackTop + legInset + (usableLegDepth * i) / (numDepthLegs - 1));

    const segments = xSegments.map(({ xStart, xEnd }) => {
      const length = xEnd - xStart;
      const midX = (xStart + xEnd) / 2;

      // Pillars stay inset from the segment's own left/right ends, rather
      // than sitting exactly at them.
      const margin = Math.min(MAX_PILLAR_END_MARGIN, length * PILLAR_END_MARGIN_FRAC);
      const usableStart = xStart + margin;
      const usableLength = Math.max(length - 2 * margin, 0);
      const numPillars = Math.max(2, Math.ceil(usableLength / PILLAR_SPACING) + 1);
      const pillarXs = Array.from({ length: numPillars }, (_, i) => usableStart + (usableLength * i) / (numPillars - 1));

      let members: any[] = [];
      pillarXs.forEach((px) => {
        const localX = px - midX;
        legYs.forEach((ly) => {
          const legHeight = heightAtY(ly, rackTop);
          const legZ = ly - centerY;
          members.push({ kind: 'pillar', from: [localX, 0, legZ], to: [localX, legHeight, legZ], thickness: PILLAR_THICKNESS });
          addTotal(totals, 'pillar', legHeight, 1);
        });
        members.push({ kind: 'chord', from: [localX, frontHeight, -halfDepth], to: [localX, backHeight, halfDepth], thickness: CHORD_THICKNESS });

        addTotal(totals, 'chord', Math.hypot(rackDepth, backHeight - frontHeight), 1);
      });

      const purlinMembers = buildPurlinMembers({ rackYs, footprintDepth, heightAtY: (y) => heightAtY(y, rackTop), xStart, xEnd, centerY });
      members.push(...purlinMembers);
      addTotal(totals, 'purlin', purlinMembers.length * length, purlinMembers.length);

      return { xStart, xEnd, midX, members };
    });

    racks.push({ y: rackTop, depth: rackDepth, segments });
  }

  return { racks, totals, panelHeights: computePanelHeights({ roof, layout, minPillarHeight }) };
}

// Strategy 2: ground mount, minimum pillars - one central pillar per
// position (at the rack's mid-depth) instead of a front+back leg pair,
// supporting the chord at its midpoint. A single post can't hold a tilted
// chord stable on its own, so two diagonal braces run from the pillar's
// base to each end of the chord, triangulating it - the minimum needed to
// keep a single-post support stable under a tilted load. For a rack deeper
// than PILLAR_SPACING, the central pillar + two braces alone would still
// leave the chord spanning an unsupported PILLAR_SPACING+ gap on either
// side, so straight vertical pillars are added at intermediate depth
// positions (same PILLAR_SPACING rule as the truss strategy and as this
// strategy's own width spacing) - unbraced, since they only need to catch
// sag between the center post and the braced ends, not stabilize the whole
// rack on their own. Purlins are unchanged from the truss strategy.
function computeGroundMountStructure({ roof, layout }) {
  const isPitched = roof.type === 'pitched';
  const tiltRad = toRad(layout.tilt);
  const pitchRad = isPitched ? toRad(roof.pitchDeg) : 0;
  const footprintDepth = layout.footprintDepth;
  const minPillarHeight = roof.minPillarHeight ?? DEFAULT_MIN_PILLAR_HEIGHT;
  const frontY = isPitched ? pitchedRoofFrontY(layout) : 0;
  const ridgeY = isPitched ? pitchedRoofRidgeY(layout) : 0;
  const heightAtY = (y, rackTop) => isPitched
    ? pitchedHeightAtY(y, { frontY, ridgeY, minPillarHeight, tiltRad, pitchRad })
    : minPillarHeight + (y - rackTop) * Math.tan(tiltRad);

  let racks: any[] = [];
  const totals = {};

  for (const { rackYs, rackTop, rackDepth, xSegments } of iterateRacks(layout)) {
    const frontHeight = heightAtY(rackTop, rackTop);
    const backHeight = heightAtY(rackTop + rackDepth, rackTop);
    const centerY = rackTop + rackDepth / 2;
    const centerHeight = heightAtY(centerY, rackTop);
    const halfDepth = rackDepth / 2;

    // Braces stay inset from the chord's own front/back ends (same as the
    // truss strategy's legs - not attaching right at the chord's tips) and
    // from the pillar's own base (not attaching right at ground/roof level).
    const braceInset = Math.min(MAX_LEG_END_MARGIN, rackDepth * LEG_END_MARGIN_FRAC);
    const braceFrontHeight = heightAtY(rackTop + braceInset, rackTop);
    const braceBackHeight = heightAtY(rackTop + rackDepth - braceInset, rackTop);
    const braceHalfDepth = halfDepth - braceInset;
    const baseMargin = Math.min(MAX_BRACE_BASE_MARGIN, centerHeight * BRACE_BASE_MARGIN_FRAC);

    // Intermediate, unbraced depth supports between the braced front/back
    // ends - same PILLAR_SPACING rule as the truss strategy's legs. Empty
    // when the rack's usable depth fits in one PILLAR_SPACING, so a small
    // rack's structure is unchanged from before.
    const usableLegDepth = Math.max(rackDepth - 2 * braceInset, 0);
    const numDepthLegs = Math.max(2, Math.ceil(usableLegDepth / PILLAR_SPACING) + 1);
    const intermediateLegYs = Array.from({ length: numDepthLegs }, (_, i) => rackTop + braceInset + (usableLegDepth * i) / (numDepthLegs - 1)).slice(1, -1);

    const segments = xSegments.map(({ xStart, xEnd }) => {
      const length = xEnd - xStart;
      const midX = (xStart + xEnd) / 2;

      // Same end-margin philosophy as the truss strategy, just fewer
      // vertical pillars (one central post per position instead of two).
      const margin = Math.min(MAX_PILLAR_END_MARGIN, length * PILLAR_END_MARGIN_FRAC);
      const usableStart = xStart + margin;
      const usableLength = Math.max(length - 2 * margin, 0);
      const numPillars = Math.max(2, Math.ceil(usableLength / PILLAR_SPACING) + 1);
      const pillarXs = Array.from({ length: numPillars }, (_, i) => usableStart + (usableLength * i) / (numPillars - 1));

      let members: any[] = [];
      pillarXs.forEach((px) => {
        const localX = px - midX;
        members.push({ kind: 'pillar', from: [localX, 0, 0], to: [localX, centerHeight, 0], thickness: PILLAR_THICKNESS });
        members.push({ kind: 'chord', from: [localX, frontHeight, -halfDepth], to: [localX, backHeight, halfDepth], thickness: CHORD_THICKNESS });
        members.push({ kind: 'brace', from: [localX, baseMargin, 0], to: [localX, braceFrontHeight, -braceHalfDepth], thickness: BRACE_THICKNESS });
        members.push({ kind: 'brace', from: [localX, baseMargin, 0], to: [localX, braceBackHeight, braceHalfDepth], thickness: BRACE_THICKNESS });
        intermediateLegYs.forEach((ly) => {
          const legHeight = heightAtY(ly, rackTop);
          const legZ = ly - centerY;
          members.push({ kind: 'pillar', from: [localX, 0, legZ], to: [localX, legHeight, legZ], thickness: PILLAR_THICKNESS });
          addTotal(totals, 'pillar', legHeight, 1);
        });

        addTotal(totals, 'pillar', centerHeight, 1);
        addTotal(totals, 'chord', Math.hypot(rackDepth, backHeight - frontHeight), 1);
        addTotal(
          totals, 'brace',
          Math.hypot(braceHalfDepth, braceFrontHeight - baseMargin) + Math.hypot(braceHalfDepth, braceBackHeight - baseMargin),
          2
        );
      });

      const purlinMembers = buildPurlinMembers({ rackYs, footprintDepth, heightAtY: (y) => heightAtY(y, rackTop), xStart, xEnd, centerY });
      members.push(...purlinMembers);
      addTotal(totals, 'purlin', purlinMembers.length * length, purlinMembers.length);

      return { xStart, xEnd, midX, members };
    });

    racks.push({ y: rackTop, depth: rackDepth, segments });
  }

  return { racks, totals, panelHeights: computePanelHeights({ roof, layout, minPillarHeight }) };
}

// Strategy 3: truss (stepped) - a separate algorithm from computeTrussStructure
// above, deliberately kept independent rather than folded into it (see
// README's "Panel grids" entry): the plain Truss strategy still assumes
// every row in a rack shares one identical width, which is what
// generateLayout's default packing guarantees it (see intersectSegmentLists).
// This strategy only ever runs for a grid whose panelsPerRow > 1 columns can
// genuinely differ row to row, because generateLayout packs THIS strategy's
// grids differently in the first place (see the `stepped` branch there):
// each row packs to its own available width instead of the shared
// intersection, so a tapering or rotated footprint doesn't waste space down
// to its narrowest row. The structure below follows suit - it's still one
// rack (one call groups a whole panelsPerRow-deep cluster), but its own
// chords/pillars are split into "bays": a maximal run of physically adjacent
// columns that all share the exact same front/back depth. A column only
// present in some of a cluster's rows (the tapering end) ends up in its own,
// shorter bay rather than borrowing another bay's full-rack-depth chord.
function* iterateSteppedRackBays(layout) {
  const footprintDepth = layout.footprintDepth;
  const panelsPerRow = Math.max(1, layout.panelsPerRow || 1);
  const rowMap = new Map();
  layout.panels.forEach((p) => {
    if (!rowMap.has(p.rackY)) rowMap.set(p.rackY, []);
    rowMap.get(p.rackY).push(p);
  });
  const sortedYs = [...rowMap.keys()].sort((a, b) => a - b);

  for (let ci = 0; ci * panelsPerRow < sortedYs.length; ci++) {
    const rackYs = sortedYs.slice(ci * panelsPerRow, ci * panelsPerRow + panelsPerRow);

    // Every column (a distinct rackX) any of this cluster's rows actually
    // placed a panel at, together with the front/back extent (min/max
    // rackY) of the rows that include it.
    const colMap = new Map();
    rackYs.forEach((y) => {
      (rowMap.get(y) || []).forEach((p) => {
        const c = colMap.get(p.rackX) || { minY: y, maxY: y, w: p.w };
        c.minY = Math.min(c.minY, y);
        c.maxY = Math.max(c.maxY, y);
        colMap.set(p.rackX, c);
      });
    });
    const columns = [...colMap.entries()]
      .map(([rackX, c]) => ({ rackX, ...c }))
      .sort((a, b) => a.rackX - b.rackX);
    if (columns.length === 0) continue;

    // A new bay starts at a physical x-gap (an obstacle, a roof notch -
    // same test the plain strategies' xSegments already use) *or* wherever
    // the actual front/back extent changes between physically adjacent
    // columns - two columns sitting right next to each other still need
    // their own chord/pillar run if one reaches further back than the
    // other, rather than sharing one sized to whichever is longer.
    let bays: any[] = [];
    let current = [columns[0]];
    for (let i = 1; i < columns.length; i++) {
      const prev = current[current.length - 1];
      const col = columns[i];
      const gapX = (col.rackX - col.w / 2) - (prev.rackX + prev.w / 2);
      const sameExtent = Math.abs(col.minY - prev.minY) < 1e-6 && Math.abs(col.maxY - prev.maxY) < 1e-6;
      if (gapX > 0.05 || !sameExtent) { bays.push(current); current = [col]; }
      else current.push(col);
    }
    bays.push(current);

    for (const bayCols of bays) {
      const xStart = bayCols[0].rackX - bayCols[0].w / 2;
      const xEnd = bayCols[bayCols.length - 1].rackX + bayCols[bayCols.length - 1].w / 2;
      const rackTop = bayCols[0].minY - footprintDepth / 2;
      const rackDepth = bayCols[0].maxY + footprintDepth / 2 - rackTop;
      const bayRowYs = rackYs.filter((y) => y >= bayCols[0].minY - 1e-6 && y <= bayCols[0].maxY + 1e-6);
      // This bay's own panels (by exact rackX, not an x-range test - two
      // bays can sit right next to each other with no gap at all when
      // they differ only by extent, not position). Needed by
      // computeSteppedPanelHeights below, which must height each panel
      // against *its own bay's* rackTop rather than the whole rack's -
      // see that function's own comment for why.
      const bayColXs = new Set(bayCols.map((c) => c.rackX));
      let panels: any[] = [];
      bayRowYs.forEach((y) => {
        (rowMap.get(y) || []).forEach((p) => { if (bayColXs.has(p.rackX)) panels.push(p); });
      });
      yield { rackTop, rackDepth, xStart, xEnd, rowYs: bayRowYs, panels };
    }
  }
}

function computeSteppedTrussStructure({ roof, layout }) {
  const isPitched = roof.type === 'pitched';
  const tiltRad = toRad(layout.tilt);
  const pitchRad = isPitched ? toRad(roof.pitchDeg) : 0;
  const footprintDepth = layout.footprintDepth;
  const minPillarHeight = roof.minPillarHeight ?? DEFAULT_MIN_PILLAR_HEIGHT;
  // Reuses the plain (unmodified) iterateRacks/pitchedRoofFrontY/RidgeY -
  // those only look at rows (rackY), never columns, so they're already
  // correct for this strategy's grids too.
  const frontY = isPitched ? pitchedRoofFrontY(layout) : 0;
  const ridgeY = isPitched ? pitchedRoofRidgeY(layout) : 0;
  const heightAtY = (y, rackTop) => isPitched
    ? pitchedHeightAtY(y, { frontY, ridgeY, minPillarHeight, tiltRad, pitchRad })
    : minPillarHeight + (y - rackTop) * Math.tan(tiltRad);

  let racks: any[] = [];
  const totals = {};

  for (const { rackTop, rackDepth, xStart, xEnd, rowYs } of iterateSteppedRackBays(layout)) {
    const frontHeight = heightAtY(rackTop, rackTop);
    const backHeight = heightAtY(rackTop + rackDepth, rackTop);
    const centerY = rackTop + rackDepth / 2;
    const halfDepth = rackDepth / 2;
    const length = xEnd - xStart;
    const midX = (xStart + xEnd) / 2;

    // Same leg/pillar spacing rules as the plain Truss strategy, just
    // scoped to this one bay's own extent instead of the whole rack's.
    const legInset = Math.min(MAX_LEG_END_MARGIN, rackDepth * LEG_END_MARGIN_FRAC);
    const usableLegDepth = Math.max(rackDepth - 2 * legInset, 0);
    const numDepthLegs = Math.max(2, Math.ceil(usableLegDepth / PILLAR_SPACING) + 1);
    const legYs = Array.from({ length: numDepthLegs }, (_, i) => rackTop + legInset + (usableLegDepth * i) / (numDepthLegs - 1));

    const margin = Math.min(MAX_PILLAR_END_MARGIN, length * PILLAR_END_MARGIN_FRAC);
    const usableStart = xStart + margin;
    const usableLength = Math.max(length - 2 * margin, 0);
    const numPillars = Math.max(2, Math.ceil(usableLength / PILLAR_SPACING) + 1);
    const pillarXs = Array.from({ length: numPillars }, (_, i) => usableStart + (usableLength * i) / (numPillars - 1));

    let members: any[] = [];
    pillarXs.forEach((px) => {
      const localX = px - midX;
      legYs.forEach((ly) => {
        const legHeight = heightAtY(ly, rackTop);
        const legZ = ly - centerY;
        members.push({ kind: 'pillar', from: [localX, 0, legZ], to: [localX, legHeight, legZ], thickness: PILLAR_THICKNESS });
        addTotal(totals, 'pillar', legHeight, 1);
      });
      members.push({ kind: 'chord', from: [localX, frontHeight, -halfDepth], to: [localX, backHeight, halfDepth], thickness: CHORD_THICKNESS });
      addTotal(totals, 'chord', Math.hypot(rackDepth, backHeight - frontHeight), 1);
    });

    const purlinMembers = buildPurlinMembers({ rackYs: rowYs, footprintDepth, heightAtY: (y) => heightAtY(y, rackTop), xStart, xEnd, centerY });
    members.push(...purlinMembers);
    addTotal(totals, 'purlin', purlinMembers.length * length, purlinMembers.length);

    // One bay = one rack entry (not grouped back under a shared cluster
    // rack) - Scene3D positions each rack purely from its own `y`/`depth`,
    // so this renders correctly without Scene3D needing to know bays exist.
    racks.push({ y: rackTop, depth: rackDepth, segments: [{ xStart, xEnd, midX, members }] });
  }

  return { racks, totals, panelHeights: computeSteppedPanelHeights({ roof, layout, minPillarHeight }) };
}

export const STRUCTURE_STRATEGIES = {
  truss: { label: 'Roof mount', compute: computeTrussStructure },
  groundMount: { label: 'Ground mount (min. pillars)', compute: computeGroundMountStructure },
  // Independent per-row packing + a matching stepped structure - see the
  // comment above computeSteppedTrussStructure. Opt-in only: picking any
  // other strategy leaves both packing and structure exactly as before.
  steppedTruss: { label: 'Roof mount (stepped)', compute: computeSteppedTrussStructure },
};

export function computeStructure({ roof, layout }) {
  const empty = { racks: [], panelHeights: new Map(), totals: {} };
  if (!layout || layout.panels.length === 0) return empty;
  // `layout.structureStrategy` is the grid's own choice (see generateLayout)
  // - roof.structureStrategy only remains as a fallback for anything that
  // predates grids carrying their own copy.
  const strategy = STRUCTURE_STRATEGIES[layout.structureStrategy || roof.structureStrategy] || STRUCTURE_STRATEGIES.truss;
  return strategy.compute({ roof, layout });
}

// Panels sit on their own roof, buildingHeight meters above the ground. An
// obstacle's shadow-casting height needs to be relative to that same
// plane: an obstacle standing on some roof already casts from its own
// height *above that roof's deck*, but an obstacle elsewhere (ground level,
// or sitting on a different, shorter roof) has its effective height
// measured from the target roof's own elevation instead - and if that goes
// to zero or below (a short building next to a taller one it's beside), it
// can't reach the target roof at all, so it casts no shadow onto its
// panels. `roofs` is every roof on site (not just the one being shaded) so
// an obstacle's own resting height can be found regardless of which roof,
// if any, it's actually sitting on.
function obstacleBaseHeight(o, roofs) {
  const onRoof = roofs.find((r) => isOnRoof(o, getRoofPolygon(r)));
  return onRoof ? onRoof.buildingHeight : 0;
}
function shadowCastingHeight(o, roofs, targetBuildingHeight) {
  return obstacleBaseHeight(o, roofs) + o.height - targetBuildingHeight;
}

// ============================================================
// Instant shading (drives the live plan view)
// ============================================================
export function getInstantShading({ location, date, hour, obstacles, panels, roofs, targetBuildingHeight }) {
  const { elevation, azimuth } = solarPosition(location.lat, location.lon, date, hour, location.tz);
  if (elevation <= 0.5 || !panels) return { elevation, azimuth, shadowPolys: [], shadedIds: new Set() };
  const shadowPolys = obstacles
    .filter((o) => !o.marker)
    .map((o) => shadowPolygon(o, elevation, azimuth, shadowCastingHeight(o, roofs, targetBuildingHeight)))
    .filter(Boolean);
  const shadedIds = new Set();
  panels.forEach((p) => {
    if (shadowPolys.some((poly) => pointInPolygon({ x: p.x, y: p.y }, poly))) shadedIds.add(p.id);
  });
  return { elevation, azimuth, shadowPolys, shadedIds };
}

// ============================================================
// Integrated output calculation (day / month / year)
// ============================================================
export function computeOutput({ layout, obstacles, location, mode, date, monthlyGHI, panelSpec, systemDerate, diffuseFraction, roofs, targetBuildingHeight }) {
  const { tilt, azimuth, panels } = layout;
  const panelAreaEach = panelSpec.width * panelSpec.height;
  const efficiency = panelSpec.wattage / (panelAreaEach * 1000);
  const albedo = 0.2;

  function dayEnergy(d, monthIdx) {
    const dailyGHI = monthlyGHI[monthIdx];
    let samples: any[] = [];
    for (let h = 5; h <= 19; h += 0.5) {
      const { elevation, azimuth: sunAz } = solarPosition(location.lat, location.lon, d, h, location.tz);
      if (elevation > 0.5) samples.push({ elevation, sunAz });
    }
    const sinSum = samples.reduce((s, p) => s + Math.sin(toRad(p.elevation)), 0) || 1;

    const perPanelKWh: Record<string, number> = {};
    panels.forEach((p) => (perPanelKWh[p.id] = 0));
    let shadedCount = 0, sampleCount = 0;

    samples.forEach(({ elevation, sunAz }) => {
      // Distribute the day's known total insolation across samples by a
      // sin(elevation) weighting, then split into a simple beam/diffuse model.
      const ghiSlot = dailyGHI * (Math.sin(toRad(elevation)) / sinSum);
      const iDiffuse = ghiSlot * diffuseFraction;
      const iBeamHoriz = ghiSlot * (1 - diffuseFraction);
      const cosTheta =
        Math.sin(toRad(elevation)) * Math.cos(toRad(tilt)) +
        Math.cos(toRad(elevation)) * Math.sin(toRad(tilt)) * Math.cos(toRad(sunAz - azimuth));
      const iBeamTilt = Math.max(0, iBeamHoriz * (Math.max(cosTheta, 0) / Math.max(Math.sin(toRad(elevation)), 0.05)));
      const iDiffuseTilt = (iDiffuse * (1 + Math.cos(toRad(tilt)))) / 2;
      const iGroundTilt = (ghiSlot * albedo * (1 - Math.cos(toRad(tilt)))) / 2;

      const shadowPolys = obstacles
        .filter((o) => !o.marker)
        .map((o) => shadowPolygon(o, elevation, sunAz, shadowCastingHeight(o, roofs, targetBuildingHeight)))
        .filter(Boolean);

      panels.forEach((p) => {
        const shaded = shadowPolys.some((poly) => pointInPolygon({ x: p.x, y: p.y }, poly));
        const iEffective = (shaded ? 0 : iBeamTilt) + iDiffuseTilt + iGroundTilt;
        perPanelKWh[p.id] += iEffective * panelAreaEach * efficiency * systemDerate;
        sampleCount++;
        if (shaded) shadedCount++;
      });
    });

    const totalKWh = Object.values(perPanelKWh).reduce((a, b) => a + b, 0);
    const avgShadedPct = sampleCount ? Math.round((100 * shadedCount) / sampleCount) : 0;
    return { totalKWh, perPanelKWh, avgShadedPct };
  }

  if (mode === 'day') {
    const r = dayEnergy(date, date.getMonth());
    return { totalKWh: r.totalKWh, avgShadedPct: r.avgShadedPct, label: date.toDateString(), perPanelKWh: r.perPanelKWh };
  }
  if (mode === 'month') {
    const monthIdx = date.getMonth();
    const repDate = new Date(date.getFullYear(), monthIdx, 15);
    const r = dayEnergy(repDate, monthIdx);
    const daysInMonth = new Date(date.getFullYear(), monthIdx + 1, 0).getDate();
    const perPanelKWh: Record<string, number> = {};
    Object.entries(r.perPanelKWh).forEach(([id, kwh]) => { perPanelKWh[id] = kwh * daysInMonth; });
    return {
      totalKWh: r.totalKWh * daysInMonth,
      avgShadedPct: r.avgShadedPct,
      label: repDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
      perPanelKWh,
    };
  }
  // 'year' - also accumulates each panel's own annual total (not just the
  // site-wide sum) by summing dayEnergy's own per-panel breakdown across
  // all 12 representative days, weighted by each month's day count exactly
  // like totalKWh already is. Used both by the solar efficiency view
  // (solar_layout_engine.jsx's efficiencyByGrid) to compare panels on their
  // own annual output rather than a single day, and by the roof-wide sun
  // exposure heatmap (same file's roofSunSamples), which calls this with
  // synthetic "panels" (bare sample points, no real panel behind them) in
  // place of a grid's own panels.
  let totalKWh = 0, shadedSum = 0;
  const perPanelKWh: Record<string, number> = {};
  panels.forEach((p) => (perPanelKWh[p.id] = 0));
  for (let m = 0; m < 12; m++) {
    const repDate = new Date(date.getFullYear(), m, 15);
    const r = dayEnergy(repDate, m);
    const daysInMonth = new Date(date.getFullYear(), m + 1, 0).getDate();
    totalKWh += r.totalKWh * daysInMonth;
    shadedSum += r.avgShadedPct;
    Object.entries(r.perPanelKWh).forEach(([id, kwh]) => { perPanelKWh[id] += kwh * daysInMonth; });
  }
  return { totalKWh, avgShadedPct: Math.round(shadedSum / 12), label: `${date.getFullYear()} (full year)`, perPanelKWh };
}

export function computeCost({ layout, roofType, panelPricePerW, structureRatePerMeter, mountCostPerPanel }) {
  const panelCost = layout.capacityKW * 1000 * panelPricePerW;
  if (roofType === 'flat') {
    const rowMap: Record<string, number> = {};
    layout.panels.forEach((p) => { rowMap[p.y] = (rowMap[p.y] || 0) + 1; });
    let totalRailLength = 0;
    Object.values(rowMap).forEach((colCount) => {
      totalRailLength += colCount * (layout.panels[0]?.w || 1) * 2; // 2 rails per row
    });
    const structureCost = totalRailLength * structureRatePerMeter;
    return { panelCost, structureCost, totalRailLength, totalCost: panelCost + structureCost };
  }
  const structureCost = layout.count * mountCostPerPanel;
  return { panelCost, structureCost, totalRailLength: null, totalCost: panelCost + structureCost };
}
