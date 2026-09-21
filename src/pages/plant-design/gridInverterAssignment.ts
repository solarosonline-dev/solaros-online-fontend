// Packs a grid's panels into strings, and strings into inverters/MPPTs,
// building on stringSizing.js. See the "Grid -> inverter assignment" bullet
// of the electrical design phase in ROADMAP.md for the rules this follows:
// strings never cross grids, each grid gets its own dedicated inverter(s)
// sized to its own panel count, and an oversized grid spans multiple
// inverters. Pooling several small grids onto one inverter's spare MPPT
// channels is handled by assignSiteToInverters below, layered on top of
// this per-grid function.
import { sizeStrings } from './stringSizing.js';

// Balanced string split: as few strings as possible, each within
// [minPerString, maxPerString], differing from each other by at most one
// module. Returns null if `count` can't be split this way at all (e.g.
// count is smaller than minPerString).
export function splitIntoStrings(count, minPerString, maxPerString) {
  if (count <= 0) return [];
  if (maxPerString <= 0 || minPerString > maxPerString) return null;
  const numStrings = Math.max(1, Math.ceil(count / maxPerString));
  const base = Math.floor(count / numStrings);
  if (base < minPerString) return null;
  const remainder = count % numStrings;
  let strings: any[] = [];
  for (let i = 0; i < numStrings; i++) strings.push(base + (i < remainder ? 1 : 0));
  return strings;
}

// Spreads `strings` (an array of string lengths) across up to `mpptCount`
// channels, each capped at `maxPerChannel` strings, as evenly as possible -
// returning one array per channel *actually used* (never a trailing empty
// channel), each holding that channel's string lengths. Returns null if it
// doesn't fit at all.
//
// Sorts descending and slices contiguous runs (rather than round-robin by
// original order) so that a channel taking more than one string always
// gets same-or-closest-length ones - paralleling strings of different
// lengths on one MPPT input drags the shorter (lower-voltage) string's
// operating point down and costs real energy, so it's worth avoiding
// whenever the split allows it. Uses as many channels as available (not
// the bare minimum to fit) since spreading further is free - an unused
// MPPT costs nothing - and every extra channel is one more chance for
// every string on it to end up alone rather than paired with a mismatch.
export function distributeAcrossMppts(strings, mpptCount, maxPerChannel) {
  const numStrings = strings.length;
  if (numStrings === 0) return [];
  if (numStrings > mpptCount * maxPerChannel) return null;
  const channelsUsed = Math.min(mpptCount, numStrings);
  const sorted = [...strings].sort((a, b) => b - a);
  const base = Math.floor(numStrings / channelsUsed);
  const remainder = numStrings % channelsUsed;
  let groups: any[] = [];
  let idx = 0;
  for (let i = 0; i < channelsUsed; i++) {
    const count = base + (i < remainder ? 1 : 0);
    groups.push(sorted.slice(idx, idx + count));
    idx += count;
  }
  return groups;
}

