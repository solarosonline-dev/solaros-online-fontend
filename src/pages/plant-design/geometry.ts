import polygonClipping from 'polygon-clipping';
import { toRad } from './solarMath.js';

// ============================================================
// Geometry helpers (shadow polygons via convex hull)
// ============================================================
function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  let lower: any[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  let upper: any[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = (yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isOnRoof(o, roofPolygon) {
  return pointInPolygon({ x: o.x, y: o.y }, roofPolygon);
}

// ============================================================
// Roof shape helpers (rectangle default, or a user-drawn polygon)
// ============================================================
export function rectPolygon(w, d) {
  return [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: -w / 2, y: d / 2 },
  ];
}

export function getRoofPolygon(roof) {
  return roof.polygon && roof.polygon.length >= 3 ? roof.polygon : rectPolygon(roof.width, roof.length);
}

// Reflects a point across the infinite line through `a`/`b` (a polygon
// edge, in practice) - used to mirror a whole roof across one of its own
// sides. Projects the point onto the line, then goes the same distance
// again on the other side of that projection.
export function reflectPointAcrossLine(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return { ...p };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const projX = a.x + t * dx, projY = a.y + t * dy;
  return { x: 2 * projX - p.x, y: 2 * projY - p.y };
}

// Axis-aligned bounding-box footprint of a polygon, in the same real-world
// meters the polygon's own points are already in (traced on top of an
// accurately-scaled satellite capture — see solar_layout_engine.jsx's
// toScreen/scale). Used to show a drawn roof's actual traced size rather
// than the width/length fields, which only ever hold the rectangle
// template's defaults and never reflect a hand-drawn shape.
export function polygonBounds(poly) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { width: Math.max(...xs) - Math.min(...xs), length: Math.max(...ys) - Math.min(...ys) };
}



// ============================================================
// Pitched-roof slope direction (N/E/S/W)
// ============================================================
// Every pitched-roof calculation (panel packing, height climb, support
// structure, roof deck shape) is built assuming the roof's own eave sits
// at the low end of a local Y axis and its ridge at the high end - the
// "south-facing" arrangement this codebase used before a direction could
// be chosen at all. Rather than rework every one of those in world
// coordinates, a roof facing some other direction just runs the exact
// same local-space math and then rotates the result into the real world.
// Each entry's toLocal/toWorld are exact inverses of each other, and both
// are pure rotations (0°/90°/180°/270°, never a mirror-image reflection)
// so they compose cleanly with the plain Y-axis rotations Scene3D already
// uses elsewhere for a panel's own facing.
const SLOPE_DIRECTIONS: Record<string, { azimuthDeg: number }> = {
  S: { azimuthDeg: 180 },
  N: { azimuthDeg: 0 },
  E: { azimuthDeg: 90 },
  W: { azimuthDeg: 270 },
};

const CARDINAL_SLOPE_VECTORS: Record<string, { x: number; y: number }> = {
  S: { x: 0, y: -1 },
  N: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
};

// Compass azimuth (0=N, 90=E, 180=S, 270=W) of the outward normal of
// whichever roof edge faces most toward `targetVec` (a world-space unit
// vector, +y = north). Every edge is a candidate. A pitched roof used to
// consider only its longer edge pair (as eave/ridge) - first as a hard
// filter, then as a tie-breaker - and both made slope-direction buttons
// collide: on a wide roof E/W both resolved to a long N/S edge, on a tall
// one N/S both resolved to E/W, and on a roof rotated ~40-50° two adjacent
// buttons picked the same edge. With all edges in play, a rectangle's four
// outward normals sit 90° apart, so each of N/E/S/W lands on its own edge.
function edgeFacingAzimuth(poly: Array<{ x: number; y: number }>, targetVec: { x: number; y: number }): number | null {
  const n = poly ? poly.length : 0;
  if (n < 3) return null;

  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  const isCcw = area > 0;

  const edges = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const ex = b.x - a.x, ey = b.y - a.y;
    const len = Math.hypot(ex, ey) || 1e-9;
    const nx = isCcw ? ey / len : -ey / len;
    const ny = isCcw ? -ex / len : ex / len;
    return { idx: i, len, nx, ny };
  });

  const dotOf = (e) => e.nx * targetVec.x + e.ny * targetVec.y;
  const bestOf = (indices: number[]) => indices.reduce((best, idx) => (dotOf(edges[idx]) > dotOf(edges[best]) ? idx : best), indices[0]);

  const bestEdgeIdx = bestOf(edges.map((e) => e.idx));

  const bestEdge = edges[bestEdgeIdx];
  const azDeg = (Math.atan2(bestEdge.nx, bestEdge.ny) * (180 / Math.PI) + 360) % 360;
  return Math.round(azDeg * 100) / 100;
}

