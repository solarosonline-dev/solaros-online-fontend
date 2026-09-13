# Agent notes for the Plant Design module

Scoped notes for `src/pages/plant-design/` — the rooftop solar design tool
(site capture, roof/panel layout, string sizing, grid→inverter/MPPT
assignment, SLD generation, 3D view). See the root `AGENTS.md` for the app
overall; its "Build status" section has the one-paragraph summary of what
changed to bring this module in and points back here for the rest.

Almost everything below was ported mechanically from a standalone
prototype (`solar-mvp`, plain JS/JSX) — logic unchanged, converted to
TS/TSX. That means essentially every gotcha documented here is still live:
this file exists so a future session doesn't have to rediscover any of
them the hard way, the way the original debugging sessions did.

## Where this lives

Not a standalone app anymore — it's `/app/plant-design` in this app,
behind `RequireEntityAdmin`. `PlantDesignEditorPage.tsx` (the only genuinely
new piece of substance here, along with `PlantDesignListPage.tsx`) loads an
existing design or starts blank, and turns `PlantDesignEditor`'s
`onSave(data, meta)` callback into a `POST` (first save) or `PATCH` (every
save after) against `src/api/plantDesign.ts` — see that file and the
backend's `ApiSpecs.md` Section 15 for the wire contract. The editor itself
knows nothing about HTTP; it just takes an optional `initialDesignData` prop
to seed its state and calls `onSave` with everything needed to reconstruct
it later (`types.ts`'s `PlantDesignData` — deliberately excludes transient
UI/interaction state like drag/hover/pan/zoom/selection, only "content").

Two build-system side effects of the port, both fixed in this module rather
than left as follow-ups — see their own comments where applied:
- `tsconfig.app.json`'s `noImplicitAny` is off **app-wide** (not just here)
  because this module's ~6000 lines of ported math/geometry/layout code
  had no type coverage in the original prototype either, and turning it
  back on would need every function parameter annotated first.
- `Scene3D.tsx` (the 3D view) is `React.lazy()`-loaded from
  `PlantDesignEditor.tsx`, not a plain import — three/@react-three/fiber/
  @react-three/drei are large enough that bundling them into the main
  chunk pushed the app over the PWA plugin's precache size limit (see
  `vite.config.ts`'s `maximumFileSizeToCacheInBytes` comment).

One real regression caught and fixed during the port, worth knowing if
something here looks unstyled: the standalone prototype's `index.css` held
two unrelated things — Vite-scaffold boilerplate (correctly dropped, since
this app's own `tokens.css`/global reset supersedes it) and a genuinely
load-bearing `[data-tooltip]` instant-hover-tooltip rule used by ~30
icon-rail buttons throughout `PlantDesignEditor.tsx`. That rule now lives in
`PlantDesignEditor.css`, scoped under `.plant-design-editor` (the editor's
root wrapper class) so it can't leak into any other page. If a future port
of something else from `solar-mvp` adds new global-looking CSS usage, check
`index.css`/`App.css` there for a similar rule before assuming a bare
className/attribute selector is dead weight — `App.css` genuinely was
(pure Vite-template hero-banner/next-steps cruft, unused by the actual
wizard), but `index.css` wasn't purely that.

## File layout

- `PlantDesignEditor.tsx` — the main component (props: `initialDesignData`,
  `onSave` — see "Where this lives" above): all UI state (`roofs` array +
  `selectedRoofId`, location, obstacles, panel spec, view mode, selection)
  and the SVG 2D plan view. Calls into `layoutEngine.ts` for all the actual
  math; has no domain logic of its own. A site has any number of roofs,
  each independently drawn/typed/configured — see "Multi-roof state" below.
- `layoutEngine.ts` — pure functions, no React: `generateLayout` (panel
  placement, called once per roof), `getInstantShading` / `computeOutput`
  (shading + energy, also per-roof — the caller sums/combines results
  across roofs), `computeCost`, `computeStructure` + the structure
  strategies (see below).
- `geometry.ts` — polygon math: convex hull, point-in-polygon, roof-polygon
  helpers, `insetPolygon`, `polygonScanlineSegments`, `shadowPolygon`,
  `polygonBounds`, and the slope-direction transform
  (`toSlopeLocal`/`toSlopeWorld`/`slopeDirectionAzimuth` — see "Pitched
  roof slope direction" below).
- `solarMath.ts` — sun position (declination, equation of time,
  elevation/azimuth).
- `Scene3D.tsx` — the 3D view (react-three-fiber), lazy-loaded (see "Where
  this lives" above). Takes a `roofs` array (each with its own
  polygon/layout/structure) and renders each independently. Renders
  whatever `layoutEngine.ts` computes; has no domain logic of its own
  beyond turning generic shapes into meshes. `PitchedBuilding` is the one
  exception with real geometry logic — it slopes a roof's deck and walls
  as one solid piece (see "Pitched roof deck" below).
- `SiteMap.tsx` / `googleMaps.ts` / `geoConvert.ts` — the embedded Google
  Map. Only `mode="location"` (pin + confirm) is wired up from
  `PlantDesignEditor.tsx` today — roof shape is drawn on the 2D plan
  itself (see below), not traced on the map. `SiteMap.tsx`'s `mode="shape"`
  path (`handleUseShape`, the draw/redraw/use-this-shape UI) is **dead
  code**, unreachable from the app; either wire it back up as an alternate
  entry point or delete it, don't leave it bit-rotting.
- `staticMap.ts` — builds Google Maps Static API URLs (no map widget
  involved, just an image). Two families: polygon-anchored
  (`buildStaticMapImage`/`buildWideStaticMapImage`, centered on a lat/lng
  path's centroid — used by `SiteMap.tsx`'s currently-dead shape mode) and
  location-anchored (`buildLocationPreviewImage`/
  `buildWideLocationPreviewImage`, centered directly on a lat/lng point,
  no polygon needed — used by `PlantDesignEditor.tsx` right after a
  location is confirmed). See "Satellite imagery" below for why there are
  tight and wide variants of each.
- `irradiance.ts` — `fetchMonthlyGHI` (monthly irradiance) and
  `fetchDesignTemperatureRange` (design min/max temperature), both against
  NASA POWER's climatology endpoint (called directly from the browser —
  see the root `AGENTS.md`/backend decision to keep this client-side
  rather than proxy it), both a single swappable async function behind a
  fixed `{lat, lon}` in / fixed shape out contract.
- `moduleCatalog.ts` / `inverterCatalog.ts` — small make/model catalogs for
  the Panel configuration / Inverter pickers (step 2), mirroring each
  other's shape (`CATALOG` array + `*CatalogMakes`/`*CatalogModels`/
  `find*` helpers, plus a `CUSTOM_*_MAKE` sentinel for manual entry). Every
  entry's electrical spec must be sourced from that manufacturer's real
  datasheet — see each file's header comment for exact sources — never
  approximated; an unverified/unsourced entry gets removed rather than kept
  around looking as trustworthy as the sourced ones (this bit us once: the
  original inverter entries were mislabeled "Sungrow" for what's actually a
  Deye product, and used that manufacturer's 220/230V-class "-LV" variant's
  specs for what should have been the 415V-class "HV" variant — caught by
  an external review, not by us).
- `stringSizing.ts` — pure functions, no React: temperature-corrected
  Voc/Vmp math and the min/max-modules-per-string / max-strings-per-MPPT
  calc (`sizeStrings`). Deliberately derives max strings/MPPT from
  `maxCurrentPerMppt / module.isc` (first-principles current limit for
  *this* module) rather than trusting an inverter's own nameplate "strings
  per MPPT" spec, which is calibrated against some reference module and
  can be less conservative than what a higher-Isc module actually allows —
  a deliberate decision, not an oversight, if the numbers ever look lower
  than a datasheet's own stated strings/MPPT.
- `gridInverterAssignment.ts` — packs a grid's panel count into
  strings/MPPTs/inverters (`assignGridToInverters`, one grid at a time) and
  packs every grid on the site into a shared inverter fleet
  (`assignSiteToInverters`, pooling small grids - see "Electrical design"
  below for the algorithm and two gotchas worth reading before touching
  it).
- `SldView.tsx` — renders `assignSiteToInverters`'s output as a single-line
  diagram (SVG schematic + string/MPPT schedule table + plant details),
  with print support (`window.print()` + a scoped `@media print` rule).
- `types.ts` — the persistence-boundary types (`PlantDesignData`,
  `PlantDesignEditorProps`) — everything else in this module stays loosely
  typed (`any`) per the mechanical-port decision; this file is the one
  place a real contract matters, since the backend and `src/api/
  plantDesign.ts` both depend on its shape.
- `PlantDesignEditor.css` — currently just the `[data-tooltip]` rule (see
  "Where this lives" above).
- `PlantDesignEditorPage.tsx` / `PlantDesignListPage.tsx`(+`.css`) — the
  two genuinely new pages; thin wrappers, no ported logic.

## Coordinate system

Engine space is meters, x = east, y = north, flat ground plane (z = 0).
Three.js is right-handed Y-up; the mapping is `toThree(x, y, h) = [x, h, -y]`
(see `Scene3D.tsx`) — north maps to -Z so it reads as "away from the viewer"
with the default camera.

