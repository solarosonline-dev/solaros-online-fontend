// Converts lat/lng points to the engine's local x/y meters (x = east,
// y = north), relative to an origin point. Uses a flat equirectangular
// approximation (meters-per-degree scaled by cos(latitude)) — accurate
// enough at building scale, no need for a full geodesy library.
const METERS_PER_DEG_LAT = 111320;

export function latLngToLocalMeters(point, origin) {
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (point.lng - origin.lng) * metersPerDegLon,
    y: (point.lat - origin.lat) * METERS_PER_DEG_LAT,
  };
}

export function latLngPathToLocalMeters(path, origin) {
  return path.map((p) => latLngToLocalMeters(p, origin));
}

// Inverse of latLngToLocalMeters — used to re-seed the map's editable
// polygon with a shape that was previously captured and converted to
// local meters, so re-editing starts from the existing outline instead
// of a blank draw.
export function localMetersToLatLng(point, origin) {
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return {
    lat: origin.lat + point.y / METERS_PER_DEG_LAT,
    lng: origin.lng + point.x / metersPerDegLon,
  };
}

export function centroidOf(path) {
  const n = path.length;
  const sum = path.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / n, lng: sum.lng / n };
}

// Web Mercator ground resolution at a given latitude/zoom, matching the
// projection the Maps Static/JS APIs use — lets us size and place a
// captured satellite image in the engine's own meter-based coordinate
// space (see solar_layout_engine.jsx's toScreen/scale and Scene3D's
// toThree, both of which are meters, not pixels or lat/lng).
export function metersPerPixel(lat, zoom, scale = 1) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / (2 ** zoom * scale);
}
