// Where each inverter physically is: hung on a building wall, or standing on
// the ground. `DesignInverter.mount` (inverterWiring.ts) is the user's own
// placement; an inverter without one is auto-placed here, from the grids it is
// connected to, and follows them as connections change. Dragging an inverter
// stores a mount, "Reset to auto" clears it.
//
// Plan coordinates throughout (x east, y north, metres), same as roofs.
import type { DesignInverter, InverterLink, InverterSpec, SiteGrid } from './inverterWiring';

// `height` = bottom of the inverter above ground; left undefined it is automatic (hung just below the roof edge).
export interface WallMount { kind: 'wall'; roofId: any; edge: number; t: number; height?: number }
export interface GroundMount { kind: 'ground'; x: number; y: number }
export type InverterMount = WallMount | GroundMount;

export interface PlacementRoof { id: any; polygon: { x: number; y: number }[]; buildingHeight: number }

export interface InverterPose {
  id: number;
  kind: 'wall' | 'ground';
  autoPlaced: boolean;
  // Box centre in plan, bottom height above ground, and size.
  x: number; y: number; baseZ: number;
  w: number; h: number; d: number;
  // Unit plan vector the inverter's front faces (away from the wall).
  facing: { x: number; y: number };
  roofId?: any;
  // The wall mount this resolved from (kept so a drag can start from it).
  mount: InverterMount;
}

// Automatic height: the inverter's top sits this far below the roof edge, as
// in a typical wall-hung install (short drop for the DC cables), but never
// lower than this above the ground.
export const BELOW_ROOF_EDGE_M = 0.6;
export const MIN_WALL_HEIGHT_M = 0.3;
// An inverter dropped within this distance of a wall snaps onto it.
export const WALL_SNAP_DISTANCE_M = 3;
const SIDE_GAP_M = 0.35;
const WALL_GAP_M = 0.03;

// Approximate physical size from the rating (the catalog carries no
// dimensions): ~0.65 x 0.9 x 0.27 m at 50 kW, smaller below.
export function inverterDims(spec: InverterSpec) {
  const kw = Math.max(0, spec.acPowerKw || 0);
  return { w: 0.4 + 0.005 * kw, h: 0.5 + 0.008 * kw, d: 0.2 + 0.0014 * kw };
}

function signedArea(poly: { x: number; y: number }[]) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function edgeInfo(poly: { x: number; y: number }[], edge: number) {
  const a = poly[edge % poly.length], b = poly[(edge + 1) % poly.length];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1e-9;
  // Counter-clockwise polygon: the outside is to the right of travel.
  const ccw = signedArea(poly) >= 0;
  const nx = ccw ? dy / len : -dy / len;
  const ny = ccw ? -dx / len : dx / len;
  return { a, b, len, tangent: { x: dx / len, y: dy / len }, normal: { x: nx, y: ny } };
}

function pointToEdge(p: { x: number; y: number }, poly: { x: number; y: number }[], edge: number) {
  const { a, len, tangent } = edgeInfo(poly, edge);
  const s = Math.max(0, Math.min(len, (p.x - a.x) * tangent.x + (p.y - a.y) * tangent.y));
  const qx = a.x + tangent.x * s, qy = a.y + tangent.y * s;
  return { dist: Math.hypot(p.x - qx, p.y - qy), t: s / len };
}

export function poseFromMount(id: number, spec: InverterSpec, mount: InverterMount, roofs: PlacementRoof[], autoPlaced: boolean): InverterPose | null {
  const { w, h, d } = inverterDims(spec);
  if (mount.kind === 'ground') {
    return { id, kind: 'ground', autoPlaced, x: mount.x, y: mount.y, baseZ: 0, w, h, d, facing: { x: 0, y: -1 }, mount };
  }
  const roof = roofs.find((r) => String(r.id) === String(mount.roofId));
  if (!roof || roof.polygon.length < 3) return null;
  const edge = ((mount.edge % roof.polygon.length) + roof.polygon.length) % roof.polygon.length;
  const info = edgeInfo(roof.polygon, edge);
  const t = Math.max(0, Math.min(1, mount.t));
  const px = info.a.x + info.tangent.x * info.len * t;
  const py = info.a.y + info.tangent.y * info.len * t;
  const lift = d / 2 + WALL_GAP_M;
  const wanted = mount.height ?? Math.max(MIN_WALL_HEIGHT_M, roof.buildingHeight - BELOW_ROOF_EDGE_M - h);
  const baseZ = Math.max(0, Math.min(wanted, Math.max(0, roof.buildingHeight - h - 0.1)));
  return {
    id, kind: 'wall', autoPlaced, roofId: roof.id,
    x: px + info.normal.x * lift, y: py + info.normal.y * lift, baseZ, w, h, d,
    facing: info.normal, mount: { ...mount, edge, t },
  };
}

