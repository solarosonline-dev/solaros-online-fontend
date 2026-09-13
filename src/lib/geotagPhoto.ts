/**
 * Best-effort geolocation + canvas watermarking for work order photos.
 *
 * Geolocation is always best-effort: permission denied, timeout, or an
 * unsupported browser must never block a photo from being captured/uploaded
 * -- `getCurrentPositionSafe` resolves `null` instead of rejecting, and
 * `stampAndPreparePhoto` falls back to returning the original file untouched
 * (with null lat/long/capturedAt) whenever no position was obtained.
 */

export type GeotagResult = {
  file: File;
  latitude: number | null;
  longitude: number | null;
  capturedAt: string;
};

/** Wraps navigator.geolocation.getCurrentPosition in a Promise that never
 * rejects -- resolves `null` on permission-denied, timeout, or when the
 * Geolocation API isn't available at all (e.g. non-HTTPS, unsupported
 * browser). */
export function getCurrentPositionSafe(timeoutMs = 8000): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
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
  const position = await getCurrentPositionSafe();

  if (!position) {
    return { file, latitude: null, longitude: null, capturedAt };
  }

  const { latitude, longitude } = position.coords;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { file, latitude, longitude, capturedAt };
    }
    ctx.drawImage(bitmap, 0, 0);
    drawGeotagBanner(ctx, canvas.width, canvas.height, latitude, longitude, capturedAt);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) {
      return { file, latitude, longitude, capturedAt };
    }

    const stampedFile = new File([blob], file.name, { type: "image/jpeg" });
    return { file: stampedFile, latitude, longitude, capturedAt };
  } catch {
    // Canvas/createImageBitmap failure (e.g. an unsupported/corrupt image) --
    // fall back to uploading the original file with the geotag stored as
    // structured metadata only, rather than failing the capture outright.
    return { file, latitude, longitude, capturedAt };
  }
}
