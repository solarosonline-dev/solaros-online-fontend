import type { ReactNode } from "react";

// Forked from FunnelGrid.tsx specifically for EntityDashboardPage.tsx.
// Same clockwise 2x2 quadrant shape (Leads -> Quotes -> Agreements ->
// Projects, right/down/left, Work orders as a full-width row below) but
// with a per-stage color accent and, on the arrows, an optional
// conversion-rate badge — neither of which the system-admin dashboard
// needs, so kept out of the shared FunnelGrid.tsx rather than bolted on.

export type StageArea = "lead" | "quote" | "agreement" | "project" | "workorder";

export function EntityFunnelGrid({ children }: { children: ReactNode }) {
  return <div className="entity-funnel-grid">{children}</div>;
}

export function EntityFunnelStage({
  title,
  area,
  children,
}: {
  title: string;
  area: StageArea;
  children: ReactNode;
}) {
  return (
    <div className={`entity-funnel-stage entity-funnel-stage-${area}`}>
      <h2>{title}</h2>
      <div className="entity-funnel-body">{children}</div>
    </div>
  );
}

export function EntityFunnelArrow({
  direction,
  area,
  conversion,
}: {
  direction: "right" | "down" | "left";
  area: "lead-quote" | "quote-agreement" | "agreement-project";
  conversion?: string;
}) {
  const glyph = direction === "right" ? "→" : direction === "down" ? "↓" : "←";
  return (
    <div className={`entity-funnel-arrow entity-funnel-arrow-${area}`} aria-hidden="true">
      <span className="entity-funnel-arrow-glyph">{glyph}</span>
      {conversion && <span className="entity-funnel-arrow-badge">{conversion}</span>}
    </div>
  );
}
