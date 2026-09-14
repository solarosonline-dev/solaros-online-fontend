import React, { Suspense, useMemo, useRef, useEffect } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { Edges, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { isOnRoof, insetPolygon, toSlopeLocal, toSlopeWorld } from './geometry.js';
import { gridPivot, rotateAroundPivot } from './layoutEngine.js';

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

const DECK_THICKNESS = 0.15;

function RoofDeck({ polygon, buildingHeight, cutouts, selected, onClick }) {
  const geometry = useMemo(() => polygonExtrudeGeometry(polygon, DECK_THICKNESS, cutouts), [polygon, cutouts]);

  return (
    <group position={[0, buildingHeight, 0]}>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow onClick={onClick}>
        <meshStandardMaterial color={selected ? '#e4dcc4' : '#d8d2c4'} />
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
function RoofMarginBand({ polygon, usablePolygon, buildingHeight }) {
  const geometry = useMemo(
    () => (usablePolygon.length >= 3 ? polygonExtrudeGeometry(polygon, DECK_THICKNESS + 0.03, [usablePolygon]) : null),
    [polygon, usablePolygon],
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
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getZ(i) - eaveHeight) < 1e-6) {
      // The vertex's own position in the roof's local "south-facing"
      // space (see toSlopeLocal in geometry.js) - climbing with its local
      // Y is what makes the roof actually slope toward whichever compass
      // direction it's set to face, not always north.
      const localY = toSlopeLocal({ x: pos.getX(i), y: pos.getY(i) }, direction).y;
      pos.setZ(i, eaveHeight + (localY - frontLocalY) * Math.tan(pitchRad));
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
      <meshStandardMaterial color={selected ? '#e4dcc4' : '#d8d2c4'} />
    </mesh>
  );
}

// The building itself, rendered as the roof polygon extruded down to the
// ground — a simplification (real buildings aren't usually shaped exactly
// like their roof footprint at every floor), but enough to visually ground
// the roof deck at the right height.
function BuildingBlock({ polygon, buildingHeight, cutouts, selected, onClick }) {
  const geometry = useMemo(() => polygonExtrudeGeometry(polygon, buildingHeight, cutouts), [polygon, buildingHeight, cutouts]);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow onClick={onClick}>
      <meshStandardMaterial color={selected ? '#d4cfc2' : '#c9c4ba'} />
    </mesh>
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
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const localY = toSlopeLocal({ x: pos.getX(i), y: pos.getY(i) }, direction).y;
      pos.setZ(i, pos.getZ(i) + (localY - frontLocalY) * Math.tan(pitchRad));
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
function SkylightFrame({ polygon, baseHeight }) {
  const geometry = useMemo(() => boundaryRingGeometry(polygon, SKYLIGHT_FRAME_HEIGHT), [polygon]);
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

function Panel({ x, y, w, len, tilt, azimuth, extraRotation = 0, gridRotation = 0, roofHeight, frontHeight, backHeight, shaded, efficiencyPct }) {
  const tiltRad = tilt * DEG;
  const rotationY = -(azimuth + extraRotation + gridRotation) * DEG;
  const centerY = roofHeight + (frontHeight + backHeight) / 2;
  const color = efficiencyPct != null ? efficiencyColor(efficiencyPct) : (shaded ? '#e0873c' : '#1c2b4a');

  return (
    <group position={toThree(x, y, centerY)} rotation={[0, rotationY, 0]}>
      <mesh rotation={[-tiltRad, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.03, len]} />
        {/* A real panel's glass surface glints as the sun moves across the
            sky - clearcoat (a thin glossy layer over the tinted base) gets
            that directly from SunLight's own directional light (already
            tied to selectedHour via sunElevation/sunAzimuth), no
            environment map needed since a direct specular highlight comes
            from the light itself, not a reflected scene. */}
        <meshPhysicalMaterial color={color} roughness={0.35} metalness={0.15} clearcoat={1} clearcoatRoughness={0.12} />
        {/* A white edge per panel so adjacent panels in the same grid/rack
            read as separate modules instead of blurring into one solid
            slab, especially once every panel's own tint is close to
            identical (the common case, no shading/efficiency view active). */}
        <Edges color="white" />
      </mesh>
    </group>
  );
}

// Trunk + conical foliage instead of a plain cylinder, so it reads as a
// tree rather than a tank. Total height still matches obstacle.height, so
// shading/geometry elsewhere that treats the tree as a simple cylinder
// (shadowPolygon math, etc.) stays consistent with what's drawn here.
function Tree({ obstacle, baseHeight }) {
  const h = obstacle.height;
  const [tx, , tz] = toThree(obstacle.x, obstacle.y);
  const trunkHeight = h * 0.35;
  const trunkRadius = Math.max(obstacle.radius * 0.15, 0.08);
  const foliageHeight = h - trunkHeight;
  const foliageRadius = obstacle.radius;
  const foliageBaseY = baseHeight + trunkHeight;
  const canopy = obstacle.canopy || 'cone';

  return (
    <group>
      <mesh position={[tx, baseHeight + trunkHeight / 2, tz]} castShadow receiveShadow>
        <cylinderGeometry args={[trunkRadius, trunkRadius * 1.3, trunkHeight, 8]} />
        <meshStandardMaterial color="#6b4a2f" />
      </mesh>

      {canopy === 'cone' && (
        <mesh position={[tx, foliageBaseY + foliageHeight / 2, tz]} castShadow receiveShadow>
          <coneGeometry args={[foliageRadius, foliageHeight, 10]} />
          <meshStandardMaterial color="#3f6b3a" />
        </mesh>
      )}

      {canopy === 'round' && (
        <mesh position={[tx, foliageBaseY + foliageHeight / 2, tz]} castShadow receiveShadow>
          <sphereGeometry args={[foliageHeight / 2, 12, 10]} />
          <meshStandardMaterial color="#4a7a3f" />
        </mesh>
      )}

      {canopy === 'bushy' && (() => {
        const r = foliageRadius * 0.5;
        // Lower cluster sits with its center just above the trunk top, so its
        // bottom overlaps the trunk slightly instead of floating above it.
        const lowerY = foliageBaseY + r * 0.7;
        const off = foliageRadius * 0.4;
        const lobes = [0, 120, 240].map((angle) => {
          const ax = Math.cos(angle * DEG) * off;
          const az = Math.sin(angle * DEG) * off;
          return { key: angle, x: tx + ax, y: lowerY, z: tz + az, r };
        });
        // A smaller top lobe adds height/volume without leaving a gap, since
        // it overlaps the lower cluster below it.
        (lobes as any[]).push({ key: 'top', x: tx, y: lowerY + r * 1.1, z: tz, r: r * 0.8 });
        return lobes.map((l) => (
          <mesh key={l.key} position={[l.x, l.y, l.z]} castShadow receiveShadow>
            <sphereGeometry args={[l.r, 10, 8]} />
            <meshStandardMaterial color="#4f7d44" />
          </mesh>
        ));
      })()}
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

  // A box's default long axis is local Z. Running purely along X (a
  // purlin) needs a 90° turn around Y to align that axis with X instead;
  // running within the Y-Z plane (chord/brace) needs the usual tilt
  // rotation around X.
  const rotation = Math.abs(dx) > Math.abs(dy) + Math.abs(dz)
    ? [0, Math.PI / 2, 0]
    : [Math.atan2(-dy, dz), 0, 0];

  return (
    <mesh position={mid as any} rotation={rotation as any} castShadow receiveShadow>
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
  const rotationY = -(azimuth + gridRotation) * DEG;
  const localWorld = toSlopeWorld({ x: segment.midX, y: centerY }, direction);
  const world = gridRotation ? rotateAroundPivot(localWorld, gridPivot(grid), gridRotation) : localWorld;

  return (
    <group position={toThree(world.x, world.y, roofHeight)} rotation={[0, rotationY, 0]}>
      {segment.members.map((m, i) => (
        <StructureMember key={i} member={m} />
      ))}
    </group>
  );
}

// A thin mast with a small ball tip - a harmless site marker (see
// OBSTACLE_PRESETS.lightningArrestor's `marker: true`), not a real
// keep-out volume, so it's deliberately much slimmer than every other
// cylinder obstacle rather than sharing their plain-rod rendering.
function LightningArrestor({ obstacle, baseHeight }) {
  const h = obstacle.height;
  const [tx, , tz] = toThree(obstacle.x, obstacle.y);
  return (
    <group>
      <mesh position={[tx, baseHeight + h / 2, tz]} castShadow>
        <cylinderGeometry args={[obstacle.radius, obstacle.radius, h, 8]} />
        <meshStandardMaterial color="#3a3a3a" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[tx, baseHeight + h, tz]} castShadow>
        <sphereGeometry args={[obstacle.radius * 2.5, 12, 12]} />
        <meshStandardMaterial color="#b0261e" metalness={0.3} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Obstacle({ obstacle, baseHeight, selected, onSelect, isDragClick }) {
  const h = obstacle.height;
  const [tx, , tz] = toThree(obstacle.x, obstacle.y);
  const centerY = baseHeight + h / 2;
  // A freeform-drawn obstacle (see OBSTACLE_PRESETS' `drawable` flag) is
  // its own traced polygon, not a fixed box - extruded the same way a
  // roof/building's own footprint is (see polygonExtrudeGeometry).
  const polygonGeometry = useMemo(
    () => (obstacle.shape === 'polygon' ? polygonExtrudeGeometry(obstacle.polygon, h) : null),
    [obstacle.shape, obstacle.polygon, h]
  );

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
    <Tree obstacle={obstacle} baseHeight={baseHeight} />
  ) : obstacle.label === 'Lightning Arrestor' ? (
    <LightningArrestor obstacle={obstacle} baseHeight={baseHeight} />
  ) : obstacle.shape === 'cylinder' ? (
    <mesh position={[tx, centerY, tz]} castShadow receiveShadow>
      <cylinderGeometry args={[obstacle.radius, obstacle.radius, h, 16]} />
      <meshStandardMaterial color="#7d7d7d" />
    </mesh>
  ) : obstacle.shape === 'polygon' ? (
    <>
      <group position={[0, baseHeight, 0]}>
        <mesh geometry={polygonGeometry as any} rotation={[-Math.PI / 2, 0, 0]} castShadow={obstacle.label !== 'Skylight' && obstacle.label !== 'Walkway'} receiveShadow>
          {obstacle.label === 'Skylight' ? (
            <meshStandardMaterial color="#bcdff2" transparent opacity={0.55} roughness={0.15} metalness={0.4} />
          ) : obstacle.label === 'Walkway' ? (
            <meshStandardMaterial color="#a8a8a0" roughness={0.9} />
          ) : (
            <meshStandardMaterial color="#8a6d5b" />
          )}
        </mesh>
      </group>
      {obstacle.label === 'Skylight' && <SkylightFrame polygon={obstacle.polygon} baseHeight={baseHeight} />}
      <BoundaryWall polygon={obstacle.polygon} baseHeight={baseHeight + h} height={obstacle.boundaryHeight} />
    </>
  ) : (
    <mesh position={[tx, centerY, tz]} rotation={[0, -(obstacle.rotation || 0) * DEG, 0]} castShadow receiveShadow>
      <boxGeometry args={[obstacle.width, h, obstacle.depth]} />
      <meshStandardMaterial color="#8a6d5b" />
    </mesh>
  );

  const ringRadius = obstacle.shape === 'cylinder'
    ? obstacle.radius
    : obstacle.shape === 'polygon'
      ? Math.max(...obstacle.polygon.map((p) => Math.hypot(p.x - obstacle.x, p.y - obstacle.y)))
      : Math.max(obstacle.width, obstacle.depth) / 2;

  return (
    <group onClick={(e) => { if (isDragClick?.(e)) return; e.stopPropagation(); onSelect(obstacle.id); }}>
      {body}
      {selected && (
        <mesh position={[tx, baseHeight + 0.01, tz]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[ringRadius * 1.15, ringRadius * 1.3, 32]} />
          <meshBasicMaterial color="#2f6fed" />
        </mesh>
      )}
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
function obstacleBaseHeight(obstacle, roofs) {
  const onRoof = roofs.find((r) => isOnRoof(obstacle, r.polygon));
  return onRoof ? onRoof.buildingHeight + DECK_THICKNESS : 0;
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

export default function Scene3D({ roofs, panelSpec, obstacles, sunElevation, sunAzimuth, placingShape, onPlaceObstacle, selectedObstacleId, onSelectObstacle, selectedRoofId, onSelectRoof, showPanels = true, mapImagePlacement = null as any, mapImageWidePlacement = null as any, onCompassAngleChange }: any) {
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
    onSelectObstacle?.(null);
    // Roofs aren't click-selectable in 3D (unlike the 2D plan) - clicking
    // one still clears any selected obstacle, same as clicking empty
    // ground, but doesn't select the roof itself. A roof already selected
    // from the 2D plan still renders highlighted here (`selected` below),
    // this only disables *starting* a selection by clicking in this view.
    if (roofId) return;
    onSelectRoof?.(null);
  }

  return (
    <div
      style={{ width: '100%', height: '100%', cursor: placingShape ? 'crosshair' : 'default' }}
      onPointerDown={(e) => { pointerDownRef.current = { x: e.clientX, y: e.clientY }; }}
    >
      {/* logarithmicDepthBuffer: the ground stacks three nearly-coplanar
          planes only 1-2cm apart (the flat fallback color, WideMapGround,
          MapGround - see their own comments) under a far clip plane
          (INFINITE_GROUND_SIZE * 3) that's 24000x the near one. A standard
          depth buffer doesn't have enough precision at that ratio to keep
          those layers reliably sorted, which shows up as flickering/
          blocky z-fighting between them while orbiting. */}
      <Canvas shadows gl={{ logarithmicDepthBuffer: true }} camera={{ position: [extent * 0.7, extent * 0.6 + maxBuildingHeight, extent * 0.7], fov: 45, near: 0.1, far: INFINITE_GROUND_SIZE * 3 }}>
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
          const deckTop = roof.buildingHeight + DECK_THICKNESS;
          const selected = selectedRoofId === roof.id;
          // A Cutout obstacle (see OBSTACLE_PRESETS.cutout) punches a real
          // full-height hole through BuildingBlock + RoofDeck via their
          // `cutouts` prop - flat roofs only (see PitchedBuilding's own
          // comment above for why the pitched/sloped case is out of scope
          // for v1; Cutout still blocks panel placement and shows in the 2D
          // plan there, it just doesn't carve a real 3D shaft).
          const roofCutouts = roof.type === 'pitched'
            ? []
            : obstacles.filter((o) => o.label === 'Cutout' && isOnRoof(o, roof.polygon)).map((o) => o.polygon);
          return (
            <group key={roof.id}>
              {roof.type === 'pitched' ? (
                <>
                  <PitchedBuilding polygon={roof.polygon} buildingHeight={roof.buildingHeight} pitchDeg={roof.pitchDeg} direction={roof.slopeDirection || 'S'} selected={selected} onClick={(e) => handleClick(e, roof.id)} />
                  <BoundaryWall polygon={roof.polygon} baseHeight={roof.buildingHeight} height={roof.boundaryHeight} direction={roof.slopeDirection || 'S'} pitchDeg={roof.pitchDeg} />
                </>
              ) : (
                <>
                  <BuildingBlock polygon={roof.polygon} buildingHeight={roof.buildingHeight} cutouts={roofCutouts} selected={selected} onClick={(e) => handleClick(e, roof.id)} />
                  <RoofDeck polygon={roof.polygon} buildingHeight={roof.buildingHeight} cutouts={roofCutouts} selected={selected} onClick={(e) => handleClick(e, roof.id)} />
                  <RoofMarginBand polygon={roof.polygon} usablePolygon={roof.usablePolygon || []} buildingHeight={roof.buildingHeight} />
                  <BoundaryWall polygon={roof.polygon} baseHeight={deckTop} height={roof.boundaryHeight} />
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
                      shaded={grid.shadedIds?.has(p.id)}
                      efficiencyPct={grid.efficiencyPct?.[p.id]}
                    />
                  );
                });
              })}

              {roof.grids.flatMap((grid) =>
                (grid.structure?.racks || []).flatMap((rack) =>
                  rack.segments.map((segment, i) => (
                    <StructureSegment
                      key={`${grid.id}-${rack.y}-${i}`}
                      segment={segment}
                      y={rack.y}
                      depth={rack.depth}
                      azimuth={grid.layout.azimuth}
                      roofHeight={deckTop}
                      direction={roof.slopeDirection || 'S'}
                      grid={grid.layout}
                    />
                  ))
                )
              )}
            </group>
          );
        })}

        {obstacles.map((o) => (
          <Obstacle
            key={o.id}
            obstacle={o}
            baseHeight={obstacleBaseHeight(o, roofs)}
            selected={selectedObstacleId === o.id}
            onSelect={onSelectObstacle}
            isDragClick={isDragClick}
          />
        ))}

        <OrbitControls
          ref={orbitControlsRef}
          target={orbitTarget as any}
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
        />
      </Canvas>
    </div>
  );
}