## Key architectural pattern: pluggable structure strategies

`computeStructure({ roof, layout })` dispatches on `layout.structureStrategy`
(a grid's own choice — `roof.structureStrategy` is only a fallback) to one
of `STRUCTURE_STRATEGIES` (`truss`, `groundMount`, `steppedTruss`). Every
strategy returns the same generic shape so Scene3D never needs
strategy-specific rendering code:

```
{
  racks: [{ y, depth, segments: [{ xStart, xEnd, midX, members }] }],
  panelHeights: Map<panelId, { frontHeight, backHeight }>,
  totals: { [kind]: { length, count } },
}
```

`members` is a flat list of `{ kind, from: [x,y,z], to: [x,y,z], thickness }`
— `from`/`to` are LOCAL coordinates relative to the segment's own group
origin. Scene3D's `StructureMember` renders any `kind` generically (styled
via `MEMBER_STYLE`), so **adding a new strategy never requires touching
Scene3D.tsx** — only add a new `compute...Structure` function in
`layoutEngine.ts` and register it in `STRUCTURE_STRATEGIES`.

A rack's own `y`/`segments[].xStart/xEnd/midX` are in the roof's **local**
slope-direction space (see "Pitched roof slope direction" below), not
world coordinates — `StructureSegment` in `Scene3D.tsx` rotates a rack's
anchor position (`toSlopeWorld`) into the world before positioning it, so
its members (already relative to that anchor) end up in the right place
regardless of which way the roof faces.

Shared helpers reused by every strategy: `iterateRacks` (groups panels into
racks + x-segments, using each panel's own `rackX`/`rackY` — see below —
not its world `x`/`y`), `computePanelHeights` (where a panel rests —
identical regardless of what holds it up), `buildPurlinMembers` (the two
per-panel support purlins, unchanged across strategies, taking the
caller's own `heightAtY` function rather than rebuilding it).

### `steppedTruss` — a deliberately separate algorithm, not a variant

`truss`/`groundMount` both assume every row in a rack shares one identical
width (`generateLayout`'s default packing guarantees this via
`intersectSegmentLists` — see "Layout generation flow" below). On a
tapering or rotated footprint that wastes space down to the narrowest row.
`steppedTruss` ("Truss (stepped)" in the UI) fixes that, but on purpose as
a **separate, opt-in strategy** rather than a change to `truss` itself —
picking any other strategy leaves packing and structure byte-for-byte
unchanged, so this doesn't complicate the common case.

Two things change together, only when `steppedTruss` is picked:

- **Packing** (`generateLayout`'s `stepped` branch): each row packs to its
  own available width instead of the shared intersection. Rows still share
  one column grid (anchored at whichever row's own segment starts furthest
  left) so columns line up across rows — a column just may only be present
  in some of them.
- **Structure** (`computeSteppedTrussStructure` + its own
  `iterateSteppedRackBays` generator — deliberately *not* a reuse of
  `iterateRacks`, which still assumes one width per rack): groups panels
  into "bays" — a maximal run of physically adjacent columns that all
  share the exact same front/back depth. A column only present in some of
  a cluster's rows (the tapering end) lands in its own, shorter bay
  instead of borrowing a longer bay's full-depth chord. Every genuine
  depth change gets its own bay (no smoothing/snapping of small steps).
  Each bay becomes its own `racks[]` entry (one segment each) rather than
  being grouped back under one shared cluster-level rack — `Scene3D`'s
  `StructureSegment` positions every rack purely from that rack's own
  `y`/`depth`, so this needs no Scene3D changes to render correctly.
  `pitchedRoofFrontY`/`pitchedRoofRidgeY` are reused unmodified from the
  plain strategies — they only look at rows (`rackY`), never columns, so
  they're already correct for this strategy's grids too. Panel heights are
  **not** shared this way, though - see the gotcha right below.

**Known gotcha (bit us once - reported as "some panels are in the air",
worse the deeper `panelsPerRow` went):** on a *flat* roof, `heightAtY`
resets to `minPillarHeight` at whatever `rackTop` it's given, then climbs
linearly from there - so `rackTop` isn't just a bookkeeping label, it's
the height calc's own zero point. `computePanelHeights` (used by `truss`/
`groundMount`) always takes it from `iterateRacks`, which is one shared
value for an *entire* `panelsPerRow`-deep rack. That's correct for those
two strategies, whose structure also uses that same single `rackTop` for
the whole rack - but `steppedTruss`'s own structure resets to
`minPillarHeight` at *each bay's own* `rackTop` instead (see above - a
tapering column's bay can start several rows later than the rack's true
front). Reusing plain `computePanelHeights` for `steppedTruss` (as this
code briefly did) heights every panel against the *whole rack's* `rackTop`
regardless of which bay it's actually in - so a panel in a
later-starting bay gets heighted as if it were still climbing from the
rack's true front, landing it visibly above where that bay's own
(correctly, minPillarHeight-based) legs actually reach. `steppedTruss` now
has its own `computeSteppedPanelHeights`, sharing the height-formula
plumbing with `computePanelHeights` via `heightsForPanelGroups` but
grouping panels by `iterateSteppedRackBays`' own bays (each yielding its
own `panels` list, matched by exact `rackX` membership - not an x-range
test, since two bays can sit flush against each other with no gap at all
when they differ only by depth) rather than `iterateRacks`' whole-rack
groups. Pitched roofs were never affected - `pitchedHeightAtY` climbs from
the roof's own absolute Y origin, not a per-rack `rackTop`, so it doesn't
care which grouping a panel came from. Any *new* per-strategy structure
calc that resets height at a finer granularity than "one rack" needs its
own panel-heights pass the same way, rather than assuming
`computePanelHeights` is strategy-agnostic just because its inputs look
that way.

**Known gotcha (bit us once):** `StructureMember`'s length/rotation math
assumes every member runs *either* purely along local X (purlins) *or*
purely within the local Y-Z plane (chords/braces/pillars) — never a mix. A
purlin's length was computed from only its Y/Z displacement early on, which
silently produced zero-length (invisible) geometry since purlins vary
purely in X. If a future strategy needs a member with both an X and a Y/Z
component, `StructureMember` needs a real 3D alignment (e.g.
quaternion-from-direction), not the current two-case branch.

## Layout generation flow

Every step below runs **once per grid** (`PlantDesignEditor.tsx` loops
over `roofs.flatMap(r => r.grids)`); nothing in `layoutEngine.ts` itself
knows there's more than one roof, or more than one grid per roof, on the
site.

