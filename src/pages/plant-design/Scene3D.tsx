import React, { Suspense, useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Edges, Html, Line, OrbitControls, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { getRoofPolygon, insetPolygon, subtractPolygons, obstacleRoofSurfaceRange, roofSurfaceHeightAt, toSlopeLocal, toSlopeWorld, getPitchedRoofSlopeAzimuth, treeTrunkHeight } from './geometry.js';
import { gridPivot, rotateAroundPivot, gridDirection } from './layoutEngine.js';

// The Static Maps image can fail to load as a WebGL texture (network error,
// CORS) — texture loading throws inside the R3F render tree, which
// Suspense alone won't catch. Fall back to no ground texture rather than
// taking down the whole 3D view.
class MapGroundBoundary extends React.Component<any, { failed: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const DEG = Math.PI / 180;

// Engine coordinates are x=east, y=north, meters, flat ground plane.
// Three.js is right-handed Y-up; north is mapped to -Z so it reads as
// "away from the viewer" with the default camera, matching the plan view.
function toThree(x, y, h = 0): [number, number, number] {
  return [x, h, -y];
}

// This view renders the same flat-ground-plane model the 2D plan view and
// the shading math already use — panels/roof are not re-derived with a
// true sloped-roof projection. For a pitched roof this means panels appear
// tilted above a flat deck rather than flush against a sloped surface;
// visually simplified, but consistent with what the rest of the app
// actually computes. A true 3D roof-plane model is Phase 5 territory.
// `holes` (optional) is a list of polygons - each becomes a THREE.Shape
// hole, so the resulting extrusion is open all the way through `depth`
// with real side walls around the opening (ExtrudeGeometry extrudes a
// hole's own boundary exactly like the outer one) - this is what makes a
// Cutout obstacle (see OBSTACLE_PRESETS.cutout) punch a real full-depth
// shaft through BuildingBlock/RoofDeck rather than just a flat colored
// patch on top.
function polygonExtrudeGeometry(polygon, depth, holes: any[] = []) {
  const shape = new THREE.Shape();
  polygon.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();
  holes.forEach((hole) => {
    if (hole.length < 3) return;
    const path = new THREE.Path();
    hole.forEach((p, i) => {
      if (i === 0) path.moveTo(p.x, p.y);
      else path.lineTo(p.x, p.y);
    });
    path.closePath();
    shape.holes.push(path);
  });
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}

// Same as polygonExtrudeGeometry, but for several pieces at once (each an
// outer ring + its own holes) - the shape subtractPolygons returns once
// cutouts have been taken out of a roof. ExtrudeGeometry accepts an array
// of shapes directly, so it's still one geometry/mesh.
function piecesExtrudeGeometry(pieces, depth) {
  const shapes = pieces.filter((pc) => pc.outer.length >= 3).map((pc) => {
    const shape = new THREE.Shape();
    pc.outer.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
    shape.closePath();
    pc.holes.forEach((hole) => {
      if (hole.length < 3) return;
      const path = new THREE.Path();
      hole.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
      path.closePath();
      shape.holes.push(path);
    });
    return shape;
  });
  return new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false });
}

const DECK_THICKNESS = 0.15;

// polygonExtrudeGeometry, but with every vertex (bottom and top alike)
// lifted by `offsetAt(x, y)` - so a `depth`-thick slab lies parallel to a
// sloped surface instead of level. Used for flush features (skylight,
// walkway) on a pitched roof, with offsetAt = roof surface height there
// minus the slab's own base height.
function slopedPolygonGeometry(polygon, depth, offsetAt) {
  const geometry = polygonExtrudeGeometry(polygon, depth);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, pos.getZ(i) + offsetAt(pos.getX(i), pos.getY(i)));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function RoofDeck({ pieces, buildingHeight, selected, onClick }) {
  const geometry = useMemo(() => piecesExtrudeGeometry(pieces, DECK_THICKNESS), [pieces]);

  return (
    <group position={[0, buildingHeight, 0]}>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow onClick={onClick}>
        <meshStandardMaterial color={selected ? '#bcd0f7' : '#d8d2c4'} />
      </mesh>
    </group>
  );
}

// The roof's own edge-margin band - a thin donut prism (outer polygon
// minus a `usablePolygon`-shaped hole, same "hole" mechanism cutouts use
// in polygonExtrudeGeometry) sitting a hair above the deck's own top
// face, so it reads as a highlighted ring rather than z-fighting with it
// (same idea as the 2D plan's own copy of this - see roofUsablePolygon's
// own comment for why the inset math is identical either way). Flat
// roofs only - a pitched roof's own deck isn't a flat plane (see
// polygonToSlopedBuildingGeometry), so a flat donut prism wouldn't sit
// flush against it the way it does here; giving pitched roofs an
// accurate sloped version is Phase 5 roof-plane territory, same as the
// rest of this view's already-accepted flat-panel-above-flat-deck
// simplification (see this file's very first comment).
function RoofMarginBand({ polygon, usablePolygon, cutouts, buildingHeight }) {
  // Roof minus the usable area minus any cutouts - so the band never
  // floats over a notch a cutout has taken out of the roof.
  const geometry = useMemo(
    () => (usablePolygon.length >= 3 ? piecesExtrudeGeometry(subtractPolygons(polygon, [usablePolygon, ...cutouts]), DECK_THICKNESS + 0.03) : null),
    [polygon, usablePolygon, cutouts],
  );
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} position={[0, buildingHeight, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color="#f0a942" transparent opacity={0.45} depthWrite={false} />
    </mesh>
  );
}

// The same flat-topped prism polygonExtrudeGeometry builds, except every
// vertex on the top rim (and the top cap itself) gets its Z climbed by
// tan(pitch) based on its own Y (world-north) coordinate — the same
// eave-to-ridge slope layoutEngine.js's panel-height climb uses (see
// pitchedRoofFrontY there) — while the bottom rim stays at Z=0. Walls and
// roof cap come out of this as one connected solid, so the wall's own top
// edge follows the roofline all the way around instead of stopping flat at
// the eave height and leaving a gap under wherever the roof climbs above
// it (what a separate flat-topped building + a floating sloped cap did).
function polygonToSlopedBuildingGeometry(polygon, direction, frontLocalY, pitchRad, eaveHeight) {
  const shape = new THREE.Shape();
  polygon.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: eaveHeight, bevelEnabled: false });
  const pos = geometry.attributes.position;
  const tanPitch = Math.tan(pitchRad);

  // One flat plane climbing along `direction` from the outline's lowest
  // point - the same surface roofSurfaceHeightAt (geometry.ts) and the
  // panel heights in computeStructure use. A 4-sided roof used to climb
  // perpendicular to its eave edge instead, which only matched the panels
  // when the azimuth equalled that edge's normal exactly; any difference
  // (a typed/rounded azimuth) tilted the panels across the roof.
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getZ(i) - eaveHeight) < 1e-6) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const ly = toSlopeLocal({ x: vx, y: vy }, direction).y;
      const offset = Math.max(0, ly - frontLocalY) * tanPitch;
      pos.setZ(i, eaveHeight + offset);
    }
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// A pitched roof's building and roof cap as one solid piece, sloped from
// eave to ridge — this is what makes "Pitched" visually read as a pitched
// roof (and, since the walls follow the same roofline, without a visible
// gap under the raised side of the roof). The gable ends are left vertical
// (cut straight across) rather than following a true gable's angled trim -
// a simplification consistent with the rest of this view's flat-
// ground-plane model (see the comment above polygonExtrudeGeometry), not
// a fully modeled roof structure.
function PitchedBuilding({ polygon, buildingHeight, pitchDeg, direction, selected, onClick }) {
  const pitchRad = pitchDeg * DEG;
  const frontLocalY = useMemo(
    () => Math.min(...polygon.map((p) => toSlopeLocal(p, direction).y)),
    [polygon, direction]
  );
  const geometry = useMemo(
    () => polygonToSlopedBuildingGeometry(polygon, direction, frontLocalY, pitchRad, buildingHeight),
    [polygon, direction, frontLocalY, pitchRad, buildingHeight]
  );

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow onClick={onClick}>
      <meshStandardMaterial color={selected ? '#bcd0f7' : '#d8d2c4'} />
    </mesh>
  );
}

// The building itself, rendered as the roof polygon extruded down to the
// ground — a simplification (real buildings aren't usually shaped exactly
// like their roof footprint at every floor), but enough to visually ground
// the roof deck at the right height.
function BuildingBlock({ pieces, buildingHeight, selected, onClick }) {
  const geometry = useMemo(() => piecesExtrudeGeometry(pieces, buildingHeight), [pieces, buildingHeight]);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow onClick={onClick}>
      <meshStandardMaterial color={selected ? '#a9bfec' : '#c9c4ba'} />
    </mesh>
  );
}

