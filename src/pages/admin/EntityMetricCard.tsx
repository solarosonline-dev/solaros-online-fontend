// Business-friendly metric primitives for EntityDashboardPage.tsx only.
// Deliberately NOT shared with FunnelGrid.tsx's `Tile` (used by the
// system-admin dashboard) — that component stays as-is for the denser,
// technical ops view; these are styled for an EPC owner glancing at their
// own business, with a clear size hierarchy (one hero number per stage,
// smaller supporting tiles underneath) instead of a flat grid of
// identically-weighted boxes.

export function HeroMetric({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="entity-hero-metric">
      <div className="entity-hero-metric-value">{value}</div>
      <div className="entity-hero-metric-label">{label}</div>
      {secondary && <div className="entity-hero-metric-secondary">{secondary}</div>}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="entity-metric-tile">
      <div className="entity-metric-tile-value">{value}</div>
      <div className="entity-metric-tile-label">{label}</div>
      {sublabel && <div className="entity-metric-tile-sublabel">{sublabel}</div>}
    </div>
  );
}