export function getPitchedRoofSlopeAzimuth(roof: any): number {
  const direction = roof?.slopeDirection || 'S';
  const defaultAz = (SLOPE_DIRECTIONS[direction] || SLOPE_DIRECTIONS.S).azimuthDeg;
  if (!roof || roof.type !== 'pitched') return defaultAz;
  const slopeVec = CARDINAL_SLOPE_VECTORS[direction] || CARDINAL_SLOPE_VECTORS.S;
  return edgeFacingAzimuth(getRoofPolygon(roof), slopeVec) ?? defaultAz;
}

// The roof's compass azimuth, shown in (and editable from) the roof's
// Azimuth rail control - and the direction every *newly packed* grid on
// this roof faces, flat or pitched (see generateLayout). A pitched roof's
// deck slopes this way too. An already-packed grid keeps facing whatever
// it was packed at (its own `azimuth` - see layoutEngine's gridDirection),
// so this changing later never silently re-frames existing panels.
//
// `roof.azimuth` is the admin's manual override (null = auto). Auto is a
// pitched roof's own slope-facing edge (getPitchedRoofSlopeAzimuth), or
// for a flat roof the edge facing most toward the equator (south in the
// northern hemisphere, north in the southern).
export function autoRoofAzimuth(roof: any, location: any): number {
  // Left unrounded for a pitched roof so an un-overridden roof keeps packing
  // at exactly the angle it always has (the UI rounds for display).
  if (roof?.type === 'pitched') return getPitchedRoofSlopeAzimuth(roof);
  const equatorVec = (location?.lat ?? 0) >= 0 ? CARDINAL_SLOPE_VECTORS.S : CARDINAL_SLOPE_VECTORS.N;
  const az = edgeFacingAzimuth(getRoofPolygon(roof), equatorVec);
  return az == null ? ((location?.lat ?? 0) >= 0 ? 180 : 0) : Math.round(az) % 360;
}

// Azimuth that makes panel rows run parallel to edge `edgeIndex` of
// `poly` (the edge from poly[i] to poly[i+1]) - for the Azimuth control's
// "align to edge" pick. Rows parallel to an edge can face either of its
// two normals; this picks whichever is closer to the equator (due south in
// the northern hemisphere). An edge running exactly north-south leaves
// both normals equally far off (east vs west), so that tie goes to the
// roof's outward normal - the popover's "flip" link covers the other one.
// Kept to 2 decimals, not rounded to whole degrees like the auto value's
// display, so rows line up with the edge exactly - half a degree off is
// ~17cm of drift over a 20m edge.
export function edgeAlignedAzimuth(poly: Array<{ x: number; y: number }>, edgeIndex: number, location: any): number | null {
  const n = poly ? poly.length : 0;
  if (n < 3 || edgeIndex < 0 || edgeIndex >= n) return null;
  const a = poly[edgeIndex], b = poly[(edgeIndex + 1) % n];
  const ex = b.x - a.x, ey = b.y - a.y;
  const len = Math.hypot(ex, ey);
  if (len < 1e-9) return null;

  let area = 0;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    area += p.x * q.y - q.x * p.y;
  }
  const outward = area > 0 ? { x: ey / len, y: -ex / len } : { x: -ey / len, y: ex / len };
  const toAz = (v) => (Math.atan2(v.x, v.y) * (180 / Math.PI) + 360) % 360;
  const outAz = toAz(outward);
  const inAz = (outAz + 180) % 360;

  const equatorAz = (location?.lat ?? 0) >= 0 ? 180 : 0;
  const offEquator = (az) => azimuthOffset(az, equatorAz);
  const pick = offEquator(inAz) < offEquator(outAz) - 0.5 ? inAz : outAz;
  return Math.round(pick * 100) / 100;
}