// A flat roof's whole building: block, deck, margin band and parapet, all
// built from the roof outline *minus* its cutouts (subtractPolygons) so a
// Cutout obstacle really removes roof in 3D - including one crossing the
// roof edge, which three.js's own Shape.holes can't do. The parapet follows
// each remaining piece's outer edge, so a notch gets walls along its own
// sides rather than one spanning the gap. Pieces are memoized on the
// cutouts' actual coordinates (a fresh array arrives every render).
function FlatBuilding({ polygon, usablePolygon, buildingHeight, boundaryHeight, cutouts, selected, onClick }) {
  const cutoutKey = JSON.stringify(cutouts);
  const stableCutouts = useMemo(() => cutouts, [cutoutKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const pieces = useMemo(() => subtractPolygons(polygon, stableCutouts), [polygon, stableCutouts]);
  const deckTop = buildingHeight + DECK_THICKNESS;
  return (
    <>
      <BuildingBlock pieces={pieces} buildingHeight={buildingHeight} selected={selected} onClick={onClick} />
      <RoofDeck pieces={pieces} buildingHeight={buildingHeight} selected={selected} onClick={onClick} />
      <RoofMarginBand polygon={polygon} usablePolygon={usablePolygon} cutouts={stableCutouts} buildingHeight={buildingHeight} />
      {pieces.map((pc, i) => (
        <BoundaryWall key={i} polygon={pc.outer} baseHeight={deckTop} height={boundaryHeight} />
      ))}
    </>
  );
}

const BOUNDARY_WALL_THICKNESS = 0.12;

// A thin parapet-style wall traced along a roof/obstacle's own polygon
// (not inset from it - it marks the real edge), built as an extruded ring:
// the outer profile is the polygon itself, the inner one is it inset by
// the wall's own thickness, so the result is hollow like a real low wall
// rather than a solid slab. `height` is user-adjustable per roof/obstacle.
// `slope`, when given (a pitched roof), climbs every vertex - both the
// bottom and top rim alike - by the same tan(pitch)*localY offset
// polygonToSlopedBuildingGeometry's own roofline climbs by, so the wall's
// base rides the sloped roof surface instead of cutting flat through it,
// while staying `height` tall (measured straight up) all along its run.
function boundaryRingGeometry(polygon, height, slope: any = null) {
  const shape = new THREE.Shape();
  polygon.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();
  const inner = insetPolygon(polygon, BOUNDARY_WALL_THICKNESS);
  if (inner.length >= 3) {
    const hole = new THREE.Path();
    inner.forEach((p, i) => {
      if (i === 0) hole.moveTo(p.x, p.y);
      else hole.lineTo(p.x, p.y);
    });
    hole.closePath();
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  if (slope) {
    const { direction, frontLocalY, pitchRad } = slope;
    const tanPitch = Math.tan(pitchRad);
    const pos = geometry.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const ly = toSlopeLocal({ x: vx, y: vy }, direction).y;
      const offset = Math.max(0, ly - frontLocalY) * tanPitch;
      pos.setZ(i, pos.getZ(i) + offset);
    }

    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  return geometry;
}

function BoundaryWall({ polygon, baseHeight, height, direction, pitchDeg }: any) {
  const pitched = pitchDeg != null;
  const frontLocalY = useMemo(
    () => (pitched ? Math.min(...polygon.map((p) => toSlopeLocal(p, direction).y)) : 0),
    [polygon, direction, pitched]
  );
  const geometry = useMemo(
    () => boundaryRingGeometry(polygon, height, pitched ? { direction, frontLocalY, pitchRad: pitchDeg * DEG } : null),
    [polygon, height, pitched, direction, pitchDeg, frontLocalY]
  );
  if (!height || height <= 0) return null;
  return (
    <group position={[0, baseHeight, 0]}>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow>
        <meshStandardMaterial color="#8f8877" />
      </mesh>
    </group>
  );
}

const SKYLIGHT_FRAME_HEIGHT = 0.04;

// A thin dark aluminum-style frame around a skylight's own glass pane -
// reuses the same hollow-ring geometry BoundaryWall builds, just at a
// small fixed height so every skylight reads as a real glazed unit rather
// than a flat colored patch, independent of its own (user-adjustable, and
// by default zero) boundaryHeight.
function SkylightFrame({ polygon, baseHeight, direction = null as any, pitchDeg = null as any }) {
  // On a pitched roof the frame climbs with the slope too (same `slope`
  // option BoundaryWall uses), measured from the skylight's own lowest point.
  const geometry = useMemo(() => {
    if (pitchDeg == null) return boundaryRingGeometry(polygon, SKYLIGHT_FRAME_HEIGHT);
    const frontLocalY = Math.min(...polygon.map((p) => toSlopeLocal(p, direction).y));
    return boundaryRingGeometry(polygon, SKYLIGHT_FRAME_HEIGHT, { direction, frontLocalY, pitchRad: pitchDeg * DEG });
  }, [polygon, direction, pitchDeg]);
  return (
    <group position={[0, baseHeight, 0]}>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow>
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
    </group>
  );
}

// The panel's plane is anchored at the midpoint between its own front and
// back edge heights (from computeStructure's panelHeights map), which sit
// exactly on the rack's shared tilted plane. The panel itself doesn't draw
// its own supports any more - it rests on the purlins drawn by StructureSegment.
// Same green(100)->yellow->red(0) hue sweep the 2D plan's Efficiency view
// uses (see efficiencyColor in solar_layout_engine.jsx) - kept as its own
// tiny copy here rather than importing across the UI/render-only boundary,
// same as this file's other small pure helpers.
function efficiencyColor(pct) {
  const hue = Math.max(0, Math.min(100, pct)) * 1.2;
  return `hsl(${hue}, 75%, 45%)`;
}

// A clickable bar between two plan points `a`/`b` at heights `ha`/`hb` -
// the 3D stand-in for the 2D plan's "visible sliver + wide invisible hit
// line" picking (roof edges for mirror/margin/align, grid sides for add
// row/column). A thin visible rod, plus a fatter invisible one that takes
// the pointer so it's easy to hit from any camera angle. Colors match 2D:
// blue idle, orange hovered, purple picked.
function PickBar({ a, b, ha, hb, state, onHover, onPick, isDragClick, palette = 'edge' }) {
  const { mid, len, quat } = useMemo(() => {
    const A = new THREE.Vector3(...toThree(a.x, a.y, ha));
    const B = new THREE.Vector3(...toThree(b.x, b.y, hb));
    const d = new THREE.Vector3().subVectors(B, A);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    return { mid: new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5), len: d.length(), quat: q };
  }, [a.x, a.y, b.x, b.y, ha, hb]);
  // 'add' (Add row/column sides) is bright orange (red on hover), not the
  // edge-pick blue - the selected grid's own panels are blue, so blue bars
  // beside them vanished.
  const color = palette === 'add'
    ? (state === 'hover' ? '#dc2626' : '#f97316')
    : state === 'picked' ? '#8e44ad' : state === 'hover' ? '#e0873c' : '#2f6fed';
  const r = state === 'idle' ? 0.07 : 0.12;
  return (
    <group position={mid} quaternion={quat}>
      <mesh>
        <cylinderGeometry args={[r, r, len, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); onHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { onHover(false); document.body.style.cursor = ''; }}
        onClick={(e) => { if (isDragClick?.(e)) return; e.stopPropagation(); document.body.style.cursor = ''; onPick(e); }}
      >
        <cylinderGeometry args={[0.35, 0.35, len, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Panel({ x, y, w, len, tilt, azimuth, extraRotation = 0, gridRotation = 0, roofHeight, frontHeight, backHeight, crossSlope = 0, shaded, efficiencyPct, ghost = false, selected = false, deletePicked = false, overlaps = false, onClick = undefined as any }) {
  const tiltRad = tilt * DEG;
  const rotationY = (-azimuth - extraRotation + gridRotation) * DEG;
  const centerY = roofHeight + (frontHeight + backHeight) / 2;
  // A pitched-roof rack filled from an edge other than the slope edge rises
  // along its row (computeStructure's `crossSlope`, per metre of +rackX).
  // The panel's own +x points along -rackX under rotationY, hence the sign;
  // 'ZYX' rolls after tilting, so the row edge follows the rack exactly.
  const rollRad = Math.atan(-crossSlope);
  // Selected wins over shading/efficiency tint - same "blue = selected"
  // rule as obstacles (SELECTED_COLOR).
  // Picked for deletion (delete row/column/panel mode) wins over everything
  // - the same solid red the 2D plan uses for a pick.
  // Overlapping an obstacle / another grid (`overlaps`): the 2D plan's light
  // red fill and red edge - in a selected grid the panel stays blue and
  // keeps just the red edge, also as in 2D.
  const color = deletePicked ? '#c0392b' : selected ? SELECTED_COLOR : overlaps ? '#f5b7b1' : efficiencyPct != null ? efficiencyColor(efficiencyPct) : (shaded ? '#e0873c' : '#1c2b4a');

  return (
    <group position={toThree(x, y, centerY)} rotation={[0, rotationY, 0]} onClick={onClick}>
      <mesh rotation={[-tiltRad, 0, rollRad, 'ZYX']} castShadow={!ghost} receiveShadow={!ghost}>
        <boxGeometry args={[w, 0.03, len]} />
        {/* A real panel's glass surface glints as the sun moves across the
            sky - clearcoat (a thin glossy layer over the tinted base) gets
            that directly from SunLight's own directional light (already
            tied to selectedHour via sunElevation/sunAzimuth), no
            environment map needed since a direct specular highlight comes
            from the light itself, not a reflected scene. */}
        {/* `ghost` (Roof setup step - see Scene3D's ghostPanels prop):
            faint and see-through, no depth write so the roof deck beneath
            still reads clearly through it, no edges/shadows. */}
        {/* Keyed on `ghost`: three.js only picks up a change to `transparent`
            when the material is recompiled (material.needsUpdate), which a
            plain prop update doesn't trigger - so toggling ghost on an
            existing panel (Panel/Grid setup -> Roof setup while in 3D) left
            it rendering dark and opaque until the view was remounted. A
            fresh material per mode sidesteps that. */}
        <meshPhysicalMaterial key={ghost ? 'ghost' : 'solid'} color={color} roughness={0.35} metalness={0.15} clearcoat={1} clearcoatRoughness={0.12} transparent={ghost} opacity={ghost ? 0.15 : 1} depthWrite={!ghost} />
        {/* A white edge per panel so adjacent panels in the same grid/rack
            read as separate modules instead of blurring into one solid
            slab, especially once every panel's own tint is close to
            identical (the common case, no shading/efficiency view active). */}
        {!ghost && <Edges color={overlaps && !deletePicked ? '#d9534f' : 'white'} />}
      </mesh>
    </group>
  );
}

// Trunk + conical foliage instead of a plain cylinder, so it reads as a
// tree rather than a tank. Total height still matches obstacle.height, so
// shading/geometry elsewhere that treats the tree as a simple cylinder
// (shadowPolygon math, etc.) stays consistent with what's drawn here.
// A selected obstacle is tinted this blue all over (replacing the old flat
// ring drawn on the ground around it) - the same accent the 2D plan uses
// for its own selection outline, so "blue = selected" reads the same in
// both views. `sel(normal)` picks it per material.
const SELECTED_COLOR = '#2f6fed';
const selColor = (selected, normal) => (selected ? SELECTED_COLOR : normal);

function Tree({ obstacle, baseHeight, selected = false }) {
  const h = obstacle.height;
  const [tx, , tz] = toThree(obstacle.x, obstacle.y);
  // Hand-set or auto (35% of height) - see treeTrunkHeight.
  const trunkHeight = treeTrunkHeight(obstacle).trunk;
  const trunkRadius = Math.max(obstacle.radius * 0.15, 0.08);
  const foliageHeight = h - trunkHeight;
  const foliageRadius = obstacle.radius;
  const foliageBaseY = baseHeight + trunkHeight;
  const canopy = obstacle.canopy || 'cone';

  return (
    <group>
      <mesh position={[tx, baseHeight + trunkHeight / 2, tz]} castShadow receiveShadow>
        <cylinderGeometry args={[trunkRadius, trunkRadius * 1.3, trunkHeight, 8]} />
        <meshStandardMaterial color={selColor(selected, '#6b4a2f')} />
      </mesh>

      {canopy === 'cone' && (
        <mesh position={[tx, foliageBaseY + foliageHeight / 2, tz]} castShadow receiveShadow>
          <coneGeometry args={[foliageRadius, foliageHeight, 10]} />
          <meshStandardMaterial color={selColor(selected, '#3f6b3a')} />
        </mesh>
      )}

      {/* Every canopy fills the same envelope: from the trunk top up to the
          tree's own height, canopy radius wide - what the shading math and
          the 2D plan use. Round is an ellipsoid of exactly that size (it used
          to be a sphere of the foliage height, ignoring the radius). */}
      {canopy === 'round' && (
        <mesh position={[tx, foliageBaseY + foliageHeight / 2, tz]} scale={[foliageRadius, foliageHeight / 2, foliageRadius]} castShadow receiveShadow>
          <sphereGeometry args={[1, 12, 10]} />
          <meshStandardMaterial color={selColor(selected, '#4a7a3f')} />
        </mesh>
      )}

      {canopy === 'bushy' && (() => {
        // Lobes are laid out relative to the trunk top, sized from the canopy
        // radius - which left the top at trunk + 2.6r regardless of the
        // tree's height (an 8m tree with a 1.5m canopy topped out under 5m).
        // The cluster is now stretched vertically (`stretch`) so its top lands
        // exactly at the tree's height, like the cone and round canopies.
        const r = foliageRadius * 0.5;
        // Lower cluster sits with its center just above the trunk top, so its
        // bottom overlaps the trunk slightly instead of floating above it.
        const lowerY = r * 0.7;
        const off = foliageRadius * 0.4;
        const lobes = [0, 120, 240].map((angle) => {
          const ax = Math.cos(angle * DEG) * off;
          const az = Math.sin(angle * DEG) * off;
          return { key: angle, x: ax, y: lowerY, z: az, r };
        });
        // A smaller top lobe adds height/volume without leaving a gap, since
        // it overlaps the lower cluster below it.
        (lobes as any[]).push({ key: 'top', x: 0, y: lowerY + r * 1.1, z: 0, r: r * 0.8 });
        const naturalTop = lowerY + r * 1.1 + r * 0.8;
        const stretch = naturalTop > 0 ? foliageHeight / naturalTop : 1;
        return (
          <group position={[tx, foliageBaseY, tz]} scale={[1, stretch, 1]}>
            {lobes.map((l) => (
              <mesh key={l.key} position={[l.x, l.y, l.z]} castShadow receiveShadow>
                <sphereGeometry args={[l.r, 10, 8]} />
                <meshStandardMaterial color={selColor(selected, '#4f7d44')} />
              </mesh>
            ))}
          </group>
        );
      })()}
    </group>
  );
}

// Dimension annotations for the selected roof (Roof setup only, never in
// report captures): width and length as ground-level dimension lines just
// outside the footprint, measured in the same frame as the Dimensions
// popover (`frameAz` - orientedRoofExtents) so the numbers match; a
// vertical line to the eave (labelled Height on a flat roof), and on a
// pitched roof a second one to the ridge plus the pitch angle as an arc at
// the eave corner. A pitched roof's "Building height" is its eave - the
// lowest edge, where the deck starts climbing (roofSurfaceHeightAt) - which
// is exactly what this makes visible. Labels are screen-space HTML so they
// stay readable at any zoom.
const DIM_COLOR = '#1f2937';
const DIM_LABEL_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.94)', color: '#111827', font: '600 11px/1.25 system-ui, sans-serif',
  padding: '2px 6px', borderRadius: 4, border: '1px solid #cbd5e1', whiteSpace: 'nowrap',
  boxShadow: '0 1px 3px rgba(0,0,0,0.18)', pointerEvents: 'none', userSelect: 'none',
};

function DimLabel({ position, text }) {
  return (
    <Html position={position} center zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
      <div style={DIM_LABEL_STYLE}>{text}</div>
    </Html>
  );
}

function DimLine({ points, dashed = false }) {
  return <Line points={points} color={DIM_COLOR} lineWidth={dashed ? 1 : 1.6} dashed={dashed} dashSize={0.15} gapSize={0.1} depthTest={false} renderOrder={10} />;
}

function RoofDimensions({ roof, frameAz, format }) {
  const dims = useMemo(() => {
    const poly = roof.polygon;
    if (!poly || poly.length < 3) return null;
    const t = (frameAz || 0) * DEG;
    // Same axes as geometry.ts's roofFrame: r = along the rows (width),
    // f = the facing direction (length) - downhill on a pitched roof.
    const r = { x: Math.cos(t), y: -Math.sin(t) };
    const f = { x: Math.sin(t), y: Math.cos(t) };
    const as = poly.map((p) => p.x * r.x + p.y * r.y);
    const bs = poly.map((p) => p.x * f.x + p.y * f.y);
    const aMin = Math.min(...as), aMax = Math.max(...as), bMin = Math.min(...bs), bMax = Math.max(...bs);
    const width = aMax - aMin, length = bMax - bMin;
    const P = (a, b) => ({ x: a * r.x + b * f.x, y: a * r.y + b * f.y });
    const V = (pt, h) => toThree(pt.x, pt.y, h) as [number, number, number];
    const off = Math.max(0.6, Math.max(width, length) * 0.06);
    const g = 0.04;
    const pitched = roof.type === 'pitched';
    const eaveH = roof.buildingHeight || 0;
    const ridgeH = pitched ? Math.max(...poly.map((p) => roofSurfaceHeightAt(roof, p))) : eaveH;
    const pitch = pitched ? (roof.pitchDeg || 0) : 0;
    return { aMin, aMax, bMin, bMax, width, length, P, V, off, g, pitched, eaveH, ridgeH, pitch, f };
  }, [roof, frameAz]);
  if (!dims) return null;
  const { aMin, aMax, bMin, bMax, width, length, P, V, off, g, pitched, eaveH, ridgeH, pitch, f } = dims;

  // Width: along the front (facing / eave) side; length: along the right side.
  const wy = bMax + off, lx = aMax + off;
  const widthLine = [V(P(aMin, wy), g), V(P(aMax, wy), g)];
  const lengthLine = [V(P(lx, bMin), g), V(P(lx, bMax), g)];
  const ext = (a0, b0, a1, b1) => [V(P(a0, b0), g), V(P(a1, b1), g)];

  // Heights: verticals at the right side's front (eave) and back (ridge) ends.
  const eaveBase = P(lx, bMax), ridgeBase = P(lx, bMin);

  // Pitch arc in the right gable's vertical plane, at the eave corner:
  // from horizontal (pointing up-slope, -f) up to the roof's pitch.
  const arcR = Math.min(1.2, Math.max(0.5, (bMax - bMin) * 0.2));
  const corner = P(aMax, bMax);
  const arcPt = (theta, rad) => {
    const horiz = Math.cos(theta) * rad;
    return V({ x: corner.x - f.x * horiz, y: corner.y - f.y * horiz }, eaveH + Math.sin(theta) * rad);
  };
  const arc = pitched && pitch > 0 ? Array.from({ length: 17 }, (_, i) => arcPt((pitch * DEG * i) / 16, arcR)) : null;

  return (
    <group>
      <DimLine points={widthLine} />
      <DimLine points={ext(aMin, bMax, aMin, wy + off * 0.3)} dashed />
      <DimLine points={ext(aMax, bMax, aMax, wy + off * 0.3)} dashed />
      <DimLabel position={V(P((aMin + aMax) / 2, wy), g + 0.05)} text={`Width ${format(width)}`} />

      <DimLine points={lengthLine} />
      <DimLine points={ext(aMax, bMin, lx + off * 0.3, bMin)} dashed />
      <DimLine points={ext(aMax, bMax, lx + off * 0.3, bMax)} dashed />
      <DimLabel position={V(P(lx, (bMin + bMax) / 2), g + 0.05)} text={`Length ${format(length)}`} />

      <DimLine points={[V(eaveBase, 0), V(eaveBase, eaveH)]} />
      <DimLine points={[V(eaveBase, eaveH), V(P(aMax, bMax), eaveH)]} dashed />
      <DimLabel position={V(eaveBase, eaveH / 2)} text={`${pitched ? 'Eave' : 'Height'} ${format(eaveH)}`} />

      {pitched && (
        <>
          <DimLine points={[V(ridgeBase, 0), V(ridgeBase, ridgeH)]} />
          <DimLine points={[V(ridgeBase, ridgeH), V(P(aMax, bMin), ridgeH)]} dashed />
          <DimLabel position={V(ridgeBase, ridgeH / 2)} text={`Ridge ${format(ridgeH)}`} />
        </>
      )}
      {arc && (
        <>
          <DimLine points={[arcPt(0, 0), arcPt(0, arcR * 1.25)]} dashed />
          <DimLine points={arc} />
          <DimLabel position={arcPt((pitch * DEG) / 2, arcR * 1.5)} text={`${+pitch.toFixed(1)}°`} />
        </>
      )}
    </group>
  );
}

// Visual style per generic member kind - any structure strategy's members
// render through this same table, so a new strategy only needs to emit
// members with these `kind`s (or extend this table) to look right.
const MEMBER_STYLE = {
  pillar: { color: '#4a4d52', shape: 'cylinder' },
  chord: { color: '#5a5e64', shape: 'box' },
  purlin: { color: '#9a9fa6', shape: 'box' },
  brace: { color: '#6e7278', shape: 'box' },
};

// A single structure member: a straight bar between two LOCAL points
// (relative to its segment's group, see StructureSegment). `pillar`s render
// as a vertical cylinder (every strategy so far only uses truly vertical
// pillars). Everything else is a box: members in these strategies only ever
// run purely along local X (purlins, crossing the row's width) or purely
// within the local Y-Z plane (chords/braces, front-to-back and tilted) -
// never a mix of both - so a single-axis rotation picks the right one
// rather than needing a general 3D alignment.
function StructureMember({ member }) {
  const { kind, from, to, thickness } = member;
  const style = MEMBER_STYLE[kind] || MEMBER_STYLE.chord;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];

  if (style.shape === 'cylinder') {
    return (
      <mesh position={mid as any} castShadow receiveShadow>
        <cylinderGeometry args={[thickness / 2, thickness / 2, length, 8]} />
        <meshStandardMaterial color={style.color} />
      </mesh>
    );
  }

  // A box's default long axis is local Z; turn it onto the member's own
  // from->to direction. This used to special-case two shapes - "mostly
  // along X" got a flat 90° Y turn, anything else a tilt about X - which
  // drew a purlin that also rises along its row (a pitched-roof rack filled
  // from an edge other than the slope edge) dead level at its mid height,
  // poking out above the rack at one end and through it at the other.
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(dx, dy, dz).normalize()
  );

  return (
    <mesh position={mid as any} quaternion={quaternion} castShadow receiveShadow>
      <boxGeometry args={[thickness, thickness, length]} />
      <meshStandardMaterial color={style.color} />
    </mesh>
  );
}

// One row segment's mounting structure, rotated the same way as the panels
// it supports (each segment rotates around its own center, matching
// Panel's approach). `segment.midX`/`y` are in the roof's own local
// "south-facing" space (see layoutEngine.js's iterateRacks), same as a
// panel's `rackX`/`rackY` - rotated into the real world here via the same
// slope-direction transform, so the rack's anchor position ends up where
// the panels it's actually holding up are, not where a south-facing rack
// would have been.
// `grid`, when given, is the same grid the segment's own panels belong to -
// its `rotation` is a presentation-only transform (see layoutEngine.js's
// comment above gridPivot) applied here on top of the segment's own
// packed-local position/facing, exactly the same way the 2D plan and
// Panel below apply it to a panel's own position/rotation, so a rotated
// grid's mounting structure stays under the panels it's actually holding
// up.
function StructureSegment({ segment, y, depth, azimuth, roofHeight, direction, grid }) {
  const centerY = y + depth / 2; // `y` is the rack's front edge, not its center
  const gridRotation = grid?.rotation || 0;
  const rotationY = (-azimuth + gridRotation) * DEG;
  const localWorld = toSlopeWorld({ x: segment.midX, y: centerY }, direction);
  const world = gridRotation ? rotateAroundPivot(localWorld, gridPivot(grid), gridRotation) : localWorld;
  // Members' x is +rackX (layoutEngine: px - midX), but under rotationY this
  // group's own +x points along -rackX (same as Panel's), so flip it. Only
  // visible once heights vary along a row (a pitched roof filled from an
  // edge other than its slope edge) - every member used to be symmetric.
  const members = useMemo(
    () => segment.members.map((m) => ({ ...m, from: [-m.from[0], m.from[1], m.from[2]], to: [-m.to[0], m.to[1], m.to[2]] })),
    [segment.members]
  );

  return (
    <group position={toThree(world.x, world.y, roofHeight)} rotation={[0, rotationY, 0]}>
      {members.map((m, i) => (
        <StructureMember key={i} member={m} />
      ))}
    </group>
  );
}

// A thin mast with a small ball tip - a harmless site marker (see
// OBSTACLE_PRESETS.lightningArrestor's `marker: true`), not a real
// keep-out volume, so it's deliberately much slimmer than every other
// cylinder obstacle rather than sharing their plain-rod rendering.
function LightningArrestor({ obstacle, baseHeight, selected = false }) {
  const h = obstacle.height;
  const [tx, , tz] = toThree(obstacle.x, obstacle.y);
  return (
    <group>
      <mesh position={[tx, baseHeight + h / 2, tz]} castShadow>
        <cylinderGeometry args={[obstacle.radius, obstacle.radius, h, 8]} />
        <meshStandardMaterial color={selColor(selected, '#3a3a3a')} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[tx, baseHeight + h, tz]} castShadow>
        <sphereGeometry args={[obstacle.radius * 2.5, 12, 12]} />
        <meshStandardMaterial color={selColor(selected, '#b0261e')} metalness={0.3} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Obstacle({ obstacle, baseHeight, selected, onSelect, isDragClick, slopeRoof = null as any }) {
  const h = obstacle.height;
  const [tx, , tz] = toThree(obstacle.x, obstacle.y);
  const centerY = baseHeight + h / 2;
  // A freeform-drawn obstacle (see OBSTACLE_PRESETS' `drawable` flag) is
  // its own traced polygon, not a fixed box - extruded the same way a
  // roof/building's own footprint is (see polygonExtrudeGeometry).
  // `slopeRoof` (a flush skylight/walkway on a pitched roof, see
  // placeObstacle): built parallel to that roof's surface instead of level.
  const polygonGeometry = useMemo(
    () => (obstacle.shape !== 'polygon' ? null
      : slopeRoof ? slopedPolygonGeometry(obstacle.polygon, h, (x, y) => roofSurfaceHeightAt(slopeRoof, { x, y }) - baseHeight)
      : polygonExtrudeGeometry(obstacle.polygon, h)),
    [obstacle.shape, obstacle.polygon, h, slopeRoof, baseHeight]
  );
  const slopeDirection = slopeRoof ? getPitchedRoofSlopeAzimuth(slopeRoof) : null;
  const slopePitch = slopeRoof ? slopeRoof.pitchDeg : null;

  // A Cutout has no 3D body of its own - on a flat roof it's already
  // represented by the real hole punched through BuildingBlock/RoofDeck
  // (see the roofCutouts filtering above); on a pitched roof (not yet
  // supported for the 3D hole, see PitchedBuilding's comment) it simply
  // isn't shown in 3D at all rather than rendering a misleading flat
  // colored patch on the roof surface it's meant to remove. This has to
  // come after the useMemo above, not before it - an early return before a
  // Hook call breaks React's Hook ordering the moment a different obstacle
  // type is selected next to a Cutout in the same obstacles list.
  if (obstacle.label === 'Cutout') return null;

  const body = obstacle.label === 'Tree' ? (
    <Tree obstacle={obstacle} baseHeight={baseHeight} selected={selected} />
  ) : obstacle.label === 'Lightning Arrestor' ? (
    <LightningArrestor obstacle={obstacle} baseHeight={baseHeight} selected={selected} />
  ) : obstacle.shape === 'cylinder' ? (
    <mesh position={[tx, centerY, tz]} castShadow receiveShadow>
      <cylinderGeometry args={[obstacle.radius, obstacle.radius, h, 16]} />
      <meshStandardMaterial color={selColor(selected, '#7d7d7d')} />
    </mesh>
  ) : obstacle.shape === 'polygon' ? (
    <>
      <group position={[0, baseHeight, 0]}>
        <mesh geometry={polygonGeometry as any} rotation={[-Math.PI / 2, 0, 0]} castShadow={obstacle.label !== 'Skylight' && obstacle.label !== 'Walkway'} receiveShadow>
          {obstacle.label === 'Skylight' ? (
            <meshStandardMaterial color={selColor(selected, '#bcdff2')} transparent opacity={0.55} roughness={0.15} metalness={0.4} />
          ) : obstacle.label === 'Walkway' ? (
            <meshStandardMaterial color={selColor(selected, '#a8a8a0')} roughness={0.9} />
          ) : (
            <meshStandardMaterial color={selColor(selected, '#8a6d5b')} />
          )}
        </mesh>
      </group>
      {obstacle.label === 'Skylight' && <SkylightFrame polygon={obstacle.polygon} baseHeight={baseHeight} direction={slopeDirection} pitchDeg={slopePitch} />}
      <BoundaryWall polygon={obstacle.polygon} baseHeight={baseHeight + h} height={obstacle.boundaryHeight} direction={slopeDirection ?? undefined} pitchDeg={slopePitch ?? undefined} />
    </>
  ) : (
    // +rotation: a box's `rotation` is counter-clockwise in plan view (the
    // 2D plan draws it with an SVG rotate(-rotation), y-down), and plan-CCW
    // maps to a positive Y rotation here (plan +y is three's -z, see
    // toThree) - the same sign grid rotation already uses for panels. This
    // used to be negated, mirroring every rotated box in 3D.
    <mesh position={[tx, centerY, tz]} rotation={[0, (obstacle.rotation || 0) * DEG, 0]} castShadow receiveShadow>
      <boxGeometry args={[obstacle.width, h, obstacle.depth]} />
      <meshStandardMaterial color={selColor(selected, '#8a6d5b')} />
    </mesh>
  );

  return (
    // No onSelect while something's being placed (a new obstacle or a
    // pasted copy): the click is left to fall through to the roof/ground
    // behind this obstacle, whose handler does the placing.
    <group onClick={(e) => { if (!onSelect || isDragClick?.(e)) return; e.stopPropagation(); onSelect(obstacle.id); }}>
      {body}
    </group>
  );
}

function SunLight({ elevation, azimuth }) {
  const distance = 40;
  const elevR = elevation * DEG, azR = azimuth * DEG;
  const ux = Math.cos(elevR) * Math.sin(azR);
  const uy = Math.cos(elevR) * Math.cos(azR);
  const uz = Math.sin(elevR);
  const position = toThree(ux * distance, uy * distance, uz * distance);
  const lit = elevation > 0.5;

  return (
    <>
      <ambientLight intensity={lit ? 0.35 : 0.5} />
      {lit && (
        <directionalLight
          position={position}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-25}
          shadow-camera-right={25}
          shadow-camera-top={25}
          shadow-camera-bottom={-25}
          shadow-camera-near={1}
          shadow-camera-far={100}
        />
      )}
    </>
  );
}

// The captured satellite image, textured onto a ground-level plane sized
// and centered to match its real-world footprint (see solar_layout_engine's
// mapImagePlacement) so the building/panels appear to sit on real terrain
// instead of a flat color. Split into its own component because useLoader
// suspends while the texture fetches, and we only want that under a
// Suspense boundary — not the whole scene.
function MapGround({ placement }) {
  const texture = useLoader(THREE.TextureLoader, placement.url);
  const [tx, ty, tz] = toThree(placement.cx, placement.cy, 0.02);
  return (
    <mesh position={[tx, ty, tz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[placement.widthMeters, placement.heightMeters]} />
      <meshStandardMaterial map={texture as any} />
    </mesh>
  );
}

// A second, much-wider real photo (see staticMap.js's buildWideStaticMapImage)
// covering a large enough real-world area that its own edge sits well
// outside where OrbitControls' maxDistance ever lets the camera see —
// real imagery, not a synthetic repeat/fade/stretch trick. It's naturally
// blurrier per-pixel than MapGround since it covers far more ground in the
// same image size, but that only shows up well away from the building,
// which is exactly where MapGround's own crisp copy stops covering.
function WideMapGround({ placement }) {
  const texture = useLoader(THREE.TextureLoader, placement.url);
  const [tx, ty, tz] = toThree(placement.cx, placement.cy, 0.01);
  return (
    <mesh position={[tx, ty, tz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[placement.widthMeters, placement.heightMeters]} />
      <meshStandardMaterial map={texture as any} />
    </mesh>
  );
}

// Which roof (if any) an obstacle is resting on, so its shadow-casting base
// and ground obstacles' baseHeight agree with the same multi-roof logic
// layoutEngine.js's shading math uses.
// Where an obstacle actually sits: its base at the lowest roof-surface
// point under its footprint, and its body extended by the surface's own
// rise across that footprint so its top is still `height` above the
// highest point (see obstacleRoofSurfaceRange). Flat roofs add the deck
// slab; a pitched roof's surface already is the building's sloped top.
// This used to be a flat buildingHeight + deck for every roof, so on a
// pitched roof an obstacle sank into the slope wherever the roof climbed.
// Flush, drawn roof features that lie *on* the roof rather than standing
// up from it - on a pitched roof they're built parallel to the slope (see
// slopedPolygonGeometry) instead of as a level slab stretched by the rise.
const FLUSH_DRAWN_LABELS = new Set(['Skylight', 'Walkway']);

function placeObstacle(obstacle, roofs) {
  const { min, max, roof } = obstacleRoofSurfaceRange(obstacle, roofs);
  if (!roof) return { baseHeight: 0, obstacle };
  const deck = roof.type === 'pitched' ? 0 : DECK_THICKNESS;
  if (roof.type === 'pitched' && obstacle.shape === 'polygon' && FLUSH_DRAWN_LABELS.has(obstacle.label)) {
    return { baseHeight: min, obstacle, slopeRoof: roof };
  }
  const rise = max - min;
  return {
    baseHeight: min + deck,
    obstacle: rise > 1e-6 ? { ...obstacle, height: obstacle.height + rise } : obstacle,
  };
}

// How far (in degrees, clockwise on screen) the compass needle should turn
// to keep pointing at true north as the camera orbits - unlike the 2D plan
// view (north is always screen-up, a fixed reference), the 3D camera orbits
// freely, so "which way is north" on screen changes with it. Projects
// world north (-Z, see toThree's own comment) and the orbit target through
// the camera the same way the renderer does, rather than reasoning about
// OrbitControls' internal azimuthal-angle convention by hand - robust to
// whatever the current polar angle/zoom happens to be, at the cost of only
// being exact for camera roll=0 (true here; OrbitControls never rolls).
function compassAngleDeg(camera, target) {
  const targetNdc = target.clone().project(camera);
  const northNdc = target.clone().add(new THREE.Vector3(0, 0, -1)).project(camera);
  const dx = northNdc.x - targetNdc.x;
  const dy = northNdc.y - targetNdc.y; // NDC +y is up, same sense a "rotate clockwise from up" angle wants
  return Math.atan2(dx, dy) / DEG;
}

// Design Report renders (see Scene3D's `capture` prop): once the scene's
// textures (satellite ground) have finished loading and a few frames have
// let shadow maps settle, renders each requested view from a fixed camera
// and hands back one JPEG data URL per view. Deterministic angles rather
// than whatever the user last orbited to, so every report looks the same.
// `active` from useProgress tracks three's DefaultLoadingManager, which
// useLoader's TextureLoader goes through; the 10s cap means a texture that
// never resolves (offline, CORS) still yields renders - just without it.
function CaptureViews({ views, target, radius, onDone }: {
  views: { azimuth: number; elevation: number }[];
  target: [number, number, number];
  radius: number;
  onDone: (urls: string[]) => void;
}) {
  const { gl, scene, camera } = useThree();
  const { active } = useProgress();
  const frames = useRef(0);
  const startedAt = useRef(performance.now());
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    frames.current += 1;
    const waited = performance.now() - startedAt.current;
    if (frames.current < 30 || (active && waited < 10000)) return;
    done.current = true;
    const cam = camera as THREE.PerspectiveCamera;
    // A bounding sphere of `radius` fitted to the vertical field of view
    // leaves the buildings small in a 3:2 frame (the sphere is far rounder
    // than a typical low, wide site), so pull in to ~0.8 of that.
    const distance = (radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2))) * 0.8;
    const t = new THREE.Vector3(...target);
    const urls = views.map(({ azimuth, elevation }) => {
      // Compass azimuth (0 = north, 90 = east) in engine space, mapped to
      // three's axes the same way toThree does: north is -Z, east is +X.
      const az = THREE.MathUtils.degToRad(azimuth);
      const el = THREE.MathUtils.degToRad(elevation);
      cam.position.set(
        t.x + distance * Math.cos(el) * Math.sin(az),
        t.y + distance * Math.sin(el),
        t.z - distance * Math.cos(el) * Math.cos(az),
      );
      cam.lookAt(t);
      cam.updateMatrixWorld();
      gl.render(scene, cam);
      return gl.domElement.toDataURL('image/jpeg', 0.88);
    });
    onDone(urls);
  });
  return null;
}

