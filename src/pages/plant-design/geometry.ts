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
const SLOPE_DIRECTIONS = {
  S: { azimuthDeg: 180, toLocal: (p) => ({ x: p.x, y: p.y }), toWorld: (p) => ({ x: p.x, y: p.y }) },
  N: { azimuthDeg: 0, toLocal: (p) => ({ x: -p.x, y: -p.y }), toWorld: (p) => ({ x: -p.x, y: -p.y }) },
  E: { azimuthDeg: 90, toLocal: (p) => ({ x: p.y, y: -p.x }), toWorld: (p) => ({ x: -p.y, y: p.x }) },
  W: { azimuthDeg: 270, toLocal: (p) => ({ x: -p.y, y: p.x }), toWorld: (p) => ({ x: p.y, y: -p.x }) },
};

export function slopeDirectionAzimuth(direction) {
  return (SLOPE_DIRECTIONS[direction] || SLOPE_DIRECTIONS.S).azimuthDeg;
}
export function toSlopeLocal(p, direction) {
  return (SLOPE_DIRECTIONS[direction] || SLOPE_DIRECTIONS.S).toLocal(p);
}
export function toSlopeWorld(p, direction) {
  return (SLOPE_DIRECTIONS[direction] || SLOPE_DIRECTIONS.S).toWorld(p);
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
export function roofUsablePolygon(roof) {
  const poly = getRoofPolygon(roof);
  const edgeMargins = poly.map((_, i) => roof.edgeMarginOverrides?.[i] ?? roof.edgeMargin ?? 0.5);
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
export function shadowPolygon(o, elevation, azimuth, relativeHeight = o.height) {
  if (elevation <= 0.5 || relativeHeight <= 0) return null;
  const L = relativeHeight / Math.tan(toRad(elevation));
  const antiAz = (azimuth + 180) % 360;
  const dx = Math.sin(toRad(antiAz)) * L;
  const dy = Math.cos(toRad(antiAz)) * L;

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
  return convexHull([...footprint, ...projected]);
}