// Smallest absolute angle (0-180) between two compass azimuths.
export function azimuthOffset(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

// The direction a roof is actually packed in (rows, starting edge and
// panel facing) - getRoofAzimuth, except on a pitched roof, where it snaps
// to the roof edge facing closest to that azimuth (the "azimuth edge").
// Rows then always run parallel to a real edge and fill from it, rather
// than cutting diagonally across a fixed roof plane (a staircase fill with
// a broken structure). Panels on that edge's side tilt toward it as racks
// sitting on the slope (see layoutEngine's pitchedRoofDeck). The auto
// azimuth is already the slope edge, so an un-overridden roof is unchanged.
export function packingAzimuth(roof: any, location: any): number {
  const az = getRoofAzimuth(roof, location);
  if (roof?.type !== 'pitched') return az;
  const t = toRad(az);
  return edgeFacingAzimuth(getRoofPolygon(roof), { x: Math.sin(t), y: Math.cos(t) }) ?? az;
}

export function getRoofAzimuth(roof: any, location: any): number {
  if (typeof roof?.azimuth === 'number' && Number.isFinite(roof.azimuth)) {
    return ((roof.azimuth % 360) + 360) % 360;
  }
  return autoRoofAzimuth(roof, location);
}

// A drawn roof's own width/length, measured along its own orientation
// rather than the compass-aligned bounding box (polygonBounds) - which
// overstates both for a building not square to north, and can't be edited
// without skewing it. `azimuthDeg` sets the frame (callers pass the roof's
// auto azimuth, i.e. its equator-facing/slope edge): width runs along the
// panel rows, length across them (the facing direction). For a roof drawn
// square to north this is exactly polygonBounds' width/length.
function roofFrame(azimuthDeg: number) {
  const t = toRad(azimuthDeg);
  return { r: { x: Math.cos(t), y: -Math.sin(t) }, f: { x: Math.sin(t), y: Math.cos(t) } };
}

export function orientedRoofExtents(poly: Array<{ x: number; y: number }>, azimuthDeg: number) {
  const { r, f } = roofFrame(azimuthDeg);
  const as = poly.map((p) => p.x * r.x + p.y * r.y);
  const bs = poly.map((p) => p.x * f.x + p.y * f.y);
  return {
    width: Math.max(...as) - Math.min(...as),
    length: Math.max(...bs) - Math.min(...bs),
    centerA: (Math.max(...as) + Math.min(...as)) / 2,
    centerB: (Math.max(...bs) + Math.min(...bs)) / 2,
  };
}

// Stretches a drawn roof along one of orientedRoofExtents' own axes, about
// that axis' own midpoint, so the shape stays centered and a rotated
// rectangle stays a rectangle. Vertex order/count is unchanged, so per-edge
// margin overrides (keyed by edge index) still point at the same edges.
export function resizeRoofPolygon(poly: Array<{ x: number; y: number }>, azimuthDeg: number, axis: 'width' | 'length', value: number) {
  const ext = orientedRoofExtents(poly, azimuthDeg);
  const current = axis === 'width' ? ext.width : ext.length;
  if (!(current > 1e-6) || !(value > 0)) return poly;
  const k = value / current;
  const { r, f } = roofFrame(azimuthDeg);
  return poly.map((p) => {
    let a = p.x * r.x + p.y * r.y;
    let b = p.x * f.x + p.y * f.y;
    if (axis === 'width') a = ext.centerA + (a - ext.centerA) * k;
    else b = ext.centerB + (b - ext.centerB) * k;
    const x = a * r.x + b * f.x, y = a * r.y + b * f.y;
    return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
  });
}

// Frame angle (in orientedRoofExtents/resizeRoofPolygon's terms) whose
// "along rows" axis runs parallel to the polygon's longest edge - for a
// drawn obstacle, which has no azimuth of its own to frame by. With this
// frame, extents.width is the size *along* that edge (shown as Length) and
// extents.length the size across it (shown as Width): the natural reading
// for a walkway strip or a rectangular skylight.
export function longestEdgeFrameAzimuth(poly: Array<{ x: number; y: number }>): number {
  let best = { len: -1, ex: 1, ey: 0 };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    if (len > best.len) best = { len, ex, ey };
  }
  // r = (cos t, -sin t) parallel to the edge (see roofFrame).
  return Math.atan2(-best.ey, best.ex) * (180 / Math.PI);
}

