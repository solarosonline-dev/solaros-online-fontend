/** Shared helpers for the mobile agent / EPC pages. */
export function stageBadgeClass(stage: string, terminal: string): string {
  if (stage === "REJECTED") return "m-badge danger";
  if (stage === terminal) return "m-badge success";
  if (stage === "NEW") return "m-badge";
  return "m-badge info";
}

export function stageLabel(stage: string): string {
  return stage.replace(/_/g, " ");
}
