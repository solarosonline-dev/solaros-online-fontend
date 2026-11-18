// Explicit inverter wiring: the designer adds inverters and connects grids to
// them (Inverters & wiring step), instead of the old single global inverter
// choice that assignSiteToInverters (gridInverterAssignment.ts) auto-packed.
//
// Two site-level lists describe the whole design:
//   inverters: DesignInverter[]  - each with its own spec (mixed models are fine)
//   links:     InverterLink[]    - "grid G feeds inverter I with N panels"
// Everything electrical (strings, MPPT usage, DC:AC, warnings, the SLD) is
// derived from those two by evaluateSite() below - nothing is stored twice.
//
// The string/MPPT maths is reused as-is from stringSizing.ts and
// gridInverterAssignment.ts. assignSiteToInverters survives as the optional
// "Auto-assign" seed (autoAssignWiring) and as the one-time migration for
// designs saved before explicit inverters existed.
import { sizeStrings } from './stringSizing.js';
import { splitIntoStrings, assignSiteToInverters } from './gridInverterAssignment.js';

export interface InverterSpec {
  make: string;
  model: string;
  acPowerKw: number;
  maxDcVoltage: number;
  mpptCount: number;
  maxCurrentPerMppt: number;
  mpptVoltageMin: number;
  mpptVoltageMax: number;
  maxAcCurrent: number;
  acVoltage: number;
  phase: number;
}

export interface DesignInverter {
  // Unique and stable; also the number shown to the user (INV-<id>).
  id: number;
  spec: InverterSpec;
  // Reserved for the physical placement phase (wall edge / ground point).
  mount?: any;
}

export interface InverterLink {
  gridKey: string;
  inverterId: number;
  // 'all' = every panel of the grid that no numeric link claims (so the link
  // follows the grid if its panel count changes); a number = exactly that
  // many panels (a split across inverters).
  panels: 'all' | number;
}

// A grid as the wiring sees it - see siteGridsFromRoofs.
export interface SiteGrid {
  key: string;
  label: string;
  panelCount: number;
  // The grid's panel ids in layout order (what panel ownership is keyed on).
  panelIds: any[];
  // The grid's panels by row (same slope-local row, ordered along it): what
  // suggested assignment keeps together. x/y are the panel centres in plan.
  rows: { id: any; x: number; y: number }[][];
  centroid: { x: number; y: number } | null;
}

export interface WiringIssue {
  level: 'error' | 'warning';
  message: string;
  gridKey?: string;
}

// Fixed defaults for now (not per-design settings).
export const DC_AC_LOW = 0.9;
export const DC_AC_HIGH = 1.3;
export const MAX_POOLING_DISTANCE_M = 25;

export function gridKeyOf(roofId: any, gridId: any) {
  return `${roofId}:${gridId}`;
}

// Panels grouped into rows (equal rackY, the same test the delete-row tool
// uses), each row ordered along itself by rackX, rows ordered by rackY. A
// resolved (rotated) position is used for x/y so distances match the plan.
function rowsOfGrid(grid: any) {
  const byRow = new Map<string, any[]>();
  (grid.panels ?? []).forEach((p) => {
    const k = String(Math.round((p.rackY ?? 0) * 1e4));
    byRow.set(k, [...(byRow.get(k) ?? []), p]);
  });
  return [...byRow.values()]
    .sort((a, b) => (a[0].rackY ?? 0) - (b[0].rackY ?? 0))
    .map((row) => row.sort((a, b) => (a.rackX ?? 0) - (b.rackX ?? 0)).map((p) => ({ id: p.id, x: p.x, y: p.y })));
}

// The grids that carry panels, in the same site-wide plan coordinates as the
// canvas. Used by evaluateSite, Auto-assign and the legacy-design migration.
export function siteGridsFromRoofs(roofs: any[]): SiteGrid[] {
  const grids: SiteGrid[] = [];
  roofs.forEach((roof, roofIdx) => {
    roof.grids.forEach((grid, gridIdx) => {
      if (!(grid.count > 0)) return;
      const pts = grid.footprintPolygon;
      const centroid = pts && pts.length > 0
        ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }
        : null;
      grids.push({
        key: gridKeyOf(roof.id, grid.id),
        label: `${roof.label || `Roof ${roofIdx + 1}`} · Grid ${gridIdx + 1}`,
        panelCount: grid.count,
        panelIds: (grid.panels ?? []).map((p) => p.id),
        rows: rowsOfGrid(grid),
        centroid,
      });
    });
  });
  return grids;
}

