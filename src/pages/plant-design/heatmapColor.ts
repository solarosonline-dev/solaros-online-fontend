// The one heatmap gradient shared by Shadow analysis (roof-wide sun
// exposure) and Efficiency view (per-panel annual output) - in both the 2D
// plan (PlantDesignEditor.tsx) and the 3D view (Scene3D.tsx), so every
// heatmap in the module reads the same: blue (worst) through to red (best).

// Where `pct` (0-100) sits along the gradient, 0..1 - the cube described
// in sunExposureColor. HeatmapLegend places its % ticks with it, so a tick
// sits exactly where that value's color is.
export function heatmapPosition(pct) {
  return (Math.max(0, Math.min(100, pct)) / 100) ** 3;
}

// Classic blue (least sun) -> cyan -> green -> yellow -> orange -> red
// (most) "jet" scale, matching how dedicated insolation-analysis tools
// (PVsyst, Sefaira, Ladybug...) usually show this exact kind of map -
// red reads as "hottest"/most exposed far more intuitively than yellow
// ever did, and six stops spread real variation across visibly distinct
// colors instead of one smooth blend between two.
const SUN_EXPOSURE_STOPS = [
  [0, 20, 130], [0, 190, 220], [40, 200, 90], [255, 230, 20], [255, 140, 0], [214, 30, 30],
];
export function sunExposureColor(pct) {
  // A real obstacle's worst annual impact - even one that's tall, wide,
  // and close - still routinely lands in the 60-90% range at a low
  // latitude like this (see this feature's own history: the sun sits
  // high overhead most of the year here, so shadows are short for most
  // of it even from a substantial obstacle). Cubing first pulls that
  // same practically-relevant range much further toward the low end of
  // the scale before mapping to a color, so a genuine (if not total)
  // reduction actually lands somewhere visibly distinct (green/yellow
  // territory) instead of every real case bunching up in red - still
  // reaching pure red at 100% and pure blue at 0%, unchanged.
  const t = heatmapPosition(pct);
  const segments = SUN_EXPOSURE_STOPS.length - 1;
  const scaled = t * segments;
  const i = Math.min(segments - 1, Math.floor(scaled));
  const localT = scaled - i;
  const a = SUN_EXPOSURE_STOPS[i], b = SUN_EXPOSURE_STOPS[i + 1];
  const rgb = a.map((c, k) => Math.round(c + (b[k] - c) * localT));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}