// Finds a free spot along a roof edge near `target` (distance along the
// edge, metres) that doesn't overlap an already-placed inverter. Tries the
// target first, then alternately to either side.
function freeSlot(len: number, width: number, target: number, taken: [number, number][]) {
  const half = width / 2 + SIDE_GAP_M / 2;
  if (len < width + SIDE_GAP_M) return null;
  const step = width + SIDE_GAP_M;
  for (let k = 0; k < 40; k++) {
    for (const sign of k === 0 ? [1] : [1, -1]) {
      const s = target + sign * k * step;
      if (s < half || s > len - half) continue;
      if (taken.every(([lo, hi]) => s + half <= lo || s - half >= hi)) return s;
    }
  }
  return null;
}

// A wall with another building right up against it (a narrow gap between
// two roofs, or a roof beyond) is no place to hang an inverter: it would
// stand between the buildings, hidden and unreachable. Checked at the
// point on the wall the inverter wants.
const MIN_WALL_CLEARANCE_M = 2.5;
export function wallIsBoxedIn(roof: PlacementRoof, edge: number, t: number, roofs: PlacementRoof[]) {
  const info = edgeInfo(roof.polygon, edge);
  const px = info.a.x + info.tangent.x * info.len * t, py = info.a.y + info.tangent.y * info.len * t;
  const out = { x: px + info.normal.x * 1.0, y: py + info.normal.y * 1.0 };
  return roofs.some((other) => {
    if (other.polygon.length < 3) return false;
    if (pointInPolygon(out, other.polygon)) return true;
    if (other === roof) return false;
    for (let e = 0; e < other.polygon.length; e++) {
      if (pointToEdge({ x: px, y: py }, other.polygon, e).dist < MIN_WALL_CLEARANCE_M) return true;
    }
    return false;
  });
}

const roofIdOfGrid = (gridKey: string) => gridKey.slice(0, gridKey.lastIndexOf(':'));