// How many panels of one grid each of its links carries. Numeric links take
// what they ask for (clamped to what's left); the first 'all' link takes the
// remainder; any further 'all' links get nothing. Panels no link claims are
// the grid's "unconnected" remainder.
export function resolveGridLinks(panelCount: number, links: InverterLink[]) {
  let remaining = panelCount;
  const counts = new Map<InverterLink, number>();
  let oversubscribed = false;
  links.forEach((l) => {
    if (l.panels === 'all') return;
    const want = Math.max(0, Math.floor(l.panels));
    const n = Math.min(want, remaining);
    if (n < want) oversubscribed = true;
    counts.set(l, n);
    remaining -= n;
  });
  let remainderTaken = false;
  links.forEach((l) => {
    if (l.panels !== 'all') return;
    if (!remainderTaken) { counts.set(l, remaining); remaining = 0; remainderTaken = true; } else counts.set(l, 0);
  });
  return { counts, unconnected: remaining, oversubscribed };
}

// Packs a grid's strings onto MPPT inputs using the fewest inputs, with
// equal-length strings together: strings paralleled on one input must run at
// one voltage, so a 20-module string next to a 19 loses energy, and equal
// ones lose none. Full inputs of each length first, then what is left over
// (closest lengths adjacent). The input count is exactly ceil(n / max), same
// as packing blindly.
export function groupStringsForMppt(strings: number[], maxPerChannel: number): number[][] {
  const byLen = new Map<number, number>();
  strings.forEach((l) => byLen.set(l, (byLen.get(l) ?? 0) + 1));
  const groups: number[][] = [];
  const rest: number[] = [];
  [...byLen.entries()].sort((a, b) => b[0] - a[0]).forEach(([len, n]) => {
    const full = Math.floor(n / maxPerChannel);
    for (let i = 0; i < full; i++) groups.push(Array(maxPerChannel).fill(len));
    for (let i = 0; i < n - full * maxPerChannel; i++) rest.push(len);
  });
  for (let i = 0; i < rest.length; i += maxPerChannel) groups.push(rest.slice(i, i + maxPerChannel));
  return groups;
}