// Full assignment for one grid: how many inverters it needs, and each
// inverter's strings/MPPT layout. `targetDcAcRatio` (DC kWp / AC kW) steers
// how many inverters get used before MPPT capacity alone would force more.
export function assignGridToInverters({ panelCount, module, inverter, designMinTempC, designMaxTempC, targetDcAcRatio, mpptVoltageUtilizationPct = 100 }) {
  const sizing = sizeStrings(module, inverter, designMinTempC, designMaxTempC, mpptVoltageUtilizationPct);
  if (!sizing.valid) return { valid: false, reason: 'No valid string configuration for this module/inverter/temperature combination.' };
  if (!(panelCount > 0)) return { valid: false, reason: 'No panels in this grid.' };

  const totalDcKw = (panelCount * module.wattage) / 1000;
  const numInvertersByPower = Math.max(1, Math.ceil(totalDcKw / (inverter.acPowerKw * targetDcAcRatio)));
  const numInvertersByCapacity = Math.max(1, Math.ceil(panelCount / sizing.maxModulesPerInverter));
  const numInverters = Math.max(numInvertersByPower, numInvertersByCapacity);

  const base = Math.floor(panelCount / numInverters);
  const remainder = panelCount % numInverters;
  let inverters: any[] = [];
  for (let i = 0; i < numInverters; i++) {
    const panelsHere = base + (i < remainder ? 1 : 0);
    const strings = splitIntoStrings(panelsHere, sizing.minModulesPerString, sizing.maxModulesPerString);
    if (!strings) return { valid: false, reason: `Inverter ${i + 1} of ${numInverters} can't form a valid string configuration for ${panelsHere} modules - try a different module/inverter pairing.` };
    const mpptChannels = distributeAcrossMppts(strings, inverter.mpptCount, sizing.maxStringsPerMppt);
    if (!mpptChannels) return { valid: false, reason: `Inverter ${i + 1} of ${numInverters} needs ${strings.length} strings, more than its ${inverter.mpptCount} MPPTs × ${sizing.maxStringsPerMppt} strings/MPPT can take.` };
    inverters.push({ panelCount: panelsHere, dcKw: (panelsHere * module.wattage) / 1000, strings, mpptChannels });
  }

  return {
    valid: true,
    sizing,
    numInverters,
    totalDcKw,
    totalAcKw: numInverters * inverter.acPowerKw,
    dcAcRatio: totalDcKw / (numInverters * inverter.acPowerKw),
    inverters,
  };
}

// Distance between two grid centroids. Missing centroid data (e.g. a
// caller that doesn't track physical position) reads as "no preference"
// (0) rather than "infinitely far" - so pooling still works, just without
// the proximity preference below, instead of refusing to ever pool.
function distance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Farthest pair of member centroids between two clusters (complete-linkage)
// - deliberately the max, not the min: single-linkage (nearest pair) lets a
// chain of moderately-spaced grids smuggle two genuinely distant ones onto
// the same inverter (grid C 19m from B, B 6m from A, so A+B..C even though
// A is 25m+ from C). Complete-linkage instead requires *every* member of
// the merged cluster to be within maxPoolingDistanceM of every other,
// which is what "physically close enough to share one inverter" means.
function clusterDistance(a, b) {
  let max = 0;
  a.members.forEach((ga) => b.members.forEach((gb) => {
    const d = distance(ga.centroid, gb.centroid);
    if (d > max) max = d;
  }));
  return max;
}

// How far apart two grids' centroids (in the same units as those
// centroids - meters, for this app) can be and still land on a shared
// inverter. Without a cap, capacity-driven merging will happily wire
// together two roof faces on opposite sides of a site just because doing
// so saves an inverter - distance needs to be able to *veto* a merge, not
// just prioritize among options that were going to happen anyway. 25m is
// a reasonable "still one DC combiner run" default; tune per site if a
// caller needs to.
const DEFAULT_MAX_POOLING_DISTANCE_M = 25;

