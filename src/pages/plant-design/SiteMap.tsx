import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from './googleMaps.js';
import { latLngPathToLocalMeters, localMetersToLatLng, centroidOf } from './geoConvert.js';
import { buildStaticMapImage, buildWideStaticMapImage } from './staticMap.js';

const inputStyle = { flex: 1, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 12, color: '#222', background: '#fff' };
const btnStyle = { padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', color: '#222', fontSize: 12, cursor: 'pointer' };
const btnPrimary = { ...btnStyle, border: '1px solid #2f6fed', background: '#2f6fed', color: '#fff' };
const btnDisabled = { ...btnStyle, opacity: 0.5, cursor: 'not-allowed' };

// Traces a roof outline on a Google satellite map and hands the caller back
// a local meters polygon (compatible with the plan-view engine) plus the
// site's lat/lon. Obstacle placement stays on the existing abstract plan
// view — this component's only job is capturing the roof boundary and the
// real-world coordinates.
//
// Note: Google removed the Drawing Library's DrawingManager from the Maps
// JavaScript API (v3.65+), so polygon tracing is done by hand here: map
// clicks append vertices to a live Polyline, and clicking the first vertex
// again closes the shape into an editable Polygon — the same interaction
// used by the plain SVG roof-draw mode elsewhere in the app.
export default function SiteMap({ apiKey, initialLocation, initialPolygon, onCapture, onLocationChange, onCancel, fill = false, mode = 'shape' }: any) {
  const mapDivRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const polygonRef = useRef<any>(null);
  const tempPolylineRef = useRef<any>(null);
  const startMarkerRef = useRef<any>(null);
  const drawPointsRef = useRef<any[]>([]);
  const isDrawingRef = useRef(false);
  const addressInputRef = useRef<any>(null);
  const autocompleteRef = useRef<any>(null);
  // Kept as a ref (rather than an effect dependency) so the map-creation
  // effect below can stay mount-once - it always calls whatever the latest
  // onLocationChange is, without needing to recreate the map when the
  // parent passes a new inline function each render.
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;
  // Set once the map's ready (see the effect below) so handleSearch, which
  // lives outside that effect, can trigger the same center->parent sync.
  const syncCenterToParentRef = useRef(() => {});

  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState<any>(null);
  const [address, setAddress] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasPolygon, setHasPolygon] = useState(false);

  useEffect(() => {
    if (!apiKey) {
      setStatus('error');
      setError('No VITE_GOOGLE_MAPS_API_KEY set (see .env.example).');
      return;
    }
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then((google) => {
        if (cancelled) return;
        const center = { lat: initialLocation.lat, lng: initialLocation.lon };
        const map = new google.maps.Map(mapDivRef.current, {
          center, zoom: 20, mapTypeId: 'satellite', tilt: 0, streetViewControl: false,
        });

        // location mode has no separate "confirm" step - the fixed center
        // pin's coordinates sync straight back to the parent (and from
        // there, the sidebar's lat/lon fields) on every way the pin can
        // move: dragging the map, or picking a place from the address
        // dropdown/search below.
        function syncCenterToParent() {
          if (mode !== 'location' || !onLocationChangeRef.current) return;
          const c = map.getCenter();
          if (!c) return;
          onLocationChangeRef.current({ lat: c.lat(), lon: c.lng() });
        }
        if (mode === 'location') map.addListener('dragend', syncCenterToParent);

        map.addListener('click', (e) => {
          if (mode !== 'shape' || !isDrawingRef.current) return;
          const latLng = e.latLng;

          if (drawPointsRef.current.length > 0) {
            const first = drawPointsRef.current[0];
            const px = pixelDistance(map, first, latLng);
            if (px !== null && px < 20) {
              finishDrawing(google, map);
              return;
            }
          }

          drawPointsRef.current.push(latLng);
          redrawTempPath(google, map);

          if (drawPointsRef.current.length === 1) {
            startMarkerRef.current = new google.maps.Marker({
              position: latLng, map,
              icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#2f6fed', fillOpacity: 1, strokeWeight: 2, strokeColor: '#fff' },
            });
          }
        });

        // Re-editing an existing shape: seed the editable polygon straight
        // from the stored local-meters outline (converted back to lat/lng
        // around the same origin it was captured against) instead of
        // making the user retrace it from a blank map.
        if (mode === 'shape' && initialPolygon && initialPolygon.length >= 3) {
          const origin = { lat: initialLocation.lat, lng: initialLocation.lon };
          const seedPath = initialPolygon.map((p) => localMetersToLatLng(p, origin));
          polygonRef.current = new google.maps.Polygon({
            paths: seedPath,
            map,
            editable: true,
            fillColor: '#2f6fed', fillOpacity: 0.25, strokeColor: '#2f6fed', strokeWeight: 2,
          });
          const bounds = new google.maps.LatLngBounds();
          seedPath.forEach((p) => bounds.extend(p));
          map.fitBounds(bounds, 40);
          setHasPolygon(true);
        }

        // Bind the places Autocomplete widget to the address input so
        // typing shows a live dropdown of matching place suggestions,
        // instead of only resolving on submit via the Geocoder fallback.
        const autocomplete = new google.maps.places.Autocomplete(addressInputRef.current, {
          fields: ['geometry', 'formatted_address'],
        });
        autocomplete.bindTo('bounds', map);
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (!place.geometry || !place.geometry.location) {
            setError(`Address not found (${addressInputRef.current.value})`);
            return;
          }
          map.setCenter(place.geometry.location);
          map.setZoom(20);
          setError(null);
          if (place.formatted_address) setAddress(place.formatted_address);
          syncCenterToParent();
        });
        autocompleteRef.current = autocomplete;

        mapRef.current = map;
        syncCenterToParentRef.current = syncCenterToParent;
        setStatus('ready');
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus('error');
          setError(err.message);
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  function pixelDistance(map, latLngA, latLngB) {
    const proj = map.getProjection();
    if (!proj) return null;
    const scale = 2 ** map.getZoom();
    const a = proj.fromLatLngToPoint(latLngA);
    const b = proj.fromLatLngToPoint(latLngB);
    return Math.hypot((a.x - b.x) * scale, (a.y - b.y) * scale);
  }

  function redrawTempPath(google, map) {
    if (tempPolylineRef.current) tempPolylineRef.current.setMap(null);
    tempPolylineRef.current = new google.maps.Polyline({
      path: drawPointsRef.current,
      map,
      strokeColor: '#2f6fed',
      strokeWeight: 2,
    });
  }

  function finishDrawing(google, map) {
    if (drawPointsRef.current.length < 3) return;
    if (tempPolylineRef.current) { tempPolylineRef.current.setMap(null); tempPolylineRef.current = null; }
    if (startMarkerRef.current) { startMarkerRef.current.setMap(null); startMarkerRef.current = null; }
    polygonRef.current = new google.maps.Polygon({
      paths: drawPointsRef.current,
      map,
      editable: true,
      fillColor: '#2f6fed', fillOpacity: 0.25, strokeColor: '#2f6fed', strokeWeight: 2,
    });
    drawPointsRef.current = [];
    isDrawingRef.current = false;
    setIsDrawing(false);
    setHasPolygon(true);
  }

  function handleSearch() {
    const w = window as any;
    if (!address.trim() || !w.google) return;
    const geocoder = new w.google.maps.Geocoder();
    geocoder.geocode({ address }, (results, geoStatus) => {
      if (geoStatus === 'OK' && results[0]) {
        mapRef.current.setCenter(results[0].geometry.location);
        mapRef.current.setZoom(20);
        setError(null);
        syncCenterToParentRef.current();
      } else {
        setError(`Address not found (${geoStatus})`);
      }
    });
  }

  function startDrawing() {
    if (polygonRef.current) { polygonRef.current.setMap(null); polygonRef.current = null; }
    if (tempPolylineRef.current) { tempPolylineRef.current.setMap(null); tempPolylineRef.current = null; }
    if (startMarkerRef.current) { startMarkerRef.current.setMap(null); startMarkerRef.current = null; }
    drawPointsRef.current = [];
    setHasPolygon(false);
    isDrawingRef.current = true;
    setIsDrawing(true);
  }

  function handleUseShape() {
    if (!polygonRef.current) return;
    const path = polygonRef.current.getPath().getArray().map((ll) => ({ lat: ll.lat(), lng: ll.lng() }));
    if (path.length < 3) return;
    const origin = centroidOf(path);
    const polygon = latLngPathToLocalMeters(path, origin);
    const mapImage = apiKey ? buildStaticMapImage({ apiKey, path }) : null;
    const mapImageWide = apiKey ? buildWideStaticMapImage({ apiKey, path }) : null;
    onCapture({ location: { lat: origin.lat, lon: origin.lng }, polygon, mapImage, mapImageWide });
  }

  return (
    <div style={fill ? { display: 'flex', flexDirection: 'column', height: '100%' } : undefined}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          ref={addressInputRef}
          style={inputStyle} value={address} placeholder="Search address…"
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button style={btnStyle} onClick={handleSearch}>Search</button>
      </div>

      {status === 'error' && <div style={{ color: '#c0392b', fontSize: 11, marginBottom: 8 }}>{error}</div>}
      {status === 'loading' && <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Loading map…</div>}

      <div style={{ position: 'relative', ...(fill ? { flex: 1, minHeight: 300 } : {}) }}>
        <div ref={mapDivRef} style={fill
          ? { width: '100%', height: '100%', borderRadius: 8, border: '1px solid #ccc', background: '#eee' }
          : { width: '100%', height: 360, borderRadius: 8, border: '1px solid #ccc', background: '#eee' }} />
        {mode === 'location' && status === 'ready' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -100%)',
            fontSize: 32, lineHeight: 1, pointerEvents: 'none', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.4))',
          }}>
            📍
          </div>
        )}
      </div>

      {status === 'ready' && (
        <>
          {error && <div style={{ color: '#c0392b', fontSize: 11, marginTop: 8 }}>{error}</div>}

          {mode === 'location' ? (
            <>
              <div style={{ fontSize: 11, color: '#666', margin: '8px 0' }}>
                Search an address or drag the map so the pin sits on your site - the coordinates on the left update as you go.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnPrimary} onClick={onCancel}>Done</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, color: '#666', margin: '8px 0' }}>
                {isDrawing
                  ? 'Click points around the roof outline, then click the first point again to close it.'
                  : hasPolygon
                    ? 'Drag the corner handles to adjust, or redraw.'
                    : 'Click "Draw roof outline", then trace the roof on the satellite image.'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnStyle} onClick={startDrawing}>{hasPolygon || isDrawing ? 'Redraw' : 'Draw roof outline'}</button>
                <button style={hasPolygon ? btnPrimary : btnDisabled} onClick={handleUseShape} disabled={!hasPolygon}>
                  Use this shape
                </button>
                <button style={btnStyle} onClick={onCancel}>Cancel</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
