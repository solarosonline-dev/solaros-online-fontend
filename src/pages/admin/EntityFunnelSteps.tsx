import type { ReactNode } from "react";

// Replaces the old EntityFunnelGrid's clockwise 2x2 quadrant layout (Leads ->
// Quotes -> Agreements -> Projects, right/down/left, with Work orders as a
// separate full-width row below). That layout paired stages with very
// different amounts of content into the same grid row (e.g. the compact
// Leads card sat beside the much taller Quotes card, which held a donut
// chart, a tile row, AND a segment bar) -- the grid row stretched to the
// tallest cell, leaving the shorter stage floating in a mostly-empty card
// with an oddly-placed arrow. A single-row stepper with every stage holding
// the same amount of content (one hero number + a couple of small tiles,
// nothing compositional) keeps every card the same shape. Anything
// compositional (charts, unit economics) moved to its own section below the
// stepper in EntityDashboardPage.tsx.

export type StepArea = "lead" | "quote" | "agreement" | "project" | "workorder";

export function EntityStepperRow({ children }: { children: ReactNode }) {
  return <div className="entity-stepper-row">{children}</div>;
}

export function EntityStepperStage({
  title,
  area,
  children,
}: {
  title: string;
  area: StepArea;
  children: ReactNode;
}) {
  return (
    <div className={`entity-stepper-stage entity-stepper-stage-${area}`}>
      <h2>{title}</h2>
      <div className="entity-stepper-body">{children}</div>
    </div>
  );
}

export function EntityStepperArrow({ conversion }: { conversion?: string }) {
  return (
    <div className="entity-stepper-arrow" aria-hidden="true">
      <span className="entity-stepper-arrow-glyph">→</span>
      {conversion && <span className="entity-stepper-arrow-badge">{conversion}</span>}
    </div>
  );
}