// Site-wide packing across every grid: a grid that needs more than one
// inverter on its own (by MPPT capacity or by the DC:AC ratio target) still
// gets dedicated inverter(s) via assignGridToInverters above. A grid that
// fits within a *single* inverter's spare capacity is instead pooled with
// other such grids by greedy capacity-constrained clustering: repeatedly
// merge whichever two groups are physically closest (each grid's
// `centroid`, in the same site-wide coordinate space as everything else),
// as long as their combined MPPT-channel need still fits one inverter AND
// they're within `maxPoolingDistanceM` of each other - so pooling never
// wires together two roof faces that happen to balance well on paper but
// sit far apart in reality; a grid too far from every other small grid
// just gets its own dedicated inverter instead of pooling. Ties (including
// "no proximity data at all") break toward the smaller combined group,
// which is what keeps five equal small grids needing two inverters landing
// 3-and-2 instead of 4-and-1.
export function assignSiteToInverters({ grids, module, inverter, designMinTempC, designMaxTempC, targetDcAcRatio, maxPoolingDistanceM = DEFAULT_MAX_POOLING_DISTANCE_M, mpptVoltageUtilizationPct = 100 }) {
  const sizing = sizeStrings(module, inverter, designMinTempC, designMaxTempC, mpptVoltageUtilizationPct);
  let perGrid: any[] = [];
  if (!sizing.valid) {
    grids.forEach((g) => perGrid.push({ ...g, valid: false, reason: 'No valid string configuration for this module/inverter/temperature combination.' }));
    return { valid: false, sizing, perGrid, inverters: [] };
  }

  let bigGrids: any[] = [];
  let smallGrids: any[] = [];
  grids.forEach((g) => {
    if (!(g.panelCount > 0)) return;
    const strings = splitIntoStrings(g.panelCount, sizing.minModulesPerString, sizing.maxModulesPerString);
    if (!strings) {
      perGrid.push({ ...g, valid: false, reason: `${g.panelCount} panels can't form a valid string for this module/inverter/temperature combination.` });
      return;
    }
    const channelsNeeded = Math.ceil(strings.length / sizing.maxStringsPerMppt);
    const dcKw = (g.panelCount * module.wattage) / 1000;
    const numInvertersByPower = Math.max(1, Math.ceil(dcKw / (inverter.acPowerKw * targetDcAcRatio)));
    const rec = { ...g, strings, channelsNeeded, dcKw };
    if (channelsNeeded <= inverter.mpptCount && numInvertersByPower <= 1) smallGrids.push(rec);
    else bigGrids.push(rec);
  });

  let inverters: any[] = [];

  bigGrids.forEach((g) => {
    const assignment = assignGridToInverters({ panelCount: g.panelCount, module, inverter, designMinTempC, designMaxTempC, targetDcAcRatio, mpptVoltageUtilizationPct });
    if (!assignment.valid) {
      perGrid.push({ ...g, valid: false, reason: assignment.reason });
      return;
    }
    let inverterIds: any[] = [];
    assignment.inverters!.forEach((inv) => {
      const id = inverters.length + 1;
      inverterIds.push(id);
      // inv.mpptChannels was already computed with these same inputs inside
      // assignGridToInverters above - reuse it rather than redoing the work.
      inverters.push({ id, dcKw: inv.dcKw, entries: [{ gridKey: g.key, gridLabel: g.label, strings: inv.strings, channels: inv.mpptChannels }] });
    });
    perGrid.push({ ...g, valid: true, pooled: false, inverterIds });
  });

  const clusters = smallGrids.map((g) => ({ members: [g], channels: g.channelsNeeded }));
  for (;;) {
    let bestI = -1;
    let bestJ = -1;
    let bestDist = Infinity;
    let bestCombined = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const combined = clusters[i].channels + clusters[j].channels;
        if (combined > inverter.mpptCount) continue;
        const d = clusterDistance(clusters[i], clusters[j]);
        if (d > maxPoolingDistanceM) continue;
        if (d < bestDist || (d === bestDist && combined < bestCombined)) {
          bestDist = d; bestCombined = combined; bestI = i; bestJ = j;
        }
      }
    }
    if (bestI === -1) break; // no remaining pair both fits one inverter and is close enough
    clusters[bestI].members.push(...clusters[bestJ].members);
    clusters[bestI].channels += clusters[bestJ].channels;
    clusters.splice(bestJ, 1);
  }

  clusters.forEach((cluster) => {
    const id = inverters.length + 1;
    const entries = cluster.members.map((g) => ({
      gridKey: g.key, gridLabel: g.label, strings: g.strings,
      channels: distributeAcrossMppts(g.strings, g.channelsNeeded, sizing.maxStringsPerMppt),
      dcKw: g.dcKw, centroid: g.centroid,
    }));
    inverters.push({ id, dcKw: entries.reduce((s, e) => s + e.dcKw, 0), entries });
    cluster.members.forEach((g) => perGrid.push({ ...g, valid: true, pooled: cluster.members.length > 1, inverterIds: [id] }));
  });

  return { valid: perGrid.every((g) => g.valid), sizing, perGrid, inverters };
}
