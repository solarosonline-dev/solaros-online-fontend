// Shared types for the Plant Design module. The wizard's internal engine
// state (roofs/grids/panels/obstacles/geometry) stays untyped (`any`) per
// the mechanical-port decision (see PlantDesignEditor.tsx) - these types
// only cover the persistence boundary: what gets sent to/read from the
// backend's design_data JSONB column.

// The full round-trippable state of a design. Everything here is "content"
// state - what the user actually placed/configured - deliberately
// excluding transient UI/interaction state (current drag, hover, pan/zoom,
// selection) which doesn't need to survive a save/reload. See
// PlantDesignEditor's content-state vs transient-state split for the exact
// reasoning: `roofs` already carries each roof's nested `grids`/`panels`
// (the actual placed-panel data), so persisting this list alone is enough
// to fully reconstruct a design exactly as left off - everything else
// (panel counts, output estimate, string/MPPT schedule, SLD) is
// recomputed via useMemo from this data, not stored separately.
// A single satellite capture - `url` is always present (the live Maps
// Static API request the frontend built - see staticMap.ts) so the image
// still renders during editing, before it's ever round-tripped through a
// save. `s3Key` only appears once the backend has captured it to S3 (see
// solaros-online-backend's ApiSpecs.md, "One narrow, deliberate exception
// to opaque JSON blob"); a save response's `url` is a fresh presigned S3
// url whenever `s3Key` is present, otherwise the same live Google url sent
// up (capture is best-effort - a failed one just gets retried next save).
export interface SiteImageCapture {
  url: string;
  centerLat: number;
  centerLon: number;
  zoom: number;
  sizePx: number;
  scale: number;
  s3Key?: string;
}

export interface PlantDesignData {
  roofs: any[];
  obstacles: any[];
  siteImages: { locationImage: SiteImageCapture | null; locationImageWide: SiteImageCapture | null };
  location: { lat: number; lon: number; tz: number };
  locationConfirmed: boolean;
  monthlyGHI: number[];
  projectName: string;
  capacityNote: string;
  gridConnection: { voltage: number; phase: number; sanctionedLoadKw: number | string; discom: string };
  panelSpec: any;
  inverterChoice: any;
  designTemp: { min: number; max: number };
  targetDcAcRatio: number;
  mpptVoltageUtilizationPct: number;
  currentStep: number;
  maxUnlockedStep: number;
}

export interface PlantDesignEditorProps {
  initialDesignData?: PlantDesignData;
  // Returns the server's own saved copy of `data` - specifically so the
  // editor can pick up `siteImages` entries the backend just captured to
  // S3 (see SiteImageCapture), replacing the live Google urls it sent up
  // without waiting for a full reload.
  onSave: (
    data: PlantDesignData,
    meta: { name: string; capacityKw: number | null; latitude: number | null; longitude: number | null }
  ) => Promise<PlantDesignData | void>;
  // Uploads a satellite capture the editor already fetched itself straight
  // to S3 (see PlantDesignEditorPage's uploadPlantDesignSiteImage) -
  // resolves to the same {s3Key} a save's own backend-side capture would
  // otherwise produce, just without that second Maps Static API call. The
  // editor stays HTTP-agnostic otherwise (see onSave's own comment above),
  // so this is optional: without it, a site image simply keeps riding on
  // its live Google url until the next save triggers the backend's own
  // fallback capture instead.
  onCaptureSiteImage?: (blob: Blob, contentType: string) => Promise<{ s3Key: string; url: string }>;
}