1. `generateLayout({ roof, footprintPolygon, gridSettings, panelSpec,
   obstacles, location })` fills `footprintPolygon` (the roof's own
   polygon for a whole-roof grid, or a hand-drawn one for a grid placed via
   the polygon tool — see "Panel grids & selection" below) with panels,
   cluster by cluster (`panelsPerRow` panels stacked front-to-back per
   rack, sharing one structure) — see the scanline-fill comments in
   `layoutEngine.ts`. Packing happens in the roof's own local
   slope-direction space (see below); each panel ends up with both a
   world `x`/`y` (for rendering/shading) and a local `rackX`/`rackY` (for
   `computeStructure`'s row grouping). A flat roof's row-to-row pitch is
   either `gridSettings.rowSpacing` directly (a user override, clamped to
   never go below the panel's own footprint depth so rows can't overlap)
   or, when that's `null` (the default), the "no inter-row shading
   9am-3pm on the winter solstice" calc — that calc can land close to its
   own `Ls * 3.5` cap at higher latitudes.
2. `computeStructure` builds the mounting structure for whatever grid
   came out of step 1.
3. `getInstantShading` / `computeOutput` compute shading/output against the
   same panel list, independent of the structure. Both take the *entire*
   `roofs` array (not just the one being shaded) so an obstacle's
   shadow-casting height can be resolved relative to whichever roof it's
   actually resting on, not just the target roof.

**Known gotcha (bit us three times over — dropped rows, then overhang,
then a staircase silhouette — same root cause each time: a hand-drawn
roof's corners are never perfectly square):**

`generateLayout`'s row-packing needs a candidate row's *entire* depth to
fit the polygon, not just its center line — so `scanlineSegmentsForDepth`
intersects the scanlines at the row's own front *and* back edges. Sampling
those edges *exactly* at a row's own Y is itself a trap: the very first/
last row's front/back edge lands exactly on the polygon's own extreme Y,
and if that extreme point is a single non-axis-aligned vertex (true of
almost any hand-drawn corner) rather than a flat edge, the scanline there
touches the polygon at a single point — a genuinely zero-width segment,
not a floating-point artifact. That used to either drop the whole row
(when the fallback was "give up, skip it") or let a panel's corner
overhang the edge (when the fallback was "trust the unclipped center
line instead"). The fix is two-layered: `SCANLINE_EDGE_EPS` nudges the
front/back samples a hair inside the polygon instead of exactly on its
boundary (fixes the common corner-vertex case outright); when a genuine
gap remains after that (a real concave notch, not just a corner), the
fallback clips the center scanline to whichever of front/back *is*
non-empty rather than trusting center unclipped, so at least one edge
check still applies. Don't remove either layer without re-testing on a
hand-drawn (not perfectly rectangular) roof — an axis-aligned test
rectangle can't expose any of this.

Separately, when `panelsPerRow > 1`, every row in one cluster shares a
single physical rack (`computeStructure` already assumes this — see
"Key architectural pattern" above, it uses only the first sub-row's
extent for the whole rack's structure) but used to pack each row's own
width independently — fine on a rectangular roof where every row is the
same width anyway, but on a tapering roof (triangular, diamond, or just
an angled corner) it produced a staircase/pyramid silhouette per cluster,
since each row got whatever width its own Y happened to allow.
`intersectSegmentLists` now intersects every row's own segments down to
one shared set *before* packing, so a whole cluster is exactly as wide as
its narrowest row — matching what a real rack can actually be built as.

**Known gotcha (bit us once — reported as "nothing gets drawn" / "leftover
space stays empty"):** the depth-wise cluster loop used to require a
cluster's *entire* `panelsPerRow`-deep footprint to fit before packing it
at all (`while (clusterTop + clusterDepth <= maxY)`) — so a footprint too
shallow for even one full cluster packed zero panels outright, and any
depth left over after the last full cluster (not enough for another whole
one, but enough for a shorter one) was simply never packed. Each iteration
now recomputes `maxRowsThatFit` from the depth actually remaining and caps
it at `panelsPerRow`, so every cluster after the first can come out
shorter than `panelsPerRow` — this is more consequential than it sounds
for grids specifically: `suggestMaxPanelsPerRow`'s own estimate is only
ever a suggestion the user can push higher afterward (see "Panel grids &
selection" below), and both of the failure modes above were most visible
exactly there. `iterateRacks` (used by `computeStructure`) needed no
change to handle this — it slices `sortedYs` into `panelsPerRow`-sized
chunks by index, and `Array.prototype.slice` already returns however many
elements are actually left for a trailing chunk that runs short.

That fix alone wasn't enough for a **non-rectangular footprint** (most
visibly a rotated polygon drawn via the "+ Place grid" tool - see "Panel
grids & selection" below): `maxRowsThatFit` only checks that the *depth*
fits, but a cluster's rows all still have to share one common X-range
(`intersectSegmentLists`), and a rotated shape's valid X-range shifts
enough between rows that spreading them across `panelsPerRow` can leave
zero shared width even though each row individually has room - reported
as a grid's panel count shrinking as `panelsPerRow` went up, then
dropping straight to zero. The inner loop now retries with one fewer row
whenever `clusterSegments` comes back empty (down to a single row, which
can still legitimately come up empty at a Y with no room at all), instead
of accepting an empty intersection for the whole requested `panelsPerRow`
outright.

## Multi-roof state

`roofs` (array) + `selectedRoofId` replace what used to be a single `roof`
object. Each roof carries its own `id`, `polygon`, `type`
(`'flat'`/`'pitched'`), `pitchDeg`, `slopeDirection`, `buildingHeight`,
`boundaryHeight` (parapet wall height, `0` = none — see "Boundary walls"
below), `minPillarHeight`, `structureStrategy` (fallback default for a
*new* grid — see "Panel grids & selection" above; a grid's own copy is
what's actually used once it exists), `grids` (array — see "Panel grids &
selection"), and optionally `label` (set by mirroring — see below; falls
back to `Roof N` by position when absent, via `roofLabel()`).
`panelTiltDeg`/`rowSpacing` used to live here too; they're per-grid now.
Per-grid derived state (`structuresByGrid`, `instantByGrid`,
`efficiencyByGrid`) is keyed by `` `${roofId}:${gridId}` `` (`gridKey`),
rebuilt via `roofs.flatMap(r => r.grids...)` rather than computed once.
`selectRoof`/`selectObstacle` are the only entry points that should change
`selectedRoofId`/`selectedObstacleId` — they clear each other (and now
`selectedGridKeys` too — see "Panel grids & selection" above), so roof/
obstacle/grid selection stay mutually exclusive; don't call
`setSelectedRoofId`/`setSelectedObstacleId` directly from a new
click-handler without going through them.

Obstacles and location/site imagery (`siteImages`) stay **site-level**,
shared across every roof — only roof-specific config lives per-roof.
Obstacles drawn freehand (`drawable: true` in `OBSTACLE_PRESETS` —
Elevation, Skylight, Walkway) also get `boundaryHeight`; a polygon
obstacle's own `height` on top of that is what a skylight/walkway makes
almost zero (flush, no shadow) versus Elevation's real raised volume.

**Known gotcha (bit us once — reported as "the grid disappears" the
moment **Min pillar height** was touched):** `updateRoof` (the setter
behind every roof-setup slider/button, including **Min pillar height**,
which is exposed in the *grid's* own popup even though it's a roof-level
field) used to clear `grids: []` unconditionally on *any* field change,
reasoning that a whole-roof grid's packing is derived from the roof and
would otherwise go stale. True for `width`/`length`/`type`/`pitchDeg`/
`slopeDirection`/`edgeMargin` — `generateLayout` reads every one of those
(see "Layout generation flow" above) — but `buildingHeight`,
`boundaryHeight`, and `minPillarHeight` are never read by `generateLayout`
at all; they're read fresh off the roof at render time by
`Scene3D`/`computeStructure` (`heightsForPanelGroups`,
`computeSteppedTrussStructure`, etc. all take `roof` live, every call),
never baked into a grid. Clearing grids for those three wiped out every
grid on the roof for no reason. `updateRoof` now only clears grids when
`field` is one of the packing-affecting ones
(`ROOF_FIELDS_NEEDING_REPACK`) — any *new* roof-level field needs a
judgment call added to that set (or left out of it) based on whether
`generateLayout` itself would actually read it, not just "is this a roof
setting."

### Mirroring a roof

`mirrorRoof(id, edgeIndex)` reflects a roof's polygon across one of its own
edges (`reflectPointAcrossLine` in `geometry.ts`) and inserts the result as
a brand new roof right after the original — a **one-time copy**, not a
live link; editing one half afterward doesn't touch the other. Both halves
get a `label` derived from the pair's shared base name
(`<base>-left`/`<base>-right`). The mirrored roof's own `grids` are
*regenerated*, not just copied wholesale — each source grid's own
`panelTiltDeg`/`rowSpacing`/`structureStrategy`/`panelsPerRow` are carried
over as `gridSettings` into a fresh `generateLayout` call against the
mirrored (reflected) footprint, since a straight point-for-point panel
reflection wouldn't repack correctly against the new polygon. Mirror mode
itself (`mirrorRoofId`/`hoveredMirrorEdge`) is a separate interaction
layered on the same 2D plan — see "2D plan interaction model" below.

### Boundary walls

A roof or drawable obstacle's `boundaryHeight` renders as a thin hollow
ring (`boundaryRingGeometry` in `Scene3D.tsx`: the polygon extruded, with
a second path inset by `BOUNDARY_WALL_THICKNESS` cut out as a hole) sitting
right on the polygon's own edge — `0` means the component returns `null`,
no wall at all. On a **pitched** roof, every vertex of that ring (both
top and bottom rim alike) gets the same `tan(pitch) * localY` climb
`polygonToSlopedBuildingGeometry` already uses for the roof deck itself
(see "Pitched roof deck" below) — so the wall's base rides the sloped
surface from eave to ridge instead of cutting through it partway up.
**Known gotcha (bit us once):** don't apply that climb to only the top
rim like the deck geometry does — a wall needs *both* rims climbing
together to stay a constant height above the surface; climbing only one
rim would make the wall taper to nothing at one end.

## Pitched roof slope direction

A pitched roof can face N/E/S/W (`roof.slopeDirection`, default `'S'`).
Every calculation in `layoutEngine.ts` (panel packing, height climb, rack
grouping) is written assuming a fixed "south-facing" local space — eave at
low local-Y, ridge at high local-Y, rows scanning along local-Y. Rather
than rewrite that per direction, `geometry.ts` exports
`toSlopeLocal(point, direction)` / `toSlopeWorld(point, direction)` — four
**pure rotations** (0°/90°/180°/270°, deliberately never a mirror
reflection, so they compose cleanly with the plain Y-axis rotations
Scene3D already uses for a panel's own facing) mapping between that local
space and the real world. `slopeDirectionAzimuth(direction)` gives the
matching compass azimuth (`S`→180, `N`→0, `E`→90, `W`→270) for the solar
math, which already handles arbitrary azimuths natively.

`generateLayout` transforms the roof polygon (and obstacles, for the
blocking check) into local space, packs panels exactly as it always did,
then transforms each panel's final position back to world — see `x`/`y`
vs `rackX`/`rackY` on each panel object. Flat roofs always use `'S'`
(identity transform), so this costs them nothing.

**Scope note:** only the four cardinal directions are supported, not an
arbitrary angle — a documented simplification, not an oversight: the
panel-packing grid itself doesn't rotate continuously, and N/E/S/W work by
literally repacking in a rotated local space, which only cleanly
generalizes to 90° multiples.

## Pitched roof deck

For a flat roof, `BuildingBlock` (flat-topped walls) and `RoofDeck` (thin
flat cap) are two separate meshes. For a pitched roof, `Scene3D.tsx`
renders one solid piece instead — `PitchedBuilding` — because a flat-topped
building plus a separately-sloped cap on top leaves a visible gap
wherever the roof climbs above the flat wall top. `polygonToSlopedBuildingGeometry`
extrudes the polygon from the ground up to the eave height, then climbs
only the *top rim*'s Z by `tan(pitch)` based on each vertex's own local-Y
(via `toSlopeLocal`) — so the walls' own top edge follows the roofline
around the whole perimeter. The gable ends are left vertical (a
documented simplification, not a true gable).

Panel/structure heights (`computePanelHeights`, `pitchedHeightAtY`) are
computed independently of this deck geometry but use the same `pitchDeg`
+ `panelTiltDeg` + local-Y math, so they land flush on it when
`panelTiltDeg === pitchDeg`. When they differ, `pitchedHeightAtY` anchors
the rack's standoff at whichever end (eave or ridge) is the *tighter*
constraint — see its doc comment — so the rack never gets buried in the
deck when the panel tilt is shallower than the roof's own pitch.

## 3D view camera controls

`OrbitControls`' `target` prop **must** be memoized
(`useMemo(() => [0, maxBuildingHeight + 1, 0], [maxBuildingHeight])`), not
an inline array literal. **Known gotcha (bit us twice — once fixed, then
an unrelated revert dropped the fix, then re-fixed):** react-three-fiber
applies a `target` prop change by calling the underlying `THREE.Vector3`'s
own `.set(...)`, on *any* render where the array's identity differs from
last time — an inline literal is a new identity on *every* render
(hovering a panel, moving the sun-time slider, anything), which snaps the
camera's pivot back to center and silently undoes any in-progress pan.

Mouse button mapping (`mouseButtons` prop) is left=rotate, right=pan,
matching every other 3D viewer (SketchUp, Google Earth) — a left=pan/
right=rotate scheme was tried first (to fix the zoomed-in-can't-reach-a-
side-building problem `orbitTarget` above also existed for) and reverted:
it meant the natural first drag gesture never orbited the camera at all,
reported as "can't rotate 360°" even though rotation itself was never
actually limited (OrbitControls' azimuth angle is unbounded by default).
Shift+left-drag is a second way to pan without switching to the right
button — implemented via a `ref={orbitControlsRef}` on `OrbitControls`
and a `keydown`/`keyup` listener that mutates
`orbitControlsRef.current.mouseButtons.LEFT` live, since `mouseButtons`
itself has no prop for "what does left do *right now*", only an initial
config.

## Step-based workflow / canvas state

The whole module is a strict-but-revisitable 7-step wizard (`STEPS`,
`currentStep` + `maxUnlockedStep`): Project & Location → Configuration →
Roof setup → Panel/Grid setup → Output estimate → Cost estimate →
Electrical Design (SLD). `goToStep`/`advanceToStep` are the only two
places that change `currentStep` — `advanceToStep` also raises
`maxUnlockedStep`; a step's own tab in the step bar is clickable once
`step <= maxUnlockedStep`, and going back never re-locks anything
(redrawing the roof from step 3 after already reaching step 4 doesn't
kick the user back — step 4 just shows fewer/no grids again until
re-filled, same idea `ROOF_FIELDS_NEEDING_REPACK` already uses
elsewhere). Both also call `clearSelectionForStep(step)`, which drops the
roof/obstacle selection when leaving step 3 and the grid selection when
leaving step 4 — a selection carried into a step that can't display or
act on it (its own edit handles, its right rail — see below) just gets
stuck there otherwise. `currentStep`/`maxUnlockedStep` are both part of
the persisted `PlantDesignData` (see "Where this lives" above) — a reload
lands back on the same step, not step 1.

- **Steps 1–2** (Project & Location, Configuration) are a left-half form.
  Both still use `CollapsibleSection` with a controlled `open`/`onToggle`
  (`locationOpen`). Roof setup isn't a collapsible sidebar section, it's
  its own full-bleed canvas step (3). Choosing "Set location on map…"
  (`mapMode === 'location'`) fills the *right* half with an embedded
  `<SiteMap mode="location">`; before a location's ever been confirmed the
  right half shows nothing at all.
- **Location no longer auto-advances.** `handleLocationConfirm` doesn't
  call `advanceToStep`/`startRoofDraw` itself — it only fetches both
  satellite previews plus this site's irradiance/design-temperature data,
  clears `roofs`/`cost` state, and flips `locationConfirmed`, leaving
  `currentStep` untouched. Step 1's own "Next: Configuration" button calls
  `handleLocationConfirm` itself (using whatever's currently in the
  `location` state) *and* `advanceToStep(2)` together — so confirming and
  continuing collapse into one click without a separate "Confirm
  location" button being needed on the map. Since Next re-invokes
  `handleLocationConfirm` every time (including when just re-visiting step
  1 without changing anything), that function opens with an early-return
  guard: if `locationConfirmed` is already true and the lat/lon haven't
  changed, it skips the wipe-and-refetch entirely rather than punishing a
  user for looking at step 1 again. Roof-drawing itself starts from step
  2's own "Next: Roof setup" button (`advanceToStep(3)` +
  `startRoofDraw()`), not from location confirm.
- `SiteMap.tsx`'s `mode="location"` picker has no confirm button of its
  own either, for the same reason: the fixed center pin's coordinates
  sync live to the parent (`onLocationChange` prop → the sidebar's
  lat/lon fields) on every way the pin can move — `dragend`, the address
  autocomplete's `place_changed`, or the plain search box — via a
  `syncCenterToParent` closure kept current through a ref
  (`onLocationChangeRef`) so the map-creation effect can stay mount-once
  despite the parent passing a new inline callback every render. The
  picker's own button is just **Done** (closes the map), since there's
  nothing left to explicitly confirm.
- **Steps 3–6** are full-bleed canvas (2D plan / 3D view) with two
  floating icon rails, both using `data-tooltip`+`aria-label` (see
  `PlantDesignEditor.css`'s instant-hover tooltip rule — a plain `title`
  delays ~1s, which reads as slow for a symbol-only button) rather than
  sidebar buttons:
  - **Left rail** (top-left, stacked directly under the 2D/3D + Undo/
    Redo + Shadow analysis/Efficiency view toolbar in one shared
    `position:absolute` wrapper so there's never a gap between them
    regardless of the toolbar's own wrapped height) — *new*-object
    actions only, step/selection-gated: step 3 has Draw roof + "+ Add
    obstacle" (a small popover listing `OBSTACLE_PRESETS`, then arms
    `placingShape`); step 4 has Fill full roof / "+ Place grid".
  - **Right rail** (top-right, mirrors the left one) — a selected roof's/
    grid's/obstacle's own properties, replacing what used to be one
    shared floating bottom-right popup (`footerOpen`, removed entirely —
    see "Panel grids & selection" below for where those controls live
    now). One icon per related *cluster* of fields, not one per field;
    each opens a popover to its own left (`right: 48`, since this rail
    sits on the right edge) via the shared `RailPopover` component, which
    measures its own position after render and nudges itself up if it
    would run off the bottom of the screen — a tall popover triggered
    from a low icon (e.g. a grid's own "Rack settings") would otherwise
    be unreachable. `rightPanelOpenGroup` (which group's popover is open)
    resets to `null` whenever the selection changes, in the same effect
    that already clears `addSideMode`/`gridDeleteMode`. This rail is
    always rendered in the 2D plan (it also hosts a static north-is-up
    compass, since the plan never rotates — see `toScreen`), growing
    selection-specific icons underneath the compass only once something's
    actually selected.
- **Step 7** (Electrical Design / SLD) is neither the left-half form nor
  the canvas — it's a third top-level branch in the same flex row (guard
  it explicitly with `currentStep !== 7` wherever the canvas block's own
  condition would otherwise also match, e.g. `locationConfirmed &&
  currentStep !== 7`), rendering `<SldView>` at full width with no icon
  rails, no plan/3D toggle, nothing shared with steps 3–6 at all.

**Known gotcha (bit us once — reported as "selecting a roof also fires
in Panel/Grid setup"):** the roof polygon's own `onClick` only calls
`selectRoof` when `currentStep === 3` — past that, the click deliberately
*doesn't* `stopPropagation()`, so it falls through to `onSvgClick`'s own
empty-space handling (deselect whatever's currently selected) instead.
Selecting a roof only ever has anywhere to show itself (edit handles, the
right rail) in step 3; letting a stray click in step 4+ still select it
just silently cleared whatever grid was actually selected.

## Electrical design

`sitePlan` (`PlantDesignEditor.tsx`, a `useMemo`) is the hinge: it
flattens every roof's every non-empty grid into `{key, label, panelCount,
centroid}` (centroid = the average of `grid.footprintPolygon`'s points,
already in the same site-wide plan coordinates as everything else — no
conversion needed) and calls `assignSiteToInverters`
(`gridInverterAssignment.ts`). Its result feeds both the Step 4
layout-summary box (per-grid: which inverter(s), tagged `(shared)` when
pooled) and `SldView.tsx` (step 7).

**`sizeStrings` (`stringSizing.ts`)** is the temperature-corrected core
every other calc in this phase builds on: `tempCorrectedVoltage` applies a
module's Voc temp coefficient at the site's design min temp (cold → Voc
rises) and Vmp at design max temp (hot → Vmp drops), then bounds
modules/string against the inverter's max DC voltage / MPPT window, and
strings/MPPT against `maxCurrentPerMppt / module.isc` — see the
`DEFAULT_MAX_POOLING_DISTANCE_M`-adjacent comment in
`gridInverterAssignment.ts` and the module's own header comment for why
that last one is deliberately more conservative than an inverter's
nameplate "strings per MPPT" spec, not a bug if it disagrees with one.

**`assignGridToInverters`** sizes one grid alone: `numInverters =
max(numInvertersByPower, numInvertersByCapacity)` — the DC:AC ratio target
(`targetDcAcRatio`, step 2's own slider) sets a floor that MPPT capacity
alone might not reach, and vice versa — then splits the grid's panels
evenly across that many inverters and strings each inverter's share via
`splitIntoStrings` (balanced, differs by at most one module) +
`distributeAcrossMppts` (below).

**`assignSiteToInverters`** is the site-wide layer on top: a grid whose
own sizing needs more than one inverter (by capacity or by the DC:AC
ratio) always gets dedicated inverter(s) via the function above — never
pooled. A grid that fits within a *single* inverter's spare capacity is a
pooling candidate; these are merged via **capacity-constrained
agglomerative clustering** — repeatedly merge whichever two groups are
physically closest, as long as the merge both fits one inverter's MPPT
channel count and stays within `maxPoolingDistanceM` (25m default) — until
no valid merge remains.

**Known gotcha (bit us once — reported by a physical-proximity
requirement review, not by a code read):** the first pooling
implementation measured "distance between two groups" as the *closest*
pair of member centroids (single-linkage). That let a chain of
moderately-spaced grids smuggle two genuinely distant ones onto the same
inverter — grid C 19m from B, B 6m from A, so A merges with {B, C} even
though A itself is 25m+ from C, because the *nearest* pair (B–C) was
within the cap even though the *farthest* pair (A–C) wasn't. `distance()`
also originally returned `Infinity` for a missing centroid (meant to
signal "definitely too far to merge"), which combined with single-linkage
to silently disable pooling entirely whenever centroid data wasn't
supplied — the opposite of the intended "no preference" fallback. Fixed
both: `clusterDistance` is now **complete-linkage** (the *farthest* pair
between two groups), which requires every member of a merged cluster to
be within the cap of every other member, not just its nearest neighbor;
and a missing centroid now reads as distance `0` ("no preference,
compatible with anything") rather than `Infinity`. Ties at equal distance
(including the "no centroid data" case, where every pairwise distance is
0) break toward the smaller combined group — this is what keeps five
equal-sized small grids needing two inverters landing 3-and-2 instead of
one inverter maxed out and the other nearly idle; without that tie-break,
plain nearest-first merging tends to fill one group to capacity before
ever touching the next. Any future change to the merge-selection
comparator needs to re-verify both properties (a distance cap that
actually vetoes far merges, and balanced ties) with the node-script tests
used to catch these the first time — a quick `assignSiteToInverters` call
with synthetic grids at known coordinates, checked by hand.

**`distributeAcrossMppts` (`gridInverterAssignment.ts`)** spreads a
grid's own string lengths across MPPT channels. **Known gotcha (bit us
once — caught by an external review of the actual SLD numbers, not by
us):** the original version distributed strings by round-robin index
order (`strings[i % mpptCount]`), which could pair a 13-module string with
a 12-module one on the same physical MPPT input purely because of where
they landed in the array — real mismatch-loss territory, since two
different-voltage strings paralleled on one MPPT input can't be tracked
independently. Fixed by sorting descending and slicing contiguous runs
(so a multi-string channel always gets matched-or-closest lengths)
**and** spreading across every available channel rather than the bare
minimum needed to fit (an unused MPPT costs nothing, and every extra
channel used is one more string that ends up alone instead of paired with
a mismatch). Returns one array per channel *actually used* (never a
trailing empty channel) — `SldView.tsx` reads `entry.channels` directly
as the real per-channel string-length groups now; it used to
re-*reconstruct* this from `entry.strings` assuming the old round-robin
order, which is exactly the kind of display-can-silently-disagree-with-
the-real-assignment risk that direct storage avoids.

**Catalog verification (`moduleCatalog.ts` / `inverterCatalog.ts`):**
every entry must be checked against that manufacturer's real datasheet
before being added — see each file's header comment for sources. This
bit us once already (see the file-layout note above): entries approximated
rather than sourced looked identical to verified ones with no way to tell
them apart, until an external review caught a mislabeled brand and a
wrong grid-voltage-class variant. If a catalog entry can't be verified,
remove it rather than leave it in looking as trustworthy as a sourced one
— `Custom` exists precisely so an unverified/unlisted part doesn't need a
guessed catalog entry at all.

## Satellite imagery

Two independent captures are fetched once, right when a location is
confirmed (`handleLocationConfirm`) — not re-fetched as a roof is drawn or
resized, because swapping the backdrop mid-edit was tried and felt like
the view was jumping/breaking. They're stored in `siteImages` (site-level
state, not per-roof — every roof on the site shares the same backdrop):

- `siteImages.locationImage` — tight span (~120m,
  `LOCATION_PREVIEW_SPAN_METERS` in `staticMap.ts`), used as the 2D plan's
  backdrop. Needs to stay sharp under the plan's own zoom (up to 6x), so
  it trades coverage for resolution.
- `siteImages.locationImageWide` — wide span (~500m, `WIDE_SPAN_METERS`),
  used as Scene3D's "infinite" ground texture (`WideMapGround` in
  `Scene3D.tsx`). Trades resolution for coverage, since the 3D camera's
  orbit distance is bounded (see `Scene3D.tsx`'s `minOrbitDistance`/
  `maxOrbitDistance`) but still needs *some* real ground well past the
  building on every side.

Both images are Maps Static API requests against the same fixed ~1280x1280
pixel budget (`size=640x640&scale=2`) — the only lever is `zoom`
(`buildImageForSpan` in `staticMap.ts` derives it from the desired
real-world span). That single fixed budget is *why* one shared image can't
serve both views well: cover 500m and the roof is a blurry smear; stay
sharp on the roof and the 3D ground has a visible edge a short orbit away.
Don't try to collapse these back into one capture without re-litigating
that trade-off.

`computeLocationImagePlacement` (in `PlantDesignEditor.tsx`) turns
either image into a `{ cx, cy, widthMeters, heightMeters, url }` placement
centered on `location` itself (the local-meters origin) — passed to both
views as `backdropPlacement`/`backdropWidePlacement`.

## 2D plan interaction model

`PlantDesignEditor.tsx`'s plan `<svg>` has several independent, composable
interactions layered on the same `toScreen`/`clientToWorld` transform pair:

- **Zoom** (`planZoom`, scroll wheel or the −/100%/+ buttons) — a
  multiplier folded into `scale`.
- **Pan** (`panOffset`, click-drag on empty canvas) — a screen-space
  `{x, y}` offset folded into `toScreen`'s `center + panOffset.x/y`. Only
  starts when not drawing/placing/dragging a vertex or edge (see
  `onSvgMouseDown`'s guard); a drag that moves more than a few px sets
  `panStartRef.current.moved`, which `onSvgClick` checks to swallow the
  click that naturally follows mouseup — otherwise panning would also
  deselect/place/draw at the drop point.
- **Vertex drag-to-resize** (`draggingVertexIndex`) — corner handles
  rendered on the *selected* roof's own `polygon`; each has an invisible,
  larger hit-area (`r=14`) around the small visible dot for an easier grab
  target, turns solid blue on hover/drag (the only cue distinguishing "grab
  this point" from "pan the map underneath", since both use similar
  cursors), and has its own `onMouseDown` with `stopPropagation()` so
  grabbing it can't also start a pan.
- **Edge drag-to-slide** (`draggingEdgeIndex` + `edgeDragStartRef`) — each
  side of the selected roof's polygon is its own wide, mostly-transparent
  hit line (`strokeWidth=14`, `strokeOpacity≈0`); dragging one moves *both*
  its endpoints by the same delta, sliding that whole side without
  touching the rest of the shape. Drawn *underneath* the vertex handles in
  paint order so a corner still wins the hit-test in the overlap right at
  each end.
- **Roof/obstacle/grid freehand tracing** (`roofDrawPoints` /
  `obstacleDrawPoints` / `gridDrawPoints`) — click to add points, click
  back on the first point (within 12px screen-space) or double-click to
  close. Closing via the "click back on the first point" path sets
  `suppressNextClickRef` before finishing: a real double-click landing
  exactly on that point fires two click events, and without the
  suppression the second one lands on `onSvgClick` a moment later and
  immediately deselects the shape the first click just created and
  selected. The grid-placement tool (`placingGrid`) additionally sets
  `pointerEvents: 'none'` on every panel `<rect>` while active, so a click
  meant to add a draw point over existing panels doesn't instead land on
  `startGridDrag` and select/move that grid.
- **Mirror mode** (`mirrorRoofId`/`hoveredMirrorEdge`) — while set, every
  edge of that one roof's polygon becomes its own pickable hit-line
  (same "visible sliver + wide invisible hit-area" pattern as edge
  drag-to-slide above), turning orange on hover; a click calls
  `mirrorRoof` (see "Multi-roof state" above) instead of starting a drag.
- **Grid marquee-select / move / rotate** — see "Panel grids & selection"
  below; layered on the same `<svg>` but with enough of its own state
  (drag thresholds, click-fallback, a rotate handle) that it gets its own
  section rather than a bullet here.

`clientToWorld` is the one place that inverts screen→world, accounting for
the SVG's letterboxing (`viewBox="0 0 560 560"` on a non-square container),
`scale`, and `panOffset` together — if you add a new pointer interaction to
the plan view, route its coordinate math through this function rather than
re-deriving the transform.

**Known gotcha (bit us once):** a drag that actually moves the pointer
still ends with the browser firing a normal `click` event right after
mouseup, targeting whatever's now under the cursor — almost always the
roof polygon it was dragged across, or the svg's own empty background.
Both of those have their own `onClick` (select the roof / deselect
everything), which fires *after* the drag's own mouseup handler already
set state — silently overwriting whatever the drag just did (a marquee
selection, a panel move) the instant it finishes. `panStartRef.current
.moved` already guarded pan against this; the same shape
(`swallowClickAfterDragRef`, set when a marquee/move/rotate drag ends with
real movement, checked-and-cleared by every `onClick` that could stomp on
it: the svg's own, the roof polygon's, an obstacle's) fixes it for panel
editing too. Any *new* drag-driven state change on this `<svg>` needs the
same guard if a roof polygon or the background could plausibly end up
under the pointer when it releases.

## Panel grids & selection

Panels are grouped into **grids** (`roof.grids`, an array): each grid is
one output of `generateLayout` plus a few editable-in-place fields
(`panelTiltDeg`, `rowSpacing`, `structureStrategy`, `panelsPerRow`,
`footprintPolygon`, `rotation`, `source: 'wholeRoof' | 'drawn'`, `id`). The
**Fill full roof** button (Panel/Grid setup's own left icon rail,
`handleGenerate`) (re)builds each roof's own `source: 'wholeRoof'` grid in
place (`regenerateAllGrids`) using `getRoofPolygon(roof)` as the
footprint; the **+ Place grid** tool (`placingGrid`/`gridDrawPoints`, same
freehand click-to-close pattern as `drawingRoof`/a drawable obstacle) adds
an *additional*, independent `source: 'drawn'` grid via
`addGridFromPolygon`, attached to whichever roof contains the most of the
drawn polygon's own vertices (not just their centroid — see
`addGridFromPolygon`'s own comment for why a plain average can miss every
roof for a shape drawn near an edge) — a roof can hold any number of these
alongside its one whole-roof grid. `suggestMaxPanelsPerRow` in
`layoutEngine.ts` gives a drawn grid's initial panels-per-row (as many
rows deep as its own footprint allows), replicating just the
depth-geometry piece of `generateLayout` without actually packing
anything.

A selected grid's own settings (tilt/row spacing/structure/panels-per-row)
aren't in a sidebar — selecting exactly one grid (`selectedGridKeys.size
=== 1`) opens them in that grid's own share of the right-side properties
rail (see "Step-based workflow / canvas state" above): an Orientation
toggle, Add row/Add column, a Delete-mode popover, a Rack settings
popover (panels-per-row/tilt/row-spacing), a Structure popover (mounting/
min-pillar-height), then Duplicate/Delete/Deselect — grouped the same way
the old floating popup grouped them, just as rail icons + popovers now
instead of one big box. A *multi*-grid selection (box-select/shift-click)
has no rail equivalent — it still gets a "N grids selected · duplicate ·
delete · clear selection" text strip in the top toolbar, shown only for
`selectedGridKeys.size > 1` (exactly one selected grid is covered by the
rail instead, so the strip would just be redundant with it there).

- **Selection** (`selectedGridKeys`, a `Set` of `` `${roofId}:${gridId}` ``
  strings — `gridKey`/`parseGridKey` are the only places that should
  build/split that string) is at the **grid** level, not the panel level:
  clicking any panel resolves to its owning grid and selects every panel
  in it. `findGrid(roofId, gridId)` looks one up from the current `roofs`
  state.
- **Marquee select** starts from `onSvgMouseDown` (empty roof area) *or*
  from `startGridDrag` when the mousedown lands on an *unselected* grid's
  panel — the roof is normally packed edge-to-edge with panels, so
  requiring a genuinely empty spot to start a marquee from would make it
  barely reachable. Hitting any panel of a grid inside the marquee rect
  selects that grid's *every* panel, not just the ones geometrically
  inside the box. A drag that never actually moves falls back to selecting
  just that one clicked grid (`clickFallbackGridKey` on `boxSelectRef`)
  instead of an empty marquee.
- **Move** — mousedown on an *already-selected* grid arms
  `gridMoveRef`/`movingGrids` for every currently selected grid (so
  grabbing any one drags the group); free movement, no roof-boundary or
  collision snap-back (a deliberate simplification, not an oversight).
  This is a **plain translation**, safe to apply directly to the grid's own
  packed `panels[].x/y` (recomputing `rackX`/`rackY` via `toSlopeLocal`,
  same idea `computeStructure`'s row-grouping needs) and
  `footprintPolygon` — translating every point by the same real-world
  delta translates their local `rackX`/`rackY` by that same delta too
  (`toSlopeLocal` is a pure rotation, so it distributes over addition), so
  a rack's rows still share exact `rackY` values after the move.
  **Known gotcha (bit us once — reported as "cloned panels don't adjust
  height for the new roof"):** a grid is a permanent data-model child of
  whichever roof's `grids` array it lives in (`roof.grids`) - moving it on
  the 2D plan only ever translates `panels[].x/y`, never which roof array
  it's actually in. `Scene3D.tsx` renders every grid at its *owning*
  roof's own `buildingHeight` (no geometric "which roof is this actually
  over" check, unlike obstacles - see `isOnRoof`/`obstacleBaseHeight`
  below), so a grid dragged (or a duplicate placed) onto a *different*
  roof rendered at its old roof's height, floating through/under the new
  one's real structure. `bestRoofForGrid`/`reparentGridToRoof`
  (`layoutEngine.ts`) fix this the same way obstacles already handle it -
  just applied once, at drop time (`handleMouseUp` inside the
  `movingGrids` effect), not continuously during the drag, since a grid's
  own packed geometry (rackX/rackY, tilt, azimuth, footprintPolygon - not
  just one height number) depends on which roof it's on, not just its
  buildingHeight. `bestRoofForGrid` tests every panel's actual *rendered*
  position (`resolvedGridPanels`, rotation included) against every roof's
  polygon - any overlap counts, not just the centroid - and the tallest
  overlapping roof wins on a tie (the one the grid would actually end up
  resting on if it straddles two adjacent roofs of different heights).
  `handleMouseUp` can't read the `roofs` state variable directly to run
  this - its own effect only re-subscribes on `movingGrids`, so its
  closure is fixed to whatever `roofs` was *before* the drag started, not
  updated by any of the position changes `handleMouseMove` applied during
  it. `roofsRef` (synced via its own small effect) exists specifically to
  give `handleMouseUp` the true latest state instead. Any *new* code that
  needs "the current state" inside a native DOM event handler whose own
  effect doesn't re-subscribe on every relevant state change needs the
  same ref-sync trick, not a direct read of the state variable.
- **Rotate** — a handle above the selected grid(s)' own combined
  footprint-center (`startGridRotate`/`rotatingGrids`/`rotateDragRef`,
  pivot from `gridPivot`) sets each grid's own `rotation` (degrees). This
  is **not** applied to the packed data the way move is — rotating each
  panel's world position by an arbitrary angle and re-deriving
  `rackX`/`rackY` from the result would smear what used to be one straight
  row into a diagonal line whose local Y no longer agrees, breaking
  `iterateRacks`' row-grouping. Instead `rotation` stays a
  presentation-only field, and every consumer of a grid's real position
  reads it through `resolvedGridPanels`/`resolvedGridAzimuth`/
  `resolvedGrid` (`layoutEngine.ts`), which rotate around `gridPivot(grid)`
  on the way out — a read-time transform, not a stored one. `Scene3D.tsx`'s
  `StructureSegment` applies the identical transform to
  `computeStructure`'s (unrotated) rack anchor positions so the mounting
  structure stays under a rotated grid's panels. See the comment above
  `gridPivot` in `layoutEngine.ts` for the full reasoning.
- **Duplicate** — `duplicateSelectedGrids` clones each selected grid,
  offset one panel-width along world X (translating panels/footprint via
  `toSlopeLocal` the same way move does), gives it a fresh `id`, and
  selects the clone(s). Built from the *outer* `roofs` closure, not from
  inside the `setRoofs` updater — React doesn't guarantee an updater runs
  before the next statement, so collecting the new grids' keys inside one
  and reading them back immediately after (in a second `setState` call)
  is a real bug class to watch for in this file, not just here.
- **Delete** — `deleteSelectedGrids` groups the current selection by roof
  and filters each roof's own `grids` array.
- **Add row / Add column** (`addSideMode`, `handleAddSide`,
  `addGridRow`/`addGridColumn` in `layoutEngine.ts`) is a direct edit to
  the grid's own packed `panels` array — new panels appended with fresh
  `id`s, existing ones untouched — not a call into `generateLayout`, so
  it never moves or resizes what's already there. `addGridRow` groups
  existing columns by `rackX` (rounded to `COLUMN_TOLERANCE`, since
  different clusters on a non-rectangular footprint can each anchor their
  own scanline start and so aren't guaranteed to align exactly) and
  replicates one more `generateLayout`-style cluster; `addGridColumn`
  replicates one more panel-width using the existing `rackY` set. Force-
  added, no roof-boundary/obstacle check (a deliberate simplification).
  The side is picked by clicking a highlighted edge on the 2D plan — same
  visible-sliver-plus-wide-invisible-hit-line pattern mirror/margin mode
  use.
  **Known gotcha (bit us once):** on a **Fill full roof** grid, the
  add-row/add-column edge-picking lines sit at *exactly* the same screen
  position as the roof polygon's own edge/vertex handles, since the grid's
  footprint equals the roof's. Whichever one paints last wins hit-testing.
  The edge-picking overlay must be the *last* thing rendered inside the
  `<svg>` (right before the closing tag), not wherever it's topically
  grouped with the other mirror/margin overlays — putting it earlier lets
  the roof's own edit handles steal every click meant for it, and the
  failure looks like nothing happening (mode just silently exits) rather
  than an error.
- **Delete: Row / Column / Panel** (`gridDeleteMode`/
  `gridDeleteSelection`, `deleteGridRow`/`deleteGridColumn`/
  `deleteGridPanel` in `layoutEngine.ts`) arms a picking mode from the
  grid's popup; clicking a panel while it's active selects (highlights)
  that whole row (exact `rackY` match — deterministic within one grid),
  column (`rackX` within `COLUMN_TOLERANCE`), or just that panel, and
  `Delete`/`Backspace` removes it — the same key handler whole-grid delete
  uses, so it checks `gridDeleteSelection` first and only falls through to
  whole-grid delete when nothing's picked. `Esc` exits the mode (handled
  in the same keydown listener, alongside the delete keys).
  `deleteGridRow`/`deleteGridColumn` return an **array** of one or two
  grids, not a single grid: deleting a row/column that's interior (other
  rows/columns both before and after it) splits what's left into a front
  grid and a back grid (or left/right for a column) — no longer one
  physically contiguous rack run — while an edge row/column just shrinks
  the grid as a single piece, same as before this existed. Only the first
  piece keeps `source: 'wholeRoof'` when the original had it (see
  `regenerateAllGrids` above — it only ever tracks the *first* grid with
  that source, so a second piece keeping it too would be left behind as
  an orphaned duplicate on a later **Fill full roof** run). `layoutEngine.ts`
  stays free of `Date.now()`/`Math.random()` (see "Conventions" below), so
  `PlantDesignEditor.tsx`'s `applyGridDeleteSelection` gives whichever
  piece isn't first a fresh id, the same way `duplicateSelectedGrids`'
  clones do — every call site that used to `grids.map` over these
  functions now needs `grids.flatMap` instead.
- **Per-grid settings edits** (tilt/row spacing/structure/panels-per-row,
  only editable when exactly one grid is selected, via its own popup - see
  above) go through `updateGridSettings`, which re-runs `generateLayout`
  against the grid's own existing `footprintPolygon` right away — unlike
  the old roof-level fields, editing doesn't clear the grid and wait for
  **Fill full roof** again. It must copy `source` from the old grid onto
  the new one (`generateLayout` itself never sets `source`), or a later
  **Fill full roof** run stops recognizing this grid as the roof's own
  whole-roof one and appends a duplicate instead of replacing it.
  **This is exactly why footprintPolygon has to stay accurate** — see the
  gotcha right below.

**Known gotcha (bit us once — reported as "a non-rectangular grid becomes
a rectangle after changing panels-per-row"):** add/delete row/column/panel
used to rebuild a grid's `footprintPolygon` either as a bounding-box
rectangle (`rectFootprintFromBounds`, on add or a delete-split) or leave
it completely unchanged (a plain delete that didn't split). Both are wrong
whenever the grid's actual occupied shape isn't a plain rectangle — a
grid on an L-shaped/irregular roof, or a delete-split's own narrower
piece, or a grid that already had a hole/notch from an earlier delete.
`updateGridSettings` (just above) re-packs *against `footprintPolygon`*,
so either wrong version resurrects panels in space that was never
actually part of the grid the instant panels-per-row/tilt/row-spacing/
structure changes — the bounding-rectangle case fills the gap outright,
and the unchanged case does too once enough panels have been removed that
the stale polygon no longer matches the real shape. `tracePanelOutline` +
`footprintPolygonFromPanels` (`layoutEngine.ts`) fix this by rebuilding
footprintPolygon as the grid's *true* occupied outline (can be concave/
stepped, not just a rectangle) after every one of these edits, not a
rectangle or a stale leftover. The trace can't just use each panel's own
physical edges — panels never actually touch (`PANEL_GAP` within a
cluster, the bigger shading clearance between clusters), so every panel
would register as its own disconnected island. Instead it builds cell
boundaries at the *midpoint* between adjacent occupied row/column centers
(a Voronoi split along each axis), so adjacent cells always share a
boundary and merge into one region regardless of the real gap between
them; only the outermost edge uses a panel's own physical half-width/
half-depth, since there's no neighbor out there to split with. Assumes
the result is one simply-connected region with no holes (true for every
caller — a delete-split already separates a disconnected result into two
*separate* grids before this ever runs on either piece) and falls back to
the old bounding-rectangle behavior in the pathological case where that
doesn't hold, rather than producing a broken polygon. Any *new* code that
mutates a grid's `panels` array needs to rebuild `footprintPolygon` via
`footprintPolygonFromPanels` too, not skip it or hand-roll a rectangle.

`computeStructure`/`computeOutput`/`getInstantShading` all run **per
grid** now (see "Multi-roof state" below), keyed by `gridKey(roofId,
gridId)` wherever a roof-keyed map used to be enough.

## Roof-wide sun exposure heatmap ("Shadow analysis")

`roofSunSamples` (a `useMemo`, only computed while the "Shadow analysis"
toolbar toggle is on) is independent of any grid/panel — it samples a
plain grid of points across each roof's own usable polygon (spaced by the
current `panelSpec` width/height, clamped 0.5–3m) and runs each one
through `computeOutput` in `'year'` mode exactly as a real panel there
would get, using a unit `panelSpec` (1m², 1000W → efficiency exactly 1)
so the returned per-point kWh is that point's own raw annual irradiance,
not scaled by any particular panel choice. This is why it's usable in
Roof setup itself, before any grid exists.

**Color scale — bit us three times, worth reading before touching
again:** each point is colored by its own output as a % of *that same
roof's own clear-sky baseline* (identical tilt/azimuth, zero obstacles —
one extra `computeOutput` call per roof, since every point on a flat
roof shares that baseline exactly). Two earlier attempts tried a scale
relative to the darkest/brightest point *elsewhere on the roof* (plain
min/max, then a 5th/95th percentile) and both had the same flaw: two
independent obstacles were forced to share one scale, so whichever was
more severe always won it, making the other's real, unrelated shading
fade toward "basically full sun" even though its own actual output never
moved — confirmed directly once: adding an unrelated water tank on the
roof and raising its height pushed a distant building's own correctly-
dark shaded point from 0% up past 86%, purely because the tank was now
the new reference point the scale got rebased against. Comparing each
point only to its own unobstructed potential sidesteps that whole bug
class — adding an obstacle anywhere can now only ever change the color of
points *it* actually shades.

A cubic pre-shape (`(pct/100) ** 3` before mapping to a color) exists
because a real obstacle's worst annual impact — even one that's tall,
wide, and close — still routinely lands in the 60–90% range at this
site's low latitude (the sun sits high overhead most of the year, so
shadows are short for most of it even from a substantial obstacle). A
plain linear color blend made that whole practically-relevant range look
like a barely-changed "still basically full sun", since every real case
bunched up near one end of the scale; cubing first spreads that same
range out before mapping to the (six-stop, blue→cyan→green→yellow→
orange→red) `sunExposureColor` scale.

**Sampling noise smoothing:** the annual total itself only samples 12
representative days (one per month — see `computeOutput`'s own `'year'`
comment), and a real obstacle's shadow band is often narrower than one
sample cell. Whether a *specific* cell gets grazed by that thin, moving
shadow on any of the exact 12 sampled dates is close to arbitrary, so
two cells just 1–2m apart could land on opposite sides of that lottery
and read as wildly different annual totals — confirmed directly: a
single column of sample points went 2043.9 → 2043.9 → 2043.9 → 2014.9 →
2025.6 → 2035.4 kWh with no obstacle-adjacent trend at all. A 3×3
box-average against each cell's own grid neighbors (`cols`, built
column-major alongside the flat `points` list specifically so this pass
can address a cell's actual neighbors) smooths that back into the same
continuous-looking gradient the shadow itself actually sweeps, without
sampling far more (and far more expensive) dates per year to get there.

**Rendering:** the sample grid deliberately overscans each roof's own
bounding box by one cell and renders every cell in it — no "is this
cell's own center inside the polygon" filter — because that filter left
ragged notches on any non-rectangular roof (a hand-traced outline is
never a perfect rectangle): a fully-excluded cell just isn't there for
the clip path to trim, it can only cut down what's already rendered, not
fill in a gap. Instead, each roof's own group of cells is blurred (`filter:
'blur(5px)'`, so the cells read as one continuous gradient rather than a
grid of little panel-like boxes) and *then* clipped to that roof's exact
usable polygon (SVG applies `clip-path` after filter effects), so both
the overscan and the blur get cut off cleanly at the real, possibly
non-rectangular edge. A live "N% sun" readout follows the pointer while
hovering the heatmap (`onSunHeatmapMouseMove`, wired to the plan `<svg>`'s
own `onMouseMove`) — the heatmap cells themselves stay
`pointerEvents:'none'` (so they never steal a click meant for the roof/
panels underneath), so hover is tracked independently by converting the
pointer position to world coordinates and finding whichever sample cell
it currently falls within.

## Undo/redo

A single `useEffect` (dependency `[roofs, obstacles, panelSpec,
inverterChoice]` — grids live on `roofs` now, so no separate layout map
needs watching) watches for
changes and pushes the *previous* snapshot onto `historyRef.current.past`
— rather than instrumenting each of the ~15 call sites that mutate one of
those individually (`removeRoof`, `updateObstacle`, `mirrorRoof`,
`deleteSelectedGrids`, ... ). `undo`/`redo` pop from `past`/`future` and
call all three setters at once.

Two refs keep this from misbehaving:

- **`isRestoringHistoryRef`** — set right before `undo`/`redo` calls the
  setters, checked (and cleared) by the watcher effect on the render that
  follows, so restoring a past snapshot doesn't itself get pushed as a
  new "change" — that would immediately corrupt the redo stack the moment
  you undo anything.
- **`suspendHistoryRef`** — set for the duration of a multi-step drag
  (roof vertex/edge resize, grid move/rotate — the same drags flagged in
  "2D plan interaction model" above) so the dozens of intermediate state
  updates one drag gesture produces collapse into a single undo step,
  taken once the drag actually ends, rather than one step per mousemove.
  Any *new* drag that mutates `roofs`/`obstacles` needs to set/clear this
  the same way (`true` in the drag's `start*` function, `false` at the end
  of its `handleMouseUp`) or it'll flood the undo stack.

Deliberately **not** tracked: `selectedRoofId`/`selectedObstacleId`/
`selectedGridKeys`, `viewMode`, `planZoom`/`panOffset`, sun date/time —
view state nobody would think of as an "edit" to undo. Not persisted
either (see "Where this lives" above) — a fresh page load always starts
with an empty undo stack, even when reopening a saved design.

## Conventions

- No comments explaining *what* code does — only *why*, when the reason
  isn't obvious (a workaround, a simplification, a non-obvious formula).
  This module leans on this heavily for the trickier geometry — keep
  following it.
- Small, focused inline styles in JSX (no CSS framework, unlike the rest of
  this app's plain-CSS-file convention — this module was ported as-is
  rather than restyled); `btn()` / `inputStyle` / `sectionStyle` helpers in
  `PlantDesignEditor.tsx` for consistency within it.
- Simplifications are documented at the point they're made (search
  "simplification" across this directory) rather than collected in one
  place — check nearby comments before "fixing" something that looks
  approximate.
- Everything here stays loosely typed (`any`) — see "Where this lives"
  above for why `noImplicitAny` is off app-wide. Don't use this module as
  a template for typing elsewhere in the app; it's a deliberate exception.

## Verifying changes

No dedicated test suite for this module's logic (matches the rest of this
app — see the root `AGENTS.md`). Run the app's own `tsc -b`/`oxlint` (they
cover this directory too) after any change, then verify visually:
`npm run dev`, log in as an entity admin, open `/app/plant-design`, confirm
a location (needs a real `VITE_GOOGLE_MAPS_API_KEY` to see real imagery,
but the flow works without one), draw a roof shape, generate a layout,
check both `2D plan` and `3D view`, and toggle `Hide panels` in 3D to
inspect the structure directly. Check both `Flat` and `Pitched` roof
types, and both `Truss` and `Ground mount` structure strategies, since
several code paths branch on these. For a pitched roof, also check at
least one non-default **Slope faces** direction (E or W exercises the
local/world rotation in a way N/S don't — see "Pitched roof slope
direction" above) and try a `Panel tilt` that's deliberately far from the
roof's own `pitch` in both directions. Then save, reload the page at the
same `/app/plant-design/:id` URL, and confirm the design comes back
exactly as left (see "Where this lives" above).

If you touch `stringSizing.ts` or `gridInverterAssignment.ts`, a quick
node script is faster and more precise than clicking through the UI for
edge cases — synthetic grids (`{key, label, panelCount, centroid}`) at
known coordinates and panel counts, this is exactly how both pooling
gotchas above were caught (adapt the import to however this repo runs
TS scripts, e.g. via `tsx` or a quick `tsc` compile first — the original
prototype could `node -e "import('./gridInverterAssignment.js')..."`
directly since it was plain JS). Still verify end-to-end in the browser
afterward (draw a real roof, generate real grids, reach step 7) since the
node script can't catch a wiring mistake between `sitePlan` and
`SldView.tsx`. When touching the pooling/clustering logic specifically,
always test: two close grids (should share one inverter), the same two
grids moved 25m+ apart (should each get a dedicated inverter, not
silently pool via a third grid bridging the distance), and several
equal-sized grids forced to share more than one inverter (should split
evenly, not stack one inverter full before touching the next).

If you touch anything in `generateLayout`'s packing loop, test on a
**hand-drawn, not-perfectly-rectangular** roof, not just a precisely
axis-aligned test rectangle — see the row-packing gotcha in "Layout
generation flow" above; a clean rectangle won't expose it.

If you touch anything in `panelsPerRow` clustering (the intersection in
`intersectSegmentLists`), test with `panelsPerRow > 1` on a *tapering*
hand-drawn roof (a triangle, a diamond, or just one sharply angled
corner) specifically — a rectangular roof can't expose the staircase
regression since every row is the same width there regardless.

If you touch the plan view's interaction code, check zoom, pan,
vertex-drag, and edge-drag independently *and* combined (e.g. zoom in, pan
to an off-screen corner, drag its handle) — they're meant to compose, and
it's easy to fix one and silently break how it interacts with another.
Also add a roof/obstacle by closing via both the "click back on the first
point" path and the "double-click" path — they exercise different code
(see `suppressNextClickRef` above).

If you touch grid selection/move/rotate/duplicate, verify with a **real
drag** (mousedown → mousemove → mouseup as genuinely separate events with
time between them), not three synthetic events dispatched back-to-back in
one script — a real drag lets React's effect-driven listener setup (the
`movingGrids`/`rotatingGrids`/`boxSelectRect` state-gated `useEffect`s)
actually attach before the corresponding mouseup arrives; firing all
three synchronously in a test script can appear to "do nothing" purely
from that timing artifact, not a real bug (this cost real debugging time
once — see the `swallowClickAfterDragRef` gotcha above for the *actual*
bug that synthetic-event testing did correctly catch). Test at least one
drag that starts *on* a panel and one that starts on empty roof area —
they're different code paths (see "Panel grids & selection" above). Also
watch for the general bug class in `duplicateSelectedGrids`'s own comment:
never collect a value inside a `setRoofs(prev => ...)` updater and read it
back in a *following* statement (e.g. a subsequent `setSelectedGridKeys`)
— React doesn't run that updater synchronously, so the value won't be
populated yet; compute it from the outer, current-render `roofs` instead.

If you touch undo/redo, verify a multi-step drag collapses to exactly
**one** undo step (drag something a good distance, undo once, confirm it
fully reverts rather than partially) — see `suspendHistoryRef` above; a
drag that doesn't set/clear it floods the history with one entry per
mousemove instead.

If you touch `Scene3D.tsx`'s `OrbitControls`, verify pan (right-drag or
Shift+left-drag) *survives* an unrelated state change mid-drag — e.g.
drag partway, and while still dragging, do something that would trigger
a parent re-render (this is what `orbitTarget`'s memoization above
exists to survive; a regression here won't show up from a quick static
look, only from an actual interrupted drag).
