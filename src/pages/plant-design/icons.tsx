import React from 'react';

// Small stroke-style icons for the obstacle picker and the 2D/3D view
// toggle (see PlantDesignEditor.tsx) - replacing plain text labels
// ('Tree', 'AC Unit', '2D'/'3D', ...) with something that reads at a
// glance instead of needing to be read. One shared visual language: 24x24
// viewBox, currentColor stroke (so a button's own active/hover color
// carries through with no extra prop), round caps/joins, no fill except
// where a small solid dot reads better than an outline (the dish's feed
// horn, the lightning arrestor's tip). `size` defaults to 18, the icon
// rail's usual glyph size (see iconBtn's fontSize in PlantDesignEditor.tsx).

type IconProps = { size?: number; className?: string };
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function TreeIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path {...base} d="M12 2 L7 9 H10 L6 15 H18 L14 9 H17 Z" />
      <line {...base} x1="12" y1="15" x2="12" y2="21" />
    </svg>
  );
}

export function ElevationIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path {...base} d="M3 20 H8 V12 H21" />
      <line {...base} x1="3" y1="20" x2="21" y2="20" />
      <line {...base} x1="21" y1="12" x2="21" y2="20" />
    </svg>
  );
}

export function TankIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <ellipse {...base} cx="12" cy="6" rx="7" ry="3" />
      <path {...base} d="M5 6 V16 A7 3 0 0 0 19 16 V6" />
    </svg>
  );
}

export function AcIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect {...base} x="3" y="7" width="18" height="10" rx="1.5" />
      <line {...base} x1="6" y1="12" x2="18" y2="12" />
      <line {...base} x1="6" y1="15" x2="15" y2="15" />
    </svg>
  );
}

export function VentIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path {...base} d="M7 9 Q12 3 17 9" />
      <line {...base} x1="12" y1="9" x2="12" y2="21" />
    </svg>
  );
}

export function ChimneyIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <line {...base} x1="6" y1="6" x2="18" y2="6" />
      <path {...base} d="M8 6 V21 H16 V6" />
    </svg>
  );
}

export function SkylightIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect {...base} x="4" y="4" width="16" height="16" rx="1.5" />
      <line {...base} x1="12" y1="4" x2="12" y2="20" />
      <line {...base} x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
}

export function DishIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path {...base} d="M4 15 A10 10 0 0 1 18 5" />
      <line {...base} x1="4" y1="15" x2="4" y2="20" />
      <line {...base} x1="18" y1="5" x2="14" y2="13" />
      <circle cx="14" cy="13" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TurbineVentIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <circle {...base} cx="12" cy="13" r="8" />
      <path {...base} d="M12 13 L12 6 M12 13 L18 16 M12 13 L6 16" />
    </svg>
  );
}

export function LightningArrestorIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <line {...base} x1="12" y1="2" x2="12" y2="8" />
      <path {...base} d="M13 8 L9 14 H13 L11 22" />
    </svg>
  );
}

export function WalkwayIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path {...base} d="M5 21 L14 3" strokeDasharray="3 3" />
      <path {...base} d="M10 21 L19 3" strokeDasharray="3 3" />
    </svg>
  );
}

export function CutoutIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect {...base} x="4" y="4" width="16" height="16" rx="1.5" />
      <rect {...base} x="8.5" y="8.5" width="7" height="7" strokeDasharray="2 2" />
    </svg>
  );
}

// The obstacle picker's own preset -> icon map (see PlantDesignEditor.tsx,
// where each key here matches an OBSTACLE_PRESETS key in layoutEngine.ts).
export const OBSTACLE_ICONS: Record<string, (props: IconProps) => React.JSX.Element> = {
  tree: TreeIcon,
  elevation: ElevationIcon,
  tank: TankIcon,
  ac: AcIcon,
  vent: VentIcon,
  chimney: ChimneyIcon,
  skylight: SkylightIcon,
  dish: DishIcon,
  turbineVent: TurbineVentIcon,
  lightningArrestor: LightningArrestorIcon,
  walkway: WalkwayIcon,
  cutout: CutoutIcon,
};

// The 2D/3D view toggle (see PlantDesignEditor.tsx) - a flat plan view vs
// an isometric cube, rather than reusing a generic shape for both.
export function Plan2DIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect {...base} x="4" y="4" width="16" height="16" rx="1.5" />
      <line {...base} x1="4" y1="12" x2="20" y2="12" />
      <line {...base} x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

export function Cube3DIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path {...base} d="M12 2 L20 6.5 V17.5 L12 22 L4 17.5 V6.5 Z" />
      <path {...base} d="M4 6.5 L12 12 L20 6.5 M12 12 V22" />
    </svg>
  );
}
