/**
 * Best-effort geolocation + canvas watermarking for work order photos.
 *
 * Geolocation is always best-effort: permission denied, timeout, or an
 * unsupported browser must never block a photo from being captured/uploaded
 * -- `getCurrentPositionSafe` resolves `{ position: null, reason }` instead
 * of rejecting, and `stampAndPreparePhoto` falls back to returning the
 * original file untouched (with null lat/long/capturedAt) whenever no
 * position was obtained. The `reason`/`skippedReason` values let the caller
 * tell the user *why* a photo has no stamp -- without that, a denied/absent
 * location permission looks identical to a bug from the outside, since
 * nothing else changes about the (successful) upload.
 */

/** Why a photo ended up without a visible/structured location stamp --
 * surfaced to the UI so a silent geolocation failure (by design, so it never
 * blocks the upload) doesn't look like an unexplained bug. Null means a
 * stamp was successfully applied. */
export type GeotagSkippedReason =
  | "unsupported" // Geolocation API not available (e.g. insecure context, ancient browser)
  | "permission_denied" // user or browser/site settings blocked the location prompt
  | "position_unavailable" // OS-level location services off, no GPS/network fix, etc.
  | "timeout" // no fix within the timeout window
  | "canvas_unavailable"; // position WAS obtained, but drawing/re-encoding the image failed

export type GeotagResult = {
  file: File;
  latitude: number | null;
  longitude: number | null;
  capturedAt: string;
  skippedReason: GeotagSkippedReason | null;
};

type PositionResult = { position: GeolocationPosition; reason: null } | { position: null; reason: GeotagSkippedReason };

/** Wraps navigator.geolocation.getCurrentPosition in a Promise that never
 * rejects -- resolves `{ position: null, reason }` on permission-denied,
 * timeout, or when the Geolocation API isn't available at all (e.g.
 * non-HTTPS, unsupported browser), instead of throwing, so a caller can
 * still tell the user *why* no stamp was applied. */
export function getCurrentPositionSafe(timeoutMs = 8000): Promise<PositionResult> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ position: null, reason: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ position, reason: null }),
      (err) => {
        // GeolocationPositionError codes: 1 = PERMISSION_DENIED,
        // 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
        const reason: GeotagSkippedReason =
          err.code === 1 ? "permission_denied" : err.code === 3 ? "timeout" : "position_unavailable";
        resolve({ position: null, reason });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

/** Draws a semi-opaque banner across the bottom of the canvas with the
 * lat/long + a human-readable timestamp -- sized relative to the image so it
 * stays legible on both a small phone photo and a large one. */
function drawGeotagBanner(ctx: CanvasRenderingContext2D, width: number, height: number, latitude: number, longitude: number, capturedAt: string) {
  const fontSize = Math.max(14, Math.round(width * 0.028));
  const paddingX = Math.round(fontSize * 0.8);
  const lineHeight = Math.round(fontSize * 1.35);
  const lines = [
    `Lat: ${formatCoordinate(latitude)}, Long: ${formatCoordinate(longitude)}`,
    new Date(capturedAt).toLocaleString(),
  ];
  const bannerHeight = lineHeight * lines.length + paddingX;

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, height - bannerHeight, width, bannerHeight);

  ctx.fillStyle = "#ffffff";
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    const y = height - bannerHeight + paddingX / 2 + lineHeight * i + lineHeight / 2;
    ctx.fillText(line, paddingX, y);
  });
}

/** Attempts to geotag `file`: gets the current position (best-effort), draws
 * the image onto a canvas (normalizing EXIF orientation via
 * `imageOrientation: "from-image"` so rotated phone photos aren't stamped
 * sideways), overlays a lat/long/timestamp banner at the bottom when a
 * position was available, and re-encodes as a JPEG File. If no position is
 * available, returns the original file untouched (no wasted re-encode) with
 * null latitude/longitude. */
export async function stampAndPreparePhoto(file: File): Promise<GeotagResult> {
  const capturedAt = new Date().toISOString();
  const { position, reason } = await getCurrentPositionSafe();

  if (!position) {
    return { file, latitude: null, longitude: null, capturedAt, skippedReason: reason };
  }

  const { latitude, longitude } = position.coords;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { file, latitude, longitude, capturedAt, skippedReason: "canvas_unavailable" };
    }
    ctx.drawImage(bitmap, 0, 0);
    drawGeotagBanner(ctx, canvas.width, canvas.height, latitude, longitude, capturedAt);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) {
      return { file, latitude, longitude, capturedAt, skippedReason: "canvas_unavailable" };
    }

    const stampedFile = new File([blob], file.name, { type: "image/jpeg" });
    return { file: stampedFile, latitude, longitude, capturedAt, skippedReason: null };
  } catch {
    // Canvas/createImageBitmap failure (e.g. an unsupported/corrupt image,
    // or a HEIC file some browsers hand back from the camera that
    // createImageBitmap can't decode) -- fall back to uploading the
    // original file with the geotag stored as structured metadata only,
    // rather than failing the capture outright. Note: position WAS
    // obtained here, so latitude/longitude are still non-null -- only the
    // visible watermark is missing, which is exactly why this has its own
    // distinct reason rather than being lumped in with "no location".
    return { file, latitude, longitude, capturedAt, skippedReason: "canvas_unavailable" };
  }
}