export function evaluateInverter(
  inverter: DesignInverter,
  entriesIn: { grid: SiteGrid; panels: number }[],
  { module, designMinTempC, designMaxTempC, mpptVoltageUtilizationPct = 100 }: any,
) {
  const spec = inverter.spec;
  const issues: WiringIssue[] = [];
  const sizing = sizeStrings(module, spec, designMinTempC, designMaxTempC, mpptVoltageUtilizationPct);
  const entries: any[] = [];
  let dcKw = 0;
  let channelsUsed = 0;

  if (!sizing.valid) {
    issues.push({ level: 'error', message: 'No valid string configuration for this module, inverter and temperature combination.' });
  }

  entriesIn.forEach(({ grid, panels }) => {
    if (panels <= 0) return;
    const entryDcKw = (panels * module.wattage) / 1000;
    dcKw += entryDcKw;
    if (!sizing.valid) {
      entries.push({ gridKey: grid.key, gridLabel: grid.label, panels, strings: [], channels: [], dcKw: entryDcKw, centroid: grid.centroid });
      return;
    }
    const strings = splitIntoStrings(panels, sizing.minModulesPerString, sizing.maxModulesPerString);
    if (!strings) {
      issues.push({
        level: 'error',
        gridKey: grid.key,
        message: `${grid.label}: ${panels} panels can't form a valid string (needs ${sizing.minModulesPerString}–${sizing.maxModulesPerString} modules per string).`,
      });
      entries.push({ gridKey: grid.key, gridLabel: grid.label, panels, strings: [], channels: [], dcKw: entryDcKw, centroid: grid.centroid });
      return;
    }
    const channelsNeeded = Math.ceil(strings.length / sizing.maxStringsPerMppt);
    channelsUsed += channelsNeeded;
    const channels = groupStringsForMppt(strings, sizing.maxStringsPerMppt);
    entries.push({ gridKey: grid.key, gridLabel: grid.label, panels, strings, channels, dcKw: entryDcKw, centroid: grid.centroid });
  });

  // Spare MPPT inputs are free: use them to keep unequal strings apart
  // before settling for a mismatch (an input with one string loses nothing).
  if (sizing.valid && channelsUsed <= spec.mpptCount) {
    let spare = spec.mpptCount - channelsUsed;
    entries.forEach((en) => {
      const regrouped: number[][] = [];
      en.channels.forEach((grp: number[]) => {
        const distinct = [...new Set(grp)];
        if (distinct.length > 1 && spare >= distinct.length - 1) {
          distinct.forEach((len) => regrouped.push(grp.filter((l) => l === len)));
          spare -= distinct.length - 1;
          channelsUsed += distinct.length - 1;
        } else regrouped.push(grp);
      });
      en.channels = regrouped;
    });
  }
  entries.forEach((en) => {
    if (en.channels.some((c: number[]) => new Set(c).size > 1)) {
      issues.push({ level: 'warning', gridKey: en.gridKey, message: `${en.gridLabel}: strings of different lengths share an MPPT input, which costs some energy.` });
    }
  });

  if (sizing.valid && channelsUsed > spec.mpptCount) {
    issues.push({ level: 'error', message: `Needs ${channelsUsed} MPPT inputs but this inverter has ${spec.mpptCount}.` });
  }

  const acKw = spec.acPowerKw;
  const dcAcRatio = acKw > 0 ? dcKw / acKw : 0;
  if (dcKw > 0 && acKw > 0) {
    if (dcAcRatio > DC_AC_HIGH) issues.push({ level: 'warning', message: `DC:AC ratio ${dcAcRatio.toFixed(2)} is high (above ${DC_AC_HIGH}); the inverter will clip at peak sun.` });
    else if (dcAcRatio < DC_AC_LOW) issues.push({ level: 'warning', message: `DC:AC ratio ${dcAcRatio.toFixed(2)} is low (below ${DC_AC_LOW}); the inverter is under-used.` });
  }

  // Grids this inverter pools that sit far apart need long DC runs.
  let farthest = 0;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i].centroid, b = entries[j].centroid;
      if (a && b) farthest = Math.max(farthest, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  if (farthest > MAX_POOLING_DISTANCE_M) {
    issues.push({ level: 'warning', message: `Connected grids are up to ${farthest.toFixed(0)} m apart (over ${MAX_POOLING_DISTANCE_M} m), so DC cable runs will be long.` });
  }

  const hasError = issues.some((i) => i.level === 'error');
  const status = entries.length === 0 ? 'idle' : hasError ? 'error' : issues.length > 0 ? 'warning' : 'ok';
  return {
    id: inverter.id,
    spec,
    sizing,
    entries,
    dcKw,
    acKw,
    dcAcRatio,
    mpptUsed: channelsUsed,
    mpptTotal: spec.mpptCount,
    issues,
    status,
  };
}