// Separating-axis test for two convex polygons (any winding) - true when
// their interiors overlap. Touching edges/corners don't count, so two
// panels butted edge-to-edge (or sharing a grid's own small gap) never
// read as overlapping.
export function convexPolygonsOverlap(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const nx = -(q.y - p.y), ny = q.x - p.x;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const v of a) { const d = v.x * nx + v.y * ny; if (d < minA) minA = d; if (d > maxA) maxA = d; }
      for (const v of b) { const d = v.x * nx + v.y * ny; if (d < minB) minB = d; if (d > maxB) maxB = d; }
      if (maxA <= minB + 1e-9 || maxB <= minA + 1e-9) return false;
    }
  }
  return true;
}

type Pt = { x: number; y: number };

// `subject` minus every polygon in `cutters`, as a list of pieces (each an
// outer ring plus any interior holes) - for the 3D view's flat roofs, where
// a Cutout obstacle has to actually remove roof. three.js's own Shape.holes
// only works for a hole fully *inside* the outline; a cutout crossing the
// roof edge (the usual way to notch an L-shaped building) was silently
// dropped and the roof rendered solid. A true boolean difference handles
// that, plus a cutout that splits the roof into separate pieces. Rings
// come back without the closing duplicate point. Falls back to the
// untouched subject if the clipper throws on degenerate input (e.g. a
// zero-area cutout mid-drag), so a bad cutout never blanks the roof.
export function subtractPolygons(subject: Pt[], cutters: Pt[][]): Array<{ outer: Pt[]; holes: Pt[][] }> {
  const valid = (cutters || []).filter((c) => c && c.length >= 3);
  if (!subject || subject.length < 3) return [];
  if (valid.length === 0) return [{ outer: subject, holes: [] }];
  const toRing = (poly: Pt[]) => poly.map((p) => [p.x, p.y] as [number, number]);
  const fromRing = (ring: [number, number][]) => {
    const pts = ring.map(([x, y]) => ({ x, y }));
    const first = pts[0], last = pts[pts.length - 1];
    return pts.length > 1 && first.x === last.x && first.y === last.y ? pts.slice(0, -1) : pts;
  };
  try {
    const result = polygonClipping.difference([toRing(subject)], ...valid.map((c) => [toRing(c)]));
    return result.map((poly) => ({ outer: fromRing(poly[0]), holes: poly.slice(1).map(fromRing) }));
  } catch {
    return [{ outer: subject, holes: [] }];
  }
}

// `points` turned counter-clockwise (plan view, +y = north) by `deg`
// about `center` - for rotating a drawn obstacle's own outline in place.
export function rotatePoints(points: Array<{ x: number; y: number }>, center: { x: number; y: number }, deg: number) {
  const a = toRad(deg), cos = Math.cos(a), sin = Math.sin(a);
  return points.map((p) => {
    const dx = p.x - center.x, dy = p.y - center.y;
    return { x: Number((center.x + dx * cos - dy * sin).toFixed(3)), y: Number((center.y + dx * sin + dy * cos).toFixed(3)) };
  });
}

