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
export interface PlantDesignData {
  roofs: any[];
  obstacles: any[];
  siteImages: { locationImage: any; locationImageWide: any };
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
  currentStep: number;
  maxUnlockedStep: number;
}

export interface PlantDesignEditorProps {
  initialDesignData?: PlantDesignData;
  onSave: (
    data: PlantDesignData,
    meta: { name: string; capacityKw: number | null; latitude: number | null; longitude: number | null }
  ) => Promise<void>;
}