// The whole site: every inverter evaluated, plus which grids still have
// panels no inverter carries. The result keeps the shape the SLD already
// consumed ({ inverters: [{ id, dcKw, entries: [{ gridKey, gridLabel,
// strings, channels }] }], perGrid }) so SldView needs only per-inverter
// specs on top.
export function evaluateSite({ inverters, links, grids, module, designMinTempC, designMaxTempC, mpptVoltageUtilizationPct = 100 }: {
  inverters: DesignInverter[];
  links: InverterLink[];
  grids: SiteGrid[];
  module: any;
  designMinTempC: number;
  designMaxTempC: number;
  mpptVoltageUtilizationPct?: number;
}) {
  const gridByKey = new Map(grids.map((g) => [g.key, g]));
  const inverterById = new Map(inverters.map((i) => [i.id, i]));
  // Links to a grid or inverter that no longer exists are ignored (and left
  // in place, so undoing the deletion brings them back).
  const live = links.filter((l) => gridByKey.has(l.gridKey) && inverterById.has(l.inverterId));

  const linksByGrid = new Map<string, InverterLink[]>();
  live.forEach((l) => linksByGrid.set(l.gridKey, [...(linksByGrid.get(l.gridKey) ?? []), l]));

  const panelsByLink = new Map<InverterLink, number>();
  const gridInfo = new Map<string, { unconnected: number; oversubscribed: boolean }>();
  grids.forEach((g) => {
    const { counts, unconnected, oversubscribed } = resolveGridLinks(g.panelCount, linksByGrid.get(g.key) ?? []);
    counts.forEach((n, l) => panelsByLink.set(l, n));
    gridInfo.set(g.key, { unconnected, oversubscribed });
  });

  const evaluated = inverters.map((inv) => {
    const entriesIn = live
      .filter((l) => l.inverterId === inv.id)
      .map((l) => ({ grid: gridByKey.get(l.gridKey)!, panels: panelsByLink.get(l) ?? 0 }));
    const ev = evaluateInverter(inv, entriesIn, { module, designMinTempC, designMaxTempC, mpptVoltageUtilizationPct });
    return ev;
  });

  const perGrid = grids.map((g) => {
    const info = gridInfo.get(g.key)!;
    const inverterIds = evaluated.filter((e) => e.entries.some((en) => en.gridKey === g.key)).map((e) => e.id);
    const errs = evaluated.flatMap((e) => e.issues.filter((i) => i.level === 'error' && i.gridKey === g.key));
    const connected = g.panelCount - info.unconnected;
    return {
      key: g.key,
      label: g.label,
      panelCount: g.panelCount,
      connected,
      unconnected: info.unconnected,
      oversubscribed: info.oversubscribed,
      inverterIds,
      valid: errs.length === 0,
      reason: errs[0]?.message,
    };
  });

  const unconnected = perGrid.filter((g) => g.unconnected > 0);
  const errorCount = evaluated.reduce((s, e) => s + e.issues.filter((i) => i.level === 'error').length, 0);
  const warningCount = evaluated.reduce((s, e) => s + e.issues.filter((i) => i.level === 'warning').length, 0);
  const totalDcKw = evaluated.reduce((s, e) => s + e.dcKw, 0);
  const totalAcKw = evaluated.reduce((s, e) => s + e.acKw, 0);

  return {
    valid: errorCount === 0 && unconnected.length === 0,
    inverters: evaluated,
    perGrid,
    unconnected,
    unconnectedPanels: unconnected.reduce((s, g) => s + g.unconnected, 0),
    errorCount,
    warningCount,
    totalDcKw,
    totalAcKw,
  };
}

export type SitePlan = ReturnType<typeof evaluateSite>;

// Seeds inverters and links from the old auto-packing algorithm: the
// "Auto-assign" button, and the one-time conversion of designs saved before
// explicit inverters existed. `failures` lists grids it could not place
// (they simply stay unconnected).
export function autoAssignWiring({ grids, module, spec, designMinTempC, designMaxTempC, targetDcAcRatio, mpptVoltageUtilizationPct = 100 }: {
  grids: SiteGrid[];
  module: any;
  spec: InverterSpec;
  designMinTempC: number;
  designMaxTempC: number;
  targetDcAcRatio: number;
  mpptVoltageUtilizationPct?: number;
}): { inverters: DesignInverter[]; links: InverterLink[]; failures: { label: string; reason: string }[] } {
  if (grids.length === 0) return { inverters: [], links: [], failures: [] };
  const plan: any = assignSiteToInverters({
    grids, module, inverter: spec, designMinTempC, designMaxTempC, targetDcAcRatio, mpptVoltageUtilizationPct,
  });
  const failures = plan.perGrid.filter((g) => !g.valid).map((g) => ({ label: g.label, reason: g.reason }));
  const inverters: DesignInverter[] = plan.inverters.map((_inv, i) => ({ id: i + 1, spec: { ...spec } }));
  const links: InverterLink[] = [];
  const panelsOf = (entry) => entry.strings.reduce((s, n) => s + n, 0);
  const grouped = new Map<string, { inverterId: number; panels: number }[]>();
  plan.inverters.forEach((inv, i) => {
    inv.entries.forEach((entry) => {
      grouped.set(entry.gridKey, [...(grouped.get(entry.gridKey) ?? []), { inverterId: i + 1, panels: panelsOf(entry) }]);
    });
  });
  grouped.forEach((parts, gridKey) => {
    if (parts.length === 1) {
      links.push({ gridKey, inverterId: parts[0].inverterId, panels: 'all' });
    } else {
      // Split grid: exact counts, with the last link as the remainder so the
      // sum can't drift from the grid's panel count.
      parts.forEach((p, idx) => links.push({ gridKey, inverterId: p.inverterId, panels: idx === parts.length - 1 ? 'all' : p.panels }));
    }
  });
  return { inverters, links, failures };
}

