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
import { splitIntoStrings, distributeAcrossMppts, assignSiteToInverters } from './gridInverterAssignment.js';

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
    const channels = distributeAcrossMppts(strings, channelsNeeded, sizing.maxStringsPerMppt) ?? [];
    if (channels.some((c) => new Set(c).size > 1)) {
      issues.push({ level: 'warning', gridKey: grid.key, message: `${grid.label}: strings of different lengths share an MPPT input, which costs some energy.` });
    }
    entries.push({ gridKey: grid.key, gridLabel: grid.label, panels, strings, channels, dcKw: entryDcKw, centroid: grid.centroid });
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

export function removeInverter(inverters: DesignInverter[], links: InverterLink[], id: number) {
  return { inverters: inverters.filter((i) => i.id !== id), links: links.filter((l) => l.inverterId !== id) };
}

export function disconnectGrid(links: InverterLink[], inverterId: number, gridKey: string) {
  return links.filter((l) => !(l.inverterId === inverterId && l.gridKey === gridKey));
}

// Sets how many of `gridPanels` the (grid, inverter) link carries, creating
// the link if needed. Panels come out of the grid's other links as needed:
// an 'all' link shrinks on its own (it is the remainder); numeric links are
// trimmed from the last backwards when nothing is left over. A count equal to
// the whole grid becomes a plain 'all' link and drops the grid's other links.
export function setLinkPanels(links: InverterLink[], gridKey: string, inverterId: number, gridPanels: number, desired: number): InverterLink[] {
  const n = Math.max(0, Math.min(Math.floor(desired), gridPanels));
  if (n === 0) return disconnectGrid(links, inverterId, gridKey);
  if (n === gridPanels) return [...links.filter((l) => l.gridKey !== gridKey), { gridKey, inverterId, panels: 'all' }];

  const others = links.filter((l) => l.gridKey === gridKey && l.inverterId !== inverterId);
  const rest = links.filter((l) => l.gridKey !== gridKey);
  const hasAll = others.some((l) => l.panels === 'all');
  let adjusted = others.map((l) => ({ ...l }));
  if (!hasAll) {
    // Every other link is numeric - make room by trimming from the end, and
    // let the last survivor become the remainder ('all') if nothing else is.
    let free = gridPanels - adjusted.reduce((s, l) => s + (l.panels as number), 0);
    let need = n - Math.max(0, free);
    for (let i = adjusted.length - 1; i >= 0 && need > 0; i--) {
      const cut = Math.min(need, adjusted[i].panels as number);
      adjusted[i].panels = (adjusted[i].panels as number) - cut;
      need -= cut;
    }
    adjusted = adjusted.filter((l) => l.panels !== 0);
  }
  return [...rest, ...adjusted, { gridKey, inverterId, panels: n }];
}

// Auto-assign when inverters already exist: connect the grids that still
// have unconnected panels to the inverters already on the site, never
// touching existing connections and never adding inverters. Each grid goes to
// the nearest inverter (by centroid; an empty one counts as 12 m away) that
// still has MPPT inputs and DC:AC headroom, as many panels as fit there; the
// rest goes to the next nearest. What nothing can take comes back in
// `unplaced` so the UI can say "add another inverter".
export function fillExistingInverters({ inverters, links, grids, module, designMinTempC, designMaxTempC, mpptVoltageUtilizationPct = 100, balance = false }: {
  inverters: DesignInverter[];
  links: InverterLink[];
  grids: SiteGrid[];
  module: any;
  designMinTempC: number;
  designMaxTempC: number;
  mpptVoltageUtilizationPct?: number;
  // Re-balance mode (run from empty links): spread load instead of filling
  // the nearest inverter first - least-used inverter within pooling distance
  // first, preferring one that takes the whole grid.
  balance?: boolean;
}): { links: InverterLink[]; connectedPanels: number; unplaced: { label: string; panels: number }[] } {
  const inputs = { inverters, grids, module, designMinTempC, designMaxTempC, mpptVoltageUtilizationPct };
  const evalNow = (l: InverterLink[]) => evaluateSite({ ...inputs, links: l });
  let current = links;
  let connectedPanels = 0;
  const unplaced: { label: string; panels: number }[] = [];

  const start = evalNow(current);
  const order = start.perGrid.filter((g) => g.unconnected > 0).sort((a, b) => b.unconnected - a.unconnected);

  for (const g of order) {
    const grid = grids.find((x) => x.key === g.key)!;
    let remaining = g.unconnected;
    const tried = new Set<number>();
    while (remaining > 0) {
      const plan = evalNow(current);
      const candidates = plan.inverters
        .filter((ev) => !tried.has(ev.id) && ev.sizing.valid && ev.status !== 'error')
        .map((ev) => {
          const dists = ev.entries.map((e) => (e.centroid && grid.centroid ? Math.hypot(e.centroid.x - grid.centroid.x, e.centroid.y - grid.centroid.y) : 0));
          return { ev, dist: dists.length > 0 ? Math.min(...dists) : 12, load: ev.acKw > 0 ? ev.dcKw / ev.acKw : Infinity };
        })
        .sort((a, b) => {
          if (!balance) return a.dist - b.dist;
          const aFar = a.dist > MAX_POOLING_DISTANCE_M, bFar = b.dist > MAX_POOLING_DISTANCE_M;
          if (aFar !== bFar) return aFar ? 1 : -1;
          return a.load - b.load || a.dist - b.dist;
        });
      // How many of the remaining panels this inverter can take.
      const fits = (ev: any) => {
        const spareChannels = ev.mpptTotal - ev.mpptUsed;
        const maxDcKw = ev.acKw * DC_AC_HIGH - ev.dcKw;
        let n = Math.min(remaining, Math.floor((maxDcKw * 1000) / module.wattage));
        for (; n > 0; n--) {
          const strings = splitIntoStrings(n, ev.sizing.minModulesPerString, ev.sizing.maxModulesPerString);
          // A partial fill must not strand a remainder too small to string.
          if (strings && Math.ceil(strings.length / ev.sizing.maxStringsPerMppt) <= spareChannels
            && (n === remaining || remaining - n >= ev.sizing.minModulesPerString)) break;
        }
        return Math.max(0, n);
      };
      let pick: { ev: any; n: number } | null = null;
      for (const { ev } of candidates) {
        const n = fits(ev);
        if (n <= 0) { tried.add(ev.id); continue; }
        if (!balance) { pick = { ev, n }; break; }
        if (n === remaining) { pick = { ev, n }; break; }
        if (!pick || n > pick.n) pick = { ev, n };
      }
      let placed = false;
      if (pick) {
        const already = pick.ev.entries.find((e) => e.gridKey === g.key)?.panels ?? 0;
        current = setLinkPanels(current, g.key, pick.ev.id, grid.panelCount, already + pick.n);
        remaining -= pick.n;
        connectedPanels += pick.n;
        tried.add(pick.ev.id);
        placed = true;
      }
      if (!placed) break;
    }
    if (remaining > 0) unplaced.push({ label: g.label, panels: remaining });
  }
  return { links: current, connectedPanels, unplaced };
}