// Poses for every inverter. Hand-placed ones (mount set) go first and
// reserve their wall space; the rest are auto-placed in id order on the wall
// nearest the grids they are connected to, beside any neighbours.
export function resolveInverterPoses({ inverters, links, grids, roofs }: {
  inverters: DesignInverter[];
  links: InverterLink[];
  grids: SiteGrid[];
  roofs: PlacementRoof[];
}): InverterPose[] {
  const poses = new Map<number, InverterPose>();
  const taken = new Map<string, [number, number][]>(); // `${roofId}:${edge}` -> intervals along the edge
  const reserve = (pose: InverterPose) => {
    if (pose.kind !== 'wall') return;
    const m = pose.mount as WallMount;
    const roof = roofs.find((r) => String(r.id) === String(m.roofId))!;
    const len = edgeInfo(roof.polygon, m.edge).len;
    const key = `${m.roofId}:${m.edge}`;
    const s = m.t * len;
    taken.set(key, [...(taken.get(key) ?? []), [s - pose.w / 2 - SIDE_GAP_M / 2, s + pose.w / 2 + SIDE_GAP_M / 2]]);
  };

  inverters.filter((i) => i.mount).forEach((inv) => {
    const pose = poseFromMount(inv.id, inv.spec, inv.mount as InverterMount, roofs, false);
    if (pose) { poses.set(inv.id, pose); reserve(pose); }
  });

  const gridByKey = new Map(grids.map((g) => [g.key, g]));
  inverters.filter((i) => !poses.has(i.id)).sort((a, b) => a.id - b.id).forEach((inv) => {
    if (roofs.length === 0) return;
    const { w } = inverterDims(inv.spec);
    const mine = links.filter((l) => l.inverterId === inv.id && gridByKey.has(l.gridKey));

    // Roof with the most connected grids (first roof when unconnected).
    const votes = new Map<string, number>();
    mine.forEach((l) => { const r = roofIdOfGrid(l.gridKey); votes.set(r, (votes.get(r) ?? 0) + 1); });
    const bestRoofId = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const roof = roofs.find((r) => String(r.id) === bestRoofId) ?? roofs[0];
    if (roof.polygon.length < 3) return;

    // Where it wants to be: toward the centroid of the grids it feeds.
    const pts = mine.map((l) => gridByKey.get(l.gridKey)!.centroid).filter(Boolean) as { x: number; y: number }[];
    const target = pts.length > 0
      ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }
      : null;

    const n = roof.polygon.length;
    const edges = Array.from({ length: n }, (_, e) => {
      const info = edgeInfo(roof.polygon, e);
      const near = target ? pointToEdge(target, roof.polygon, e) : { dist: -info.len, t: 0.5 }; // no target: longest edge first
      return { e, len: info.len, dist: near.dist, t: near.t, blocked: wallIsBoxedIn(roof, e, near.t, roofs) };
    }).sort((a, b) => Number(a.blocked) - Number(b.blocked) || a.dist - b.dist);

    for (const cand of edges) {
      const s = freeSlot(cand.len, w, cand.t * cand.len, taken.get(`${roof.id}:${cand.e}`) ?? []);
      if (s == null) continue;
      const mount: WallMount = { kind: 'wall', roofId: roof.id, edge: cand.e, t: s / cand.len };
      const pose = poseFromMount(inv.id, inv.spec, mount, roofs, true);
      if (pose) { poses.set(inv.id, pose); reserve(pose); }
      return;
    }
  });

  return inverters.map((i) => poses.get(i.id)).filter(Boolean) as InverterPose[];
}

// Where a dragged inverter lands: on the nearest wall when dropped within
// WALL_SNAP_DISTANCE_M of one (or anywhere over a building), else on the
// ground at the drop point.
export function snapInverterMount(point: { x: number; y: number }, roofs: PlacementRoof[], height?: number): InverterMount {
  let best: { roof: PlacementRoof; edge: number; dist: number; t: number } | null = null;
  roofs.forEach((roof) => {
    if (roof.polygon.length < 3) return;
    for (let e = 0; e < roof.polygon.length; e++) {
      const r = pointToEdge(point, roof.polygon, e);
      if (!best || r.dist < best.dist) best = { roof, edge: e, dist: r.dist, t: r.t };
    }
  });
  if (best) {
    const b = best as { roof: PlacementRoof; edge: number; dist: number; t: number };
    if (b.dist <= WALL_SNAP_DISTANCE_M || pointInPolygon(point, b.roof.polygon)) {
      return { kind: 'wall', roofId: b.roof.id, edge: b.edge, t: b.t, height };
    }
  }
  return { kind: 'ground', x: point.x, y: point.y };
}

function pointInPolygon(p: { x: number; y: number }, poly: { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// Why a spot is a poor place for `inverter`, or null when it is fine. Only
// ever shown as a warning - a placement is never blocked.
export function placementIssue(inverter: DesignInverter, mount: InverterMount, others: InverterPose[], roofs: PlacementRoof[]): string | null {
  if (mount.kind === 'ground') return null;
  const roof = roofs.find((r) => String(r.id) === String(mount.roofId));
  if (!roof || roof.polygon.length < 3) return null;
  const { w } = inverterDims(inverter.spec);
  const info = edgeInfo(roof.polygon, mount.edge);
  if (info.len < w + SIDE_GAP_M) return 'This wall is too short for the inverter';
  const s = mount.t * info.len;
  const clash = others.find((o) => {
    if (o.id === inverter.id || o.kind !== 'wall') return false;
    const om: any = o.mount;
    if (String(om.roofId) !== String(mount.roofId) || om.edge !== mount.edge) return false;
    return Math.abs(om.t * info.len - s) < (o.w + w) / 2 + SIDE_GAP_M / 2;
  });
  if (clash) return `Overlaps INV-${clash.id} on this wall`;
  if (wallIsBoxedIn(roof, mount.edge, mount.t, roofs)) return 'Another building is right against this wall';
  return null;
}