// "2 × Deye SUN-50K-G04, 1 × …" - inverters grouped by model for the SLD,
// the report and the cost step.
export function groupInverters(inverters: { spec: InverterSpec }[]) {
  const groups = new Map<string, { spec: InverterSpec; count: number }>();
  inverters.forEach(({ spec }) => {
    const key = [spec.make, spec.model, spec.acPowerKw, spec.maxDcVoltage, spec.mpptCount, spec.maxCurrentPerMppt, spec.mpptVoltageMin, spec.mpptVoltageMax].join('|');
    const g = groups.get(key);
    if (g) g.count += 1; else groups.set(key, { spec, count: 1 });
  });
  return [...groups.values()];
}

export function inverterLabel(spec: InverterSpec) {
  return `${spec.make && spec.make !== 'Custom' ? `${spec.make} ` : ''}${spec.model || `${spec.acPowerKw} kW custom`}`.trim();
}

// ---- Pure edit helpers (the Inverters & wiring panel's mutations) ----

export function addInverters(inverters: DesignInverter[], spec: InverterSpec, quantity: number): DesignInverter[] {
  let nextId = inverters.reduce((m, i) => Math.max(m, i.id), 0) + 1;
  const added: DesignInverter[] = [];
  for (let i = 0; i < quantity; i++) added.push({ id: nextId++, spec: { ...spec } });
  return [...inverters, ...added];
}

// ---- Panel ownership ----
//
// Which inverter each individual panel feeds. This is the stored truth
// (`panelOwners`, keyed `${gridKey}#${panelId}`); the grid -> inverter
// counts evaluateSite() works from are derived from it (linksFromOwners), so
// "N panels of this grid go to INV-2" is just how many panels INV-2 owns.
// A panel with no entry belongs to no inverter yet.
export type PanelOwners = Record<string, number>;

export const panelKey = (gridKey: string, panelId: any) => `${gridKey}#${panelId}`;

// A distinct colour per inverter (the badge, the card, and its panels share
// it). Cycles after ten.
export const INVERTER_COLORS = ['#2f6fed', '#e8590c', '#2b9348', '#9c36b5', '#d6336c', '#0c8599', '#b08900', '#5c7cfa', '#a61e4d', '#37b24d'];
export const inverterColor = (id: number) => INVERTER_COLORS[(((id - 1) % INVERTER_COLORS.length) + INVERTER_COLORS.length) % INVERTER_COLORS.length];

// Per (grid, inverter) panel counts, as numeric links - the shape
// evaluateSite and the placement code take.
export function linksFromOwners(grids: SiteGrid[], owners: PanelOwners, inverters: DesignInverter[]): InverterLink[] {
  const live = new Set(inverters.map((i) => i.id));
  const links: InverterLink[] = [];
  grids.forEach((g) => {
    const counts = new Map<number, number>();
    g.panelIds.forEach((pid) => {
      const o = owners[panelKey(g.key, pid)];
      if (o != null && live.has(o)) counts.set(o, (counts.get(o) ?? 0) + 1);
    });
    [...counts.entries()].sort((a, b) => a[0] - b[0]).forEach(([inverterId, panels]) => links.push({ gridKey: g.key, inverterId, panels }));
  });
  return links;
}