export default function Scene3D({ roofs, panelSpec, obstacles, sunElevation, sunAzimuth, placingShape, onPlaceObstacle, selectedObstacleId, onSelectObstacle, selectedRoofId, onSelectRoof, canSelectRoofs = false, highlightRoofId = null as any, focusPoint = null as any, onPickPanelForDelete = undefined as any, edgePick = null as any, addSidePick = null as any, onBackgroundClick = undefined as any, canSelectGrids = false, onSelectGrid = undefined as any, showPanels = true, ghostPanels = false, mapImagePlacement = null as any, mapImageWidePlacement = null as any, onCompassAngleChange, capture = null as any, formatLength = ((m) => `${m.toFixed(1)} m`) as any }: any) {
  const maxBuildingHeight = Math.max(0, ...roofs.map((r) => r.buildingHeight));
  const orbitControlsRef = useRef<any>(null);
  // Orbiting/panning the camera is a pointerdown-drag-pointerup on the same
  // canvas OrbitControls uses - but R3F's own click dispatch has no built-in
  // drag-vs-click distinction of its own: whatever mesh the pointer happens
  // to be over at pointerup gets a click, even after a long drag elsewhere
  // in between. Without this, ending an orbit drag over the roof/ground/an
  // obstacle silently selected (or deselected) it - the right-side
  // properties rail would vanish mid-rotate for no reason the user did on
  // purpose. Tracked here (not per-mesh) since every click handler in this
  // file needs the same check.
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  function isDragClick(e) {
    const down = pointerDownRef.current;
    if (!down) return false;
    return Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
  }
  // Coalesces onChange (which can fire on every pointermove while dragging)
  // down to one update per tick, so orbiting doesn't flood the parent with
  // a setState call per mouse-move event. Deliberately setTimeout, not
  // requestAnimationFrame - rAF is throttled/never fires while the tab
  // (or an embedded preview pane) is backgrounded, which would silently
  // stall the compass instead of just catching up late.
  const compassTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportCompassAngle = () => {
    if (!onCompassAngleChange || compassTimerRef.current != null) return;
    compassTimerRef.current = setTimeout(() => {
      compassTimerRef.current = null;
      const controls = orbitControlsRef.current;
      if (!controls) return;
      onCompassAngleChange(compassAngleDeg(controls.object, controls.target));
    }, 0);
  };
  // Report the starting angle too, not just after the first orbit - camera
  // position starts off-axis (see the Canvas camera prop below), so the
  // compass would otherwise show a stale 0deg until the user first drags.
  useEffect(() => {
    reportCompassAngle();
    // Also reset the ref, not just cancel the timer - React 18 StrictMode
    // double-invokes this effect in development (mount, cleanup, mount
    // again), and reportCompassAngle's own "already scheduled" guard reads
    // this ref; leaving it non-null after cancelling would make the second,
    // real mount's call silently no-op forever with no timer left running
    // to ever null it back out.
    return () => {
      if (compassTimerRef.current == null) return;
      clearTimeout(compassTimerRef.current);
      compassTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll-zoom with something selected (`focusPoint`, world plan x/y + a
  // height): on the first wheel tick where the orbit target isn't already
  // on it, glide the camera over to it - target and camera move by the same
  // offset, so the view angle and distance are kept - and let OrbitControls'
  // own dolly then zoom toward it (and orbit around it). Nothing moves until
  // the user actually zooms, and with no selection zoom is unchanged.
  const focusAnimRef = useRef<any>(null);
  function glideToFocusOnWheel() {
    const controls = orbitControlsRef.current;
    if (!controls || !focusPoint || focusAnimRef.current) return;
    const goal = new THREE.Vector3(...toThree(focusPoint.x, focusPoint.y, focusPoint.h || 0));
    const delta = goal.clone().sub(controls.target);
    if (delta.length() < 0.3) return;
    const startTarget = controls.target.clone();
    const t0 = performance.now(), dur = 280;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      // Keep whatever dolly the wheel already applied: offset from the
      // current camera->target vector rather than snapping to the start.
      const camToTarget = controls.object.position.clone().sub(controls.target);
      controls.target.copy(startTarget).addScaledVector(delta, e);
      controls.object.position.copy(controls.target).add(camToTarget);
      controls.update();
      if (k < 1) focusAnimRef.current = requestAnimationFrame(step);
      else focusAnimRef.current = null;
    };
    focusAnimRef.current = requestAnimationFrame(step);
  }

  // Holding Shift swaps the left button from orbit to pan for as long as
  // it's held, on top of the right button always panning - a common
  // secondary way to pan without switching hands to the right button.
  // Mutates the live three-stdlib controls object directly (there's no
  // React prop for "what the left button does right now" beyond the
  // initial mouseButtons config).
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== 'Shift' || !orbitControlsRef.current) return;
      orbitControlsRef.current.mouseButtons.LEFT = THREE.MOUSE.PAN;
    }
    function handleKeyUp(e) {
      if (e.key !== 'Shift' || !orbitControlsRef.current) return;
      orbitControlsRef.current.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const extent = useMemo(() => {
    const xs = roofs.flatMap((r) => r.polygon.map((p) => Math.abs(p.x)));
    const ys = roofs.flatMap((r) => r.polygon.map((p) => Math.abs(p.y)));
    return Math.max(...xs, ...ys, 10, maxBuildingHeight, 1) * 2;
  }, [roofs, maxBuildingHeight]);

  // Where OrbitControls should actually pivot/dolly-zoom toward - the
  // average of every roof vertex and every obstacle's own position (world
  // x/y, same coordinate space extent uses above). World (0,0) (the
  // confirmed site pin) used to be the fixed target instead (see
  // orbitTarget below), which zooms/orbits around wherever the pin happens
  // to sit rather than the roofs/obstacles actually traced there - same
  // fix as the 2D plan's own contentCentroid, for the same reason. Falls
  // back to the origin once nothing's been placed yet.
  const contentCentroid = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    roofs.forEach((r) => r.polygon.forEach((p) => pts.push(p)));
    obstacles.forEach((o) => pts.push({ x: o.x, y: o.y }));
    if (pts.length === 0) return { x: 0, y: 0 };
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
  }, [roofs, obstacles]);

  // How far the roofs/obstacles spread from contentCentroid - frames the
  // Design Report's fixed-camera renders (CaptureViews).
  const captureRadius = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    roofs.forEach((r) => r.polygon.forEach((p) => pts.push(p)));
    obstacles.forEach((o) => pts.push({ x: o.x, y: o.y }));
    const r = Math.max(0, ...pts.map((p) => Math.hypot(p.x - contentCentroid.x, p.y - contentCentroid.y)));
    return Math.max(r, maxBuildingHeight, 8);
  }, [roofs, obstacles, contentCentroid, maxBuildingHeight]);

  // The flat fallback plane sits directly under the map image (see
  // MapGround) and only shows at its edges/corners. It's sized far larger
  // than any building this app deals with (and colored identically to the
  // canvas background) so it reads as an infinite ground rather than a
  // finite tile with a visible border — combined with OrbitControls'
  // maxDistance below, the camera can never get close enough to its true
  // edge to notice it isn't actually infinite.
  const INFINITE_GROUND_SIZE = 800;
  const groundSize = mapImagePlacement
    ? Math.max(INFINITE_GROUND_SIZE, mapImagePlacement.widthMeters * 1.05, mapImagePlacement.heightMeters * 1.05)
    : INFINITE_GROUND_SIZE;

  // Keep orbiting confined to a sensible range around the building instead
  // of letting the user zoom out far enough to approach the ground plane's
  // real edge, or zoom in through the roof/panels.
  const minOrbitDistance = Math.max(extent * 0.25, 3);
  const maxOrbitDistance = extent * 2.5;

  // OrbitControls' `target` prop is applied to the underlying THREE.Vector3
  // on every render where the array's identity changes. An inline array
  // literal here is a new identity every render (any parent state change —
  // hover, obstacle selection, slider drag), which snaps the camera's pivot
  // back to center and undoes any panning the user just did. Memoizing on
  // the actual value keeps identity stable across unrelated re-renders.
  const orbitTarget = useMemo(
    () => toThree(contentCentroid.x, contentCentroid.y, maxBuildingHeight + 1),
    [contentCentroid, maxBuildingHeight]
  );

  function handleClick(e, roofId = null) {
    if (placingShape) {
      e.stopPropagation();
      onPlaceObstacle(e.point.x, -e.point.z);
      return;
    }
    if (isDragClick(e)) return;
    e.stopPropagation();
    // In Roof setup (`canSelectRoofs`) clicking a roof selects it here just
    // like on the 2D plan, so its rail controls can be used straight from
    // the 3D view (the editor's selectRoof also clears any obstacle
    // selection). Past Roof setup a roof click isn't a roof selection (same
    // rule as the 2D plan) - it just clears the obstacle selection, like
    // clicking empty ground, leaving any roof selection as it was.
    if (roofId) {
      if (canSelectRoofs) onSelectRoof?.(roofId);
      else onSelectObstacle?.(null);
      return;
    }
    onSelectObstacle?.(null);
    onSelectRoof?.(null);
    onSelectGrid?.(null);
    // Empty-ground click also exits any picking mode (edge pick, add
    // row/column, delete picks), the same as clicking empty plan in 2D.
    onBackgroundClick?.();
  }

  return (
    <div
      style={{ width: '100%', height: '100%', cursor: placingShape ? 'crosshair' : 'default' }}
      onPointerDown={(e) => { pointerDownRef.current = { x: e.clientX, y: e.clientY }; }}
      onWheelCapture={glideToFocusOnWheel}
    >
      {/* logarithmicDepthBuffer: the ground stacks three nearly-coplanar
          planes only 1-2cm apart (the flat fallback color, WideMapGround,
          MapGround - see their own comments) under a far clip plane
          (INFINITE_GROUND_SIZE * 3) that's 24000x the near one. A standard
          depth buffer doesn't have enough precision at that ratio to keep
          those layers reliably sorted, which shows up as flickering/
          blocky z-fighting between them while orbiting. */}
      {/* `capture` (Design Report renders, see CaptureViews): no orbit
          controls, and preserveDrawingBuffer so toDataURL reads back the
          frame just rendered instead of a cleared buffer. */}
      <Canvas shadows gl={{ logarithmicDepthBuffer: true, preserveDrawingBuffer: !!capture }} dpr={capture ? 1.5 : undefined} camera={{ position: [0, extent * 0.8 + maxBuildingHeight, extent * 1.2], fov: 45, near: 0.1, far: INFINITE_GROUND_SIZE * 3 }}>
        <color attach="background" args={['#eef3ea']} />
        <SunLight elevation={sunElevation} azimuth={sunAzimuth} />

        {/* Click-catcher for obstacle placement — kept even when a map image
            covers it visually, offset slightly below so it never z-fights
            with whatever's drawn on top of it. */}
        <mesh position={[0, mapImagePlacement ? -0.01 : 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={(e) => handleClick(e)}>
          <planeGeometry args={[groundSize, groundSize]} />
          <meshStandardMaterial color="#eef3ea" />
        </mesh>

        {mapImageWidePlacement && (
          <MapGroundBoundary>
            <Suspense fallback={null}>
              <WideMapGround placement={mapImageWidePlacement} />
            </Suspense>
          </MapGroundBoundary>
        )}

        {mapImagePlacement && (
          <MapGroundBoundary>
            <Suspense fallback={null}>
              <MapGround placement={mapImagePlacement} />
            </Suspense>
          </MapGroundBoundary>
        )}

        {roofs.map((roof) => {
          // A pitched building's own sloped top *is* the roof surface (no
          // separate deck slab like a flat roof's) - panel/structure heights
          // from computeStructure are measured from it at the eave.
          const deckTop = roof.type === 'pitched' ? roof.buildingHeight : roof.buildingHeight + DECK_THICKNESS;
          // Also tinted while hovered in the editor's Fill roof / Add grid
          // roof chooser (`highlightRoofId` - a roof id, or 'all'), same as
          // the 2D plan's outline, so the choice is clear in either view.
          const selected = selectedRoofId === roof.id || highlightRoofId === 'all' || highlightRoofId === roof.id;
          // A Cutout obstacle (see OBSTACLE_PRESETS.cutout) punches a real
          // full-height hole through BuildingBlock + RoofDeck via their
          // `cutouts` prop - flat roofs only (see PitchedBuilding's own
          // comment above for why the pitched/sloped case is out of scope
          // for v1; Cutout still blocks panel placement and shows in the 2D
          // plan there, it just doesn't carve a real 3D shaft).
          const roofPoly = getRoofPolygon(roof);
          // Every cutout, not just ones whose center is on this roof - the
          // subtraction itself is a no-op where they don't overlap, and a
          // cutout crossing the roof edge often has its center outside it.
          const roofCutouts = roof.type === 'pitched'
            ? []
            : obstacles.filter((o) => o.label === 'Cutout' && o.polygon?.length >= 3).map((o) => o.polygon);
          return (
            <group key={roof.id}>
              {roof.type === 'pitched' ? (
                <>
                  <PitchedBuilding polygon={roofPoly} buildingHeight={roof.buildingHeight} pitchDeg={roof.pitchDeg} direction={getPitchedRoofSlopeAzimuth(roof)} selected={selected} onClick={(e) => handleClick(e, roof.id)} />
                  <BoundaryWall polygon={roofPoly} baseHeight={roof.buildingHeight} height={roof.boundaryHeight} direction={getPitchedRoofSlopeAzimuth(roof)} pitchDeg={roof.pitchDeg} />
                </>
              ) : (
                <>
                  <FlatBuilding
                    polygon={roofPoly}
                    usablePolygon={roof.usablePolygon || []}
                    buildingHeight={roof.buildingHeight}
                    boundaryHeight={roof.boundaryHeight}
                    cutouts={roofCutouts}
                    selected={selected}
                    onClick={(e) => handleClick(e, roof.id)}
                  />
                </>
              )}

              {/* A roof can (eventually) hold more than one independently
                  configured grid (see README's "Panel grids" entry) - each
                  carries its own panels/structure/shading/efficiency, plus
                  its own `rotation` (grid.layout.rotation), a presentation-
                  only transform applied here exactly the way the 2D plan
                  applies it (see layoutEngine.js's comment above
                  gridPivot). */}
              {showPanels && roof.grids.flatMap((grid) => {
                const gridRotation = grid.layout.rotation || 0;
                const pivot = gridRotation ? gridPivot(grid.layout) : null;
                const landscape = grid.layout.orientation === 'landscape';
                return grid.layout.panels.map((p) => {
                  const h = grid.structure?.panelHeights.get(p.id);
                  const pos = gridRotation ? rotateAroundPivot(p, pivot, gridRotation) : p;
                  return (
                    <Panel
                      key={`${grid.id}-${p.id}`}
                      x={pos.x} y={pos.y}
                      w={landscape ? panelSpec.height : panelSpec.width}
                      len={landscape ? panelSpec.width : panelSpec.height}
                      tilt={grid.layout.tilt}
                      azimuth={grid.layout.azimuth}
                      extraRotation={p.rotation || 0}
                      gridRotation={gridRotation}
                      roofHeight={deckTop}
                      frontHeight={h?.frontHeight ?? 0}
                      backHeight={h?.backHeight ?? 0}
                      crossSlope={h?.crossSlope ?? 0}
                      shaded={grid.shadedIds?.has(p.id)}
                      efficiencyPct={grid.efficiencyPct?.[p.id]}
                      ghost={ghostPanels}
                      selected={!ghostPanels && grid.selected}
                      deletePicked={!ghostPanels && !!grid.deletePickedIds?.has(p.id)}
                      overlaps={!ghostPanels && !!grid.overlapIds?.has(p.id)}
                      // A click on any panel selects its whole grid (shift
                      // toggles it in/out of a multi-selection), matching
                      // the 2D plan - only in Panel/Grid setup.
                      onClick={canSelectGrids && !placingShape ? (e) => {
                        if (isDragClick(e)) return;
                        e.stopPropagation();
                        // In this grid's own delete row/column/panel mode a
                        // click picks (Cmd/Ctrl adds in panel mode), same as
                        // the 2D plan - otherwise it selects the grid.
                        if (grid.deleteMode) {
                          onPickPanelForDelete?.(p, !!(e.nativeEvent?.metaKey || e.nativeEvent?.ctrlKey));
                          return;
                        }
                        onSelectGrid?.(roof.id, grid.id, !!(e.nativeEvent?.shiftKey ?? e.shiftKey));
                      } : undefined}
                    />
                  );
                });
              })}

              {!ghostPanels && roof.grids.flatMap((grid) =>
                (grid.structure?.racks || []).flatMap((rack) =>
                  rack.segments.map((segment, i) => (
                    <StructureSegment
                      key={`${grid.id}-${rack.y}-${i}`}
                      segment={segment}
                      y={rack.y}
                      depth={rack.depth}
                      azimuth={grid.layout.azimuth}
                      roofHeight={deckTop}
                      direction={gridDirection(grid.layout, roof)}
                      grid={grid.layout}
                    />
                  ))
                )
              )}
              {/* Selected roof's own dimensions - Roof setup only (where it's
                  selectable and its size is being edited), never in a report
                  capture. See RoofDimensions. */}
              {canSelectRoofs && !capture && selectedRoofId === roof.id && (
                <RoofDimensions roof={roof} frameAz={roof.dimensionFrameAzimuth ?? 0} format={formatLength} />
              )}
              {/* Edge picking (mirror / margin override / align to edge) on
                  this roof - each outline edge as a PickBar riding the roof
                  surface (slightly lifted so it isn't z-fighting it) - or
                  along the top of the boundary wall when the roof has one,
                  since the wall stands on that same edge and would
                  otherwise swallow the bar and its highlight. */}
              {edgePick && edgePick.roofId === roof.id && roofPoly.map((p, i) => {
                const q = roofPoly[(i + 1) % roofPoly.length];
                const lift = (roof.type === 'pitched' ? 0 : DECK_THICKNESS) + Math.max(0, roof.boundaryHeight || 0) + 0.06;
                return (
                  <PickBar
                    key={`edge-pick-${i}`}
                    a={p} b={q}
                    ha={roofSurfaceHeightAt(roof, p) + lift} hb={roofSurfaceHeightAt(roof, q) + lift}
                    state={edgePick.picked?.includes(i) ? 'picked' : edgePick.hovered === i ? 'hover' : 'idle'}
                    onHover={(on) => edgePick.onHover((h) => (on ? i : (h === i ? null : h)))}
                    onPick={(e) => edgePick.onPick(i, !!e.nativeEvent?.shiftKey)}
                    isDragClick={isDragClick}
                  />
                );
              })}

              {/* Add row/column: the grid's two pickable sides as PickBars
                  at roughly panel height above the roof surface. */}
              {addSidePick && addSidePick.roofId === roof.id && addSidePick.edges.map(({ side, a, b }) => {
                const lift = (roof.type === 'pitched' ? 0 : DECK_THICKNESS) + 0.35;
                return (
                  <PickBar
                    key={`add-side-${side}`}
                    a={a} b={b}
                    ha={roofSurfaceHeightAt(roof, a) + lift} hb={roofSurfaceHeightAt(roof, b) + lift}
                    state={addSidePick.hovered === side ? 'hover' : 'idle'}
                    palette="add"
                    onHover={(on) => addSidePick.onHover((h) => (on ? side : (h === side ? null : h)))}
                    onPick={() => addSidePick.onPick(side)}
                    isDragClick={isDragClick}
                  />
                );
              })}
            </group>
          );
        })}

        {obstacles.map((o) => {
          const placed = placeObstacle(o, roofs);
          return (
          <Obstacle
            key={o.id}
            obstacle={placed.obstacle}
            baseHeight={placed.baseHeight}
            slopeRoof={placed.slopeRoof}
            selected={selectedObstacleId === o.id}
            onSelect={placingShape ? null : onSelectObstacle}
            isDragClick={isDragClick}
          />
          );
        })}

        {capture && (
          <CaptureViews
            views={capture.views}
            target={toThree(contentCentroid.x, contentCentroid.y, maxBuildingHeight * 0.5) as [number, number, number]}
            radius={captureRadius}
            onDone={capture.onDone}
          />
        )}
        {!capture && <OrbitControls
          ref={orbitControlsRef}
          target={orbitTarget as any}
          // With nothing selected, wheel-zoom heads toward whatever's under
          // the cursor; with a selection, zoom works around it instead (the
          // target is glided onto it - see glideToFocusOnWheel).
          zoomToCursor={!focusPoint}
          maxPolarAngle={Math.PI / 2 - 0.02}
          minDistance={minOrbitDistance}
          maxDistance={maxOrbitDistance}
          // Plain (left) drag orbits, matching every other 3D viewer
          // (SketchUp, Google Earth) - the natural first thing to try, and
          // it isn't limited to any range: OrbitControls' azimuth angle is
          // unbounded by default, so this spins all the way around. Panning
          // - needed to shift the visible area sideways once zoomed in on
          // one part of a multi-building site - moves to the right
          // button/two-finger drag, or holding Shift on the left button
          // (see the keydown/keyup effect above, which swaps LEFT between
          // ROTATE and PAN live).
          mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
          touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
          onChange={reportCompassAngle}
        />}
      </Canvas>
    </div>
  );
}