// Direction of a polygon's longest edge, in degrees counter-clockwise from
// east, folded into [0, 180) since an edge has no head/tail - the "Angle" a
// drawn obstacle's Rotate popover shows (0 = running east-west).
export function longEdgeAngle(poly: Array<{ x: number; y: number }>): number {
  const t = longestEdgeFrameAzimuth(poly);
  return ((-t % 180) + 180) % 180;
}

// Height of a roof's own top surface at plan point `pt`. Flat roofs are
// just buildingHeight (Scene3D adds its deck slab on top). A pitched roof
// is one flat plane climbing along its own slope edge
// (getPitchedRoofSlopeAzimuth, from slopeDirection) from the lowest point of
// its outline - exactly what Scene3D's polygonToSlopedBuildingGeometry
// draws, and what computeStructure's panel heights are measured from, so
// panels, obstacles and the roof all agree. Deliberately *not* roof.azimuth:
// that only sets the direction panels are filled in, and must never change
// the roof's own shape.
export function roofSurfaceHeightAt(roof: any, pt: { x: number; y: number }): number {
  const base = roof.buildingHeight || 0;
  if (roof.type !== 'pitched') return base;
  const poly = getRoofPolygon(roof);
  const tanPitch = Math.tan(toRad(roof.pitchDeg || 0));
  const direction = getPitchedRoofSlopeAzimuth(roof);
  const front = Math.min(...poly.map((p) => toSlopeLocal(p, direction).y));
  return base + Math.max(0, toSlopeLocal(pt, direction).y - front) * tanPitch;
}