// Designs saved with count-based links get owners once, on load: each
// grid's panels are handed out in layout order, link by link.
export function ownersFromLinks(grids: SiteGrid[], links: InverterLink[]): PanelOwners {
  const owners: PanelOwners = {};
  grids.forEach((g) => {
    const mine = links.filter((l) => l.gridKey === g.key);
    const { counts } = resolveGridLinks(g.panelCount, mine);
    let next = 0;
    mine.forEach((l) => {
      const n = counts.get(l) ?? 0;
      for (let k = 0; k < n && next < g.panelIds.length; k++) owners[panelKey(g.key, g.panelIds[next++])] = l.inverterId;
    });
  });
  return owners;
}

export function assignPanels(owners: PanelOwners, keys: Iterable<string>, inverterId: number): PanelOwners {
  const next = { ...owners };
  for (const k of keys) next[k] = inverterId;
  return next;
}

export function unassignPanels(owners: PanelOwners, keys: Iterable<string>): PanelOwners {
  const next = { ...owners };
  for (const k of keys) delete next[k];
  return next;
}

export function removeInverterFromOwners(owners: PanelOwners, inverterId: number): PanelOwners {
  const next: PanelOwners = {};
  Object.entries(owners).forEach(([k, v]) => { if (v !== inverterId) next[k] = v; });
  return next;
}

// Connects a grid to an inverter: its not-yet-connected panels when it has
// any, otherwise (it is fully wired elsewhere) every panel - i.e. moves it.
export function connectGrid(owners: PanelOwners, grid: SiteGrid, inverterId: number): PanelOwners {
  const free = grid.panelIds.filter((pid) => owners[panelKey(grid.key, pid)] == null);
  const keys = (free.length > 0 ? free : grid.panelIds).map((pid) => panelKey(grid.key, pid));
  return assignPanels(owners, keys, inverterId);
}

export function disconnectGridFromInverter(owners: PanelOwners, grid: SiteGrid, inverterId: number): PanelOwners {
  return unassignPanels(owners, grid.panelIds.map((pid) => panelKey(grid.key, pid)).filter((k) => owners[k] === inverterId));
}

// Makes the inverter own exactly `n` panels of the grid (the count editor,
// for phones where panels can't be picked on a canvas): adds from the free
// ones first, then from other inverters, in layout order; releases from the
// end when lowering.
export function setGridPanelCount(owners: PanelOwners, grid: SiteGrid, inverterId: number, n: number): PanelOwners {
  const keys = grid.panelIds.map((pid) => panelKey(grid.key, pid));
  const mine = keys.filter((k) => owners[k] === inverterId);
  const want = Math.max(0, Math.min(Math.floor(n), keys.length));
  const next = { ...owners };
  if (want < mine.length) {
    mine.slice(want).forEach((k) => { delete next[k]; });
    return next;
  }
  let need = want - mine.length;
  for (const k of keys.filter((x) => owners[x] == null)) { if (need <= 0) break; next[k] = inverterId; need--; }
  for (const k of keys.filter((x) => owners[x] != null && owners[x] !== inverterId)) { if (need <= 0) break; next[k] = inverterId; need--; }
  return next;
}

// Drops owners for panels or inverters that no longer exist.
export function pruneOwners(owners: PanelOwners, grids: SiteGrid[], inverters: DesignInverter[]): PanelOwners {
  const valid = new Set<string>();
  grids.forEach((g) => g.panelIds.forEach((pid) => valid.add(panelKey(g.key, pid))));
  const live = new Set(inverters.map((i) => i.id));
  const next: PanelOwners = {};
  Object.entries(owners).forEach(([k, v]) => { if (valid.has(k) && live.has(v)) next[k] = v; });
  return next;
}

