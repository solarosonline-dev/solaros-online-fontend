import { centroidOf, latLngPathToLocalMeters } from './geoConvert.js';

// Builds Maps Static API requests for a polygon's bounding area, plus the
// metadata (center, zoom, pixel size/scale) needed to place that image back
// into the engine's local-meters coordinate space later (see
// geoConvert.metersPerPixel). Capped to what the Static API actually
// supports: size <= 640x640 without a premium plan, zoom 1-21.
const MAX_ZOOM = 21;
const MIN_ZOOM = 1;

// How much real-world ground the roof-focused capture covers beyond the
// polygon's own bounding span, so the 2D plan view (which frames itself
// tightly around the roof) is fully covered without wasting resolution.
const COVERAGE_MULTIPLIER = 4;
const MIN_SPAN_METERS = 60;

// The 3D view's ground plane needs to look infinite — no single crisp photo
// can cover that AND stay sharp on the roof, so instead of stretching/
// tiling/fading the roof-focused image (all of which end up looking
// obviously fake), a second, independent capture is taken at the same
// center but zoomed much further out. It's blurrier per-pixel, but that's
// only ever visible well away from the building, at the edges of where the
// camera can orbit — real imagery there beats any synthetic trick.
const WIDE_SPAN_METERS = 500;

// The pre-shape preview needs to be drawn over and zoomed into on the 2D
// plan, so it wants the opposite trade-off from the 3D ground texture: a
// tight span for sharp resolution (the same fixed ~1280x1280 pixel budget
// spread over far less real-world area), even though that means it won't
// stay framed if the eventual roof turns out to be unusually large. 200m
// covers a generous property/small campus rather than just a single
// building + yard - sizePx/scale can't go higher without a paid Maps
// plan (see MAX_ZOOM's own comment), so more coverage here only ever
// comes at the cost of per-pixel sharpness, not the other way round.
// Exported so the location-picker map (SiteMap.tsx) can draw a boundary
// showing exactly what this capture will cover, rather than the two
// numbers drifting apart if one is ever tuned without the other.
export const LOCATION_PREVIEW_SPAN_METERS = 200;

function buildImageForSpan({ apiKey, center, spanMeters, sizePx, scale }) {
  // Ground coverage for a given zoom is independent of `scale` — scale only
  // packs more actual pixels into the same logical size= area (sharper
  // image, same real-world footprint), so the zoom pick must NOT divide by
  // it here (metersPerPixel's own `scale` param is for per-actual-pixel
  // resolution, a different thing — see its use in solar_layout_engine.jsx's
  // widthMeters/heightMeters calc, which must stay consistent with this by
  // also using scale=1).
  const targetMetersPerLogicalPixel = spanMeters / sizePx;
  const rawZoom = Math.log2(
    (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / targetMetersPerLogicalPixel
  );
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(rawZoom)));

  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}&zoom=${zoom}&size=${sizePx}x${sizePx}&scale=${scale}&maptype=satellite&key=${encodeURIComponent(apiKey)}`;

  return { url, centerLat: center.lat, centerLon: center.lng, zoom, sizePx, scale };
}

export function buildStaticMapImage({ apiKey, path, sizePx = 640, scale = 2 }) {
  const center = centroidOf(path);
  const local = latLngPathToLocalMeters(path, center);
  const xs = local.map((p) => p.x);
  const ys = local.map((p) => p.y);
  const bboxSpan = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 5);
  const spanMeters = Math.max(bboxSpan * COVERAGE_MULTIPLIER, MIN_SPAN_METERS);
  return buildImageForSpan({ apiKey, center, spanMeters, sizePx, scale });
}

export function buildWideStaticMapImage({ apiKey, path, sizePx = 640, scale = 2 }) {
  const center = centroidOf(path);
  return buildImageForSpan({ apiKey, center, spanMeters: WIDE_SPAN_METERS, sizePx, scale });
}

// A satellite preview centered on the confirmed location itself, before any
// roof shape exists yet — lets the 2D plan view show real imagery to trace
// over immediately after picking a location, instead of only after a trip
// through the separate map-tracing tool. Centered exactly on `location`,
// which is by construction the origin (0,0) of the app's local-meters
// space, so placing it needs no polygon-derived centroid at all.
export function buildLocationPreviewImage({ apiKey, lat, lon, sizePx = 640, scale = 2 }) {
  return buildImageForSpan({ apiKey, center: { lat, lng: lon }, spanMeters: LOCATION_PREVIEW_SPAN_METERS, sizePx, scale });
}

// The same location-anchored preview, but at the 3D view's wide span
// instead of the 2D plan's tight one — a separate capture, not a shared one,
// because those two views want opposite trade-offs (sharp-but-small vs
// blurry-but-huge) from the same fixed pixel budget.
export function buildWideLocationPreviewImage({ apiKey, lat, lon, sizePx = 640, scale = 2 }) {
  return buildImageForSpan({ apiKey, center: { lat, lng: lon }, spanMeters: WIDE_SPAN_METERS, sizePx, scale });
}