// Plan points covering an obstacle's own footprint - a box's rotated
// corners, a ring around a cylinder, a drawn shape's own vertices - plus
// its center, for sampling the roof surface underneath it.
export function obstacleFootprintPoints(o: any): Array<{ x: number; y: number }> {
  const c = { x: o.x, y: o.y };
  if (o.shape === 'polygon' && o.polygon?.length) return [c, ...o.polygon];
  if (o.shape === 'box') {
    const a = toRad(o.rotation || 0), cos = Math.cos(a), sin = Math.sin(a);
    const hw = (o.width || 0) / 2, hd = (o.depth || 0) / 2;
    return [c, ...[[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => ({ x: o.x + lx * cos - ly * sin, y: o.y + lx * sin + ly * cos }))];
  }
  const r = o.radius || 0;
  return [c, ...[0, 45, 90, 135, 180, 225, 270, 315].map((d) => ({ x: o.x + r * Math.cos(toRad(d)), y: o.y + r * Math.sin(toRad(d)) }))];
}

// Lowest and highest roof-surface height under an obstacle's footprint (on
// whichever roof its center sits on; 0/0 for one on the ground). On a flat
// roof both are buildingHeight. On a slope they differ: callers seat the
// obstacle's base at `min` (embedded, like a real chimney, never floating
// off the downhill side) and measure its own height up from `max` (so it
// always stands clear of the roof - previously every obstacle used the
// flat buildingHeight, so on a pitched roof anything uphill of the eave
// sank into the slope).
export function obstacleRoofSurfaceRange(o: any, roofs: any[]): { min: number; max: number; roof: any } {
  const roof = roofs.find((r) => pointInPolygon({ x: o.x, y: o.y }, getRoofPolygon(r)));
  if (!roof) return { min: 0, max: 0, roof: null };
  const hs = obstacleFootprintPoints(o).map((p) => roofSurfaceHeightAt(roof, p));
  return { min: Math.min(...hs), max: Math.max(...hs), roof };
}

export function slopeDirectionAzimuth(direction: any): number {
  if (typeof direction === 'number') return direction;
  return (SLOPE_DIRECTIONS[direction] || SLOPE_DIRECTIONS.S).azimuthDeg;
}

export function toSlopeLocal(p: { x: number; y: number }, direction: any): { x: number; y: number } {
  const az = slopeDirectionAzimuth(direction);
  if (az === 180) return { x: p.x, y: p.y };
  if (az === 0) return { x: -p.x, y: -p.y };
  if (az === 90) return { x: p.y, y: -p.x };
  if (az === 270) return { x: -p.y, y: p.x };

  const rad = toRad(az);
  const sinA = Math.sin(rad);
  const cosA = Math.cos(rad);
  return {
    x: -p.x * cosA + p.y * sinA,
    y: -p.x * sinA - p.y * cosA,
  };
}

export function toSlopeWorld(p: { x: number; y: number }, direction: any): { x: number; y: number } {
  const az = slopeDirectionAzimuth(direction);
  if (az === 180) return { x: p.x, y: p.y };
  if (az === 0) return { x: -p.x, y: -p.y };
  if (az === 90) return { x: -p.y, y: p.x };
  if (az === 270) return { x: p.y, y: -p.x };

  const rad = toRad(az);
  const sinA = Math.sin(rad);
  const cosA = Math.cos(rad);
  return {
    x: -p.x * cosA - p.y * sinA,
    y: p.x * sinA - p.y * cosA,
  };
}

function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function lineIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

// Shrinks a polygon inward by `dist` along each edge's inward normal, then
// re-intersects consecutive offset edges to find the new vertices. Exact for
// convex polygons (including the default rectangle). For concave shapes
// (e.g. an L-shaped roof) the offset edges near the inner notch can cross
// each other or flip the local winding, producing a slightly wrong inset
// there — a proper polygon-offset (straight skeleton) algorithm would be
// needed to fix that fully; acceptable simplification for v1.
// `dist` is either one shared number (every edge offset the same, the
// original behavior) or an array of per-edge distances, one per edge of
// `poly` itself - `dist[i]` is the margin for the edge poly[i] -> poly[(i+1)
// % n], in `poly`'s own original point order/winding, regardless of which
// way this function ends up traversing internally (see `reversed` below).
export function insetPolygon(poly, dist) {
  const n = poly.length;
  if (n < 3) return poly;
  const reversed = signedArea(poly) <= 0;
  const ccw = reversed ? [...poly].reverse() : poly;
  // When the input is already CCW, `ccw`'s own edge k *is* poly's edge k -
  // direct mapping. When it had to be reversed, `ccw`'s edge k walks the
  // same physical edge as poly's edge `(n - 2 - k) mod n`, just backwards
  // (poly[j] -> poly[j+1] becomes rev[k] -> rev[k+1] = poly[j+1] -> poly[j])
  // - same offset distance either way, so the margin array just needs to
  // land on the right edge, not account for direction.
  const distAt = Array.isArray(dist)
    ? (i) => dist[reversed ? (n - 2 - i + n) % n : i]
    : () => dist;
  let offsetEdges: any[] = [];
  for (let i = 0; i < n; i++) {
    const a = ccw[i], b = ccw[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-9;
    const inx = -dy / len, iny = dx / len; // inward normal for a CCW polygon
    const d = distAt(i);
    offsetEdges.push({
      a: { x: a.x + inx * d, y: a.y + iny * d },
      b: { x: b.x + inx * d, y: b.y + iny * d },
    });
  }
  let result: any[] = [];
  for (let i = 0; i < n; i++) {
    const prev = offsetEdges[(i - 1 + n) % n];
    const cur = offsetEdges[i];
    const p = lineIntersect(prev.a, prev.b, cur.a, cur.b);
    result.push(p || cur.a);
  }
  return result;
}

// The roof's own polygon inset by its edge margin(s) - the same boundary
// generateLayout actually packs panels against (see its own `edgeMargins`/
// `usablePoly`, computed in the roof's local slope-direction space; insetting
// is pure-Euclidean so doing it directly in world space here, skipping
// toSlopeLocal/toSlopeWorld entirely, gives the identical polygon - a
// rotation doesn't change offset distances). Used to draw a visual "this
// band is margin, no panels go here" highlight between it and the roof's
// own outer polygon (2D plan and 3D view both), not just for packing math.
export function roofUsablePolygon(roof: any) {
  const poly = getRoofPolygon(roof);
  const edgeMargins = poly.map((_, i) => roof.edgeMarginOverrides?.[i] ?? roof.edgeMargin ?? 0.1);
  return insetPolygon(poly, edgeMargins);
}

// For a horizontal line at height y, returns the polygon's interior x-ranges
// at that y (even-odd rule) — may be more than one range for a concave shape.
export function polygonScanlineSegments(poly, y) {
  let xs: any[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].y, yj = poly[j].y;
    if ((yi > y) !== (yj > y)) {
      const xi = poly[i].x, xj = poly[j].x;
      xs.push(xi + ((xj - xi) * (y - yi)) / (yj - yi));
    }
  }
  xs.sort((a, b) => a - b);
  let segments: any[] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) segments.push([xs[i], xs[i + 1]]);
  return segments;
}