// "Suggested assignment": connects panels that have no inverter yet to the
// inverters already on the site - never adding inverters, never moving a panel
// that already has one.
//
// It plans in whole strings along rows, the way a string is actually wired:
//   1. each row's free panels are cut into strings the inverter can take (a
//      row too short for one string is chained with the next row's panels);
//   2. a whole row goes to one inverter when one can take it, else string by
//      string - preferring the inverter that took the previous string, then
//      the nearest by position;
//   3. an inverter takes a string only if it still has MPPT inputs for it
//      (counted per grid, as evaluateSite does) and DC:AC headroom.
// What does not fit, or cannot form valid strings, comes back in `unplaced`.
export function suggestAssignment({ inverters, owners, grids, module, designMinTempC, designMaxTempC, mpptVoltageUtilizationPct = 100, positions }: {
  inverters: DesignInverter[];
  owners: PanelOwners;
  grids: SiteGrid[];
  module: any;
  designMinTempC: number;
  designMaxTempC: number;
  mpptVoltageUtilizationPct?: number;
  // Where each inverter physically is (plan x/y), for "nearest".
  positions?: Map<number, { x: number; y: number }>;
}): { owners: PanelOwners; assigned: number; wholeRows: number; splitRows: number; unplaced: { label: string; panels: number; reason: string }[] } {
  const next = { ...owners };
  const unplaced: { label: string; panels: number; reason: string }[] = [];
  let assigned = 0, wholeRows = 0, splitRows = 0;

  // Per-inverter running state, seeded from what is already connected.
  const links = linksFromOwners(grids, owners, inverters);
  const state = inverters.map((inv) => {
    const sizing = sizeStrings(module, inv.spec, designMinTempC, designMaxTempC, mpptVoltageUtilizationPct);
    const counts = new Map<string, number>();
    let dcKw = 0;
    links.filter((l) => l.inverterId === inv.id).forEach((l) => {
      const n = typeof l.panels === 'number' ? l.panels : 0;
      counts.set(l.gridKey, n);
      dcKw += (n * module.wattage) / 1000;
    });
    return { inv, sizing, counts, dcKw };
  });

  const stringsFor = (st: (typeof state)[number], n: number) => (n <= 0 ? 0 : (splitIntoStrings(n, st.sizing.minModulesPerString, st.sizing.maxModulesPerString)?.length ?? Infinity));
  const channelsFor = (st: (typeof state)[number], counts: Map<string, number>) => {
    let total = 0;
    for (const n of counts.values()) {
      const k = stringsFor(st, n);
      if (!Number.isFinite(k)) return Infinity;
      total += Math.ceil(k / st.sizing.maxStringsPerMppt);
    }
    return total;
  };
  const canAdd = (st: (typeof state)[number], gridKey: string, n: number) => {
    if (!st.sizing.valid) return false;
    const counts = new Map(st.counts);
    counts.set(gridKey, (counts.get(gridKey) ?? 0) + n);
    if (channelsFor(st, counts) > st.inv.spec.mpptCount) return false;
    return st.dcKw + (n * module.wattage) / 1000 <= st.inv.spec.acPowerKw * DC_AC_HIGH + 1e-9;
  };
  const commit = (st: (typeof state)[number], g: SiteGrid, ids: any[]) => {
    ids.forEach((id) => { next[panelKey(g.key, id)] = st.inv.id; });
    st.counts.set(g.key, (st.counts.get(g.key) ?? 0) + ids.length);
    st.dcKw += (ids.length * module.wattage) / 1000;
    assigned += ids.length;
  };

  const distTo = (st: (typeof state)[number], at: { x: number; y: number }) => {
    const pos = positions?.get(st.inv.id);
    if (pos) return Math.hypot(pos.x - at.x, pos.y - at.y);
    const cs = [...st.counts.keys()].map((k) => grids.find((g) => g.key === k)?.centroid).filter(Boolean) as { x: number; y: number }[];
    return cs.length > 0 ? Math.min(...cs.map((c) => Math.hypot(c.x - at.x, c.y - at.y))) : 12;
  };
  // Inverters in order of preference for something at `at`: the one that took
  // the previous piece of this grid first (keeps a grid's rows together),
  // then nearest.
  const ranked = (at: { x: number; y: number }, preferId: number | null) =>
    [...state].sort((a, b) => (Number(b.inv.id === preferId) - Number(a.inv.id === preferId)) || (distTo(a, at) - distTo(b, at)));

  // Longest string any inverter takes is the cut length for planning; each
  // string is then re-balanced by evaluateSite from counts, so only validity
  // matters here.
  const refSizing = state.find((st) => st.sizing.valid)?.sizing;
  if (!refSizing) {
    grids.forEach((g) => {
      const n = g.panelIds.filter((pid) => next[panelKey(g.key, pid)] == null).length;
      if (n > 0) unplaced.push({ label: g.label, panels: n, reason: 'no inverter has a valid string configuration for this module' });
    });
    return { owners: next, assigned, wholeRows, splitRows, unplaced };
  }

  [...grids].sort((a, b) => b.panelCount - a.panelCount).forEach((g) => {
    let lastInv: number | null = null;
    let chain: { id: any; x: number; y: number }[] = [];
    let chainRows = 0;
    const flushPlace = (strings: { id: any; x: number; y: number }[][], rowCount: number) => {
      const all = strings.flat();
      const at = { x: all.reduce((s, p) => s + p.x, 0) / all.length, y: all.reduce((s, p) => s + p.y, 0) / all.length };
      const order = ranked(at, lastInv);
      // Whole row (or chained rows) on one inverter if it fits...
      const whole = order.find((st) => canAdd(st, g.key, all.length));
      if (whole) {
        commit(whole, g, all.map((p) => p.id));
        lastInv = whole.inv.id;
        wholeRows += rowCount;
        return;
      }
      // ...else string by string.
      splitRows += rowCount;
      strings.forEach((str) => {
        const sat = { x: str.reduce((s, p) => s + p.x, 0) / str.length, y: str.reduce((s, p) => s + p.y, 0) / str.length };
        const st = ranked(sat, lastInv).find((c) => canAdd(c, g.key, str.length));
        if (st) { commit(st, g, str.map((p) => p.id)); lastInv = st.inv.id; }
        else unplaced.push({ label: g.label, panels: str.length, reason: 'no inverter has MPPT inputs or DC:AC room left for it' });
      });
    };
    const cut = (panels: { id: any; x: number; y: number }[]) => {
      const lens = splitIntoStrings(panels.length, refSizing.minModulesPerString, refSizing.maxModulesPerString);
      if (!lens) return null;
      const out: { id: any; x: number; y: number }[][] = [];
      let at = 0;
      lens.forEach((n) => { out.push(panels.slice(at, at + n)); at += n; });
      return out;
    };

    g.rows.forEach((row) => {
      // Break the row where a panel already has an inverter.
      const runs: { id: any; x: number; y: number }[][] = [];
      let run: { id: any; x: number; y: number }[] = [];
      row.forEach((p) => {
        if (next[panelKey(g.key, p.id)] == null) run.push(p);
        else if (run.length) { runs.push(run); run = []; }
      });
      if (run.length) runs.push(run);

      runs.forEach((r) => {
        const candidate = chain.length > 0 ? [...chain, ...r] : r;
        const strings = cut(candidate);
        if (strings) {
          flushPlace(strings, chain.length > 0 ? chainRows + 1 : 1);
          chain = []; chainRows = 0;
        } else {
          // Too few panels for a valid string on their own: carry them into
          // the next run/row.
          chain = candidate; chainRows += 1;
        }
      });
    });
    if (chain.length > 0) {
      unplaced.push({ label: g.label, panels: chain.length, reason: `${chain.length} leftover panels can't form a valid string (needs ${refSizing.minModulesPerString}–${refSizing.maxModulesPerString} per string)` });
    }
  });

  // One line per (grid, reason) rather than one per string.
  const merged: typeof unplaced = [];
  unplaced.forEach((u) => {
    const hit = merged.find((m) => m.label === u.label && m.reason === u.reason);
    if (hit) hit.panels += u.panels; else merged.push({ ...u });
  });
  return { owners: next, assigned, wholeRows, splitRows, unplaced: merged };
}
