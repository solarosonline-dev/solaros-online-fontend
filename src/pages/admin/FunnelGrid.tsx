import type { ReactNode } from "react";
import "./AdminMetrics.css";

// A funnel-shaped 2x2 quadrant grid: Leads -> Quotes -> Agreements -> Projects,
// read clockwise (right along the top row, down the right column, left along
// the bottom row) so every stage connects to the next via one arrow, using
// only cardinal (never diagonal) connectors. Work orders — the output of a
// signed project rather than a step in the sales funnel — gets its own
// full-width row underneath instead of a fifth quadrant.
export function FunnelGrid({ children }: { children: ReactNode }) {
  return <div className="admin-funnel-grid">{children}</div>;
}

export function FunnelStage({
  title,
  area,
  children,
}: {
  title: string;
  area: "lead" | "quote" | "agreement" | "project" | "workorder";
  children: ReactNode;
}) {
  return (
    <div className={`admin-funnel-stage admin-funnel-stage-${area}`}>
      <h2>{title}</h2>
      <div className="admin-funnel-tiles">{children}</div>
    </div>
  );
}

export function FunnelArrow({
  direction,
  area,
}: {
  direction: "right" | "down" | "left";
  area: "lead-quote" | "quote-agreement" | "agreement-project";
}) {
  const glyph = direction === "right" ? "→" : direction === "down" ? "↓" : "←";
  return (
    <div className={`admin-funnel-arrow admin-funnel-arrow-${area}`} aria-hidden="true">
      {glyph}
    </div>
  );
}

export function Tile({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="admin-funnel-tile">
      <div className="admin-funnel-tile-value">{value}</div>
      <div className="admin-funnel-tile-label">{label}</div>
      {sublabel && <div className="admin-funnel-tile-sublabel">{sublabel}</div>}
    </div>
  );
}