// x = east, y = north. Compass azimuth: 0=N, 90=E, 180=S, 270=W.
// `relativeHeight` is the obstacle's height relative to the plane being
// shaded (defaults to the obstacle's own height, i.e. shading a surface at
// the obstacle's own base level) - callers with a roof elevated above the
// ground should pass the obstacle's height *above the roof plane* instead,
// so a short ground-level obstacle beside a tall building doesn't cast a
// shadow onto panels sitting well above it.
// A tree's trunk height: `o.trunkHeight` when set by hand (capped at 90% of
// the tree so lowering the height never leaves the trunk taller than the
// tree), else auto - TREE_AUTO_TRUNK_FRACTION of its height, the fixed
// proportion trees have always been drawn with. `manual` matters beyond
// looks: only a hand-set trunk lifts the tree's shadow off the ground (see
// shadowPolygon's relativeBottom), so designs whose trees were never
// adjusted keep exactly the shading they had.
export const TREE_AUTO_TRUNK_FRACTION = 0.35;
export function treeTrunkHeight(o: any): { trunk: number; manual: boolean } {
  const h = o?.height || 0;
  const manual = typeof o?.trunkHeight === 'number' && Number.isFinite(o.trunkHeight);
  return { trunk: manual ? Math.max(0, Math.min(o.trunkHeight, h * 0.9)) : h * TREE_AUTO_TRUNK_FRACTION, manual };
}

// `relativeBottom` (> 0) lifts the shadow-casting body off the plane: a
// tree with a hand-set trunk height casts only its canopy (trunk top up to
// its top), so its shadow is the footprint projected from both heights
// rather than starting at its base - low sun passes under a high canopy.
// The trunk's own thin shadow is ignored, like other slim items'.
export function shadowPolygon(o, elevation, azimuth, relativeHeight = o.height, relativeBottom = 0) {
  if (elevation <= 0.5 || relativeHeight <= 0) return null;
  const L = relativeHeight / Math.tan(toRad(elevation));
  const antiAz = (azimuth + 180) % 360;
  const dx = Math.sin(toRad(antiAz)) * L;
  const dy = Math.cos(toRad(antiAz)) * L;
  const Lb = Math.max(0, Math.min(relativeBottom, relativeHeight)) / Math.tan(toRad(elevation));
  const bx = Math.sin(toRad(antiAz)) * Lb;
  const by = Math.cos(toRad(antiAz)) * Lb;

  let footprint;
  if (o.shape === 'box') {
    const rot = toRad(o.rotation || 0), hw = o.width / 2, hd = o.depth / 2;
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    footprint = corners.map(([lx, ly]) => ({
      x: o.x + lx * Math.cos(rot) - ly * Math.sin(rot),
      y: o.y + lx * Math.sin(rot) + ly * Math.cos(rot),
    }));
  } else if (o.shape === 'polygon') {
    footprint = o.polygon;
  } else {
    const r = o.radius;
    footprint = [
      { x: o.x - r, y: o.y }, { x: o.x, y: o.y - r },
      { x: o.x + r, y: o.y }, { x: o.x, y: o.y + r },
    ];
  }
  const projected = footprint.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  const base = Lb > 0 ? footprint.map((p) => ({ x: p.x + bx, y: p.y + by })) : footprint;
  return convexHull([...base, ...projected]);
}
