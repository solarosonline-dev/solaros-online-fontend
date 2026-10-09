// Small shared UI primitives used by both the Configuration step
// (PlantDesignEditor.tsx) and any other step that wants the exact same
// look - e.g. SLD view's own on-page inverter/DC:AC/voltage-utilization
// controls (see SldView.tsx). Pulled out here (rather than duplicated)
// so the two stay pixel-identical and a future style tweak only needs
// one edit. Both rely on the "pde-*" classes from PlantDesignEditor.css,
// which is already loaded by the time either renders (SldView only ever
// mounts as a child of PlantDesignEditor).

import { useState } from 'react';

// Display-layer only - every roof/panel/obstacle field and every
// calculation stays in meters internally (see AGENTS.md). `unit` in
// SliderInput below is the *display* unit ('m' | 'ft'); the value passed
// in/out of it is always meters.
const METERS_PER_FOOT = 1 / 3.28084;
export function metersToFeet(m) {
  return m * 3.28084;
}
export function feetToMeters(ft) {
  return ft * METERS_PER_FOOT;
}

export function CollapsibleSection({ title, defaultOpen = false, open: openProp, onToggle, children }: any) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  // Controlled when the parent passes `open` (used to auto-collapse/expand
  // steps as the user progresses through the workflow) — otherwise each
  // section just tracks its own toggle state as before.
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : internalOpen;
  const toggle = () => (controlled ? onToggle?.(!open) : setInternalOpen((o) => !o));
  return (
    <div className="pde-section">
      <div
        onClick={toggle}
        className={`pde-section-header${open ? ' pde-section-open' : ''}`}
      >
        <span>{title}</span>
        <span className="pde-section-caret">{open ? '▾' : '▸'}</span>
      </div>
      {open && children}
    </div>
  );
}

// Feet-mode display helpers. The stored/internal values stay in meters, so a
// converted cap or step lands on an awkward number (500 m -> 1640.42 ft,
// 0.1 m -> 0.33 ft). These pick a clean nearby number instead - the caps are
// safety limits, not exact physical constants, so a few percent either way
// doesn't matter.
const NICE_MANTISSAS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];
function niceNumber(v: number) {
  if (!(v > 0)) return v;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / pow;
  let best = NICE_MANTISSAS[0];
  for (const c of NICE_MANTISSAS) if (Math.abs(c - m) < Math.abs(best - m)) best = c;
  return +(best * pow).toPrecision(6);
}
const NICE_FEET_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5];
function niceFeetStep(v: number) {
  let best = NICE_FEET_STEPS[0];
  for (const c of NICE_FEET_STEPS) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  return best;
}

// A `<input type="range">` paired with a numeric text box, kept in sync -
// dragging the slider updates the box and vice versa. `min`/`max` bound the
// *slider thumb* only: the box accepts values above `max` up to `hardMax` (the
// thumb just pins to the end and the slider dims, so it's clear it no longer
// shows the real value). Dragging a dimmed slider snaps the value back into range.
//
// The lower bound (`min`) is always enforced, committed on blur. Fields whose
// upper bound is a real domain limit (an angle, a 0-1 fraction, a height tied
// to another field) pass `hardMax`, which clamps the box too. Every caller
// should set it; if one doesn't, it defaults to 10x `max`.
//
// The box is a text input (not type="number") so there are no spinner arrows
// and the width can grow with the digits; keystrokes that aren't part of a
// number are dropped, and ArrowUp/ArrowDown still step by `step`. While the
// box is focused it edits a local draft string, so the field can be cleared
// and retyped; valid in-bounds drafts commit live (the design updates as you
// type), and blur/Enter normalizes the text to the committed value.
//
// `value`/`onChange`/`min`/`max`/`hardMax`/`step` are always in meters when
// `unit` is given (a length field) - conversion to/from the display unit
// happens entirely inside this component, so callers never juggle units
// themselves. Omit `unit` (or pass 'm') for a non-length field (wattage,
// degrees, a fraction, %) - the app-wide meter/feet toggle shouldn't touch
// those.
export function SliderInput({ value, onChange, min, max, hardMax, exactCap = false, step = 1, disabled = false, numberWidth = 70, unit = 'm' }: any) {
  const [draft, setDraft] = useState<string | null>(null);
  const numeric = Number.isFinite(value) ? value : 0;
  const isFeet = unit === 'ft';
  const toDisplay = (m: any) => (isFeet ? metersToFeet(m) : m);
  const toMeters = (d: any) => (isFeet ? feetToMeters(d) : d);
  const displayMin = min !== undefined ? toDisplay(min) : undefined;
  // Safety net for a caller that forgot `hardMax`: 10x the slider's range.
  const effectiveHardMax = hardMax ?? (max > 0 ? max * 10 : undefined);
  const rawDisplayMax = max !== undefined ? toDisplay(max) : undefined;
  const rawDisplayHardMax = effectiveHardMax !== undefined ? toDisplay(effectiveHardMax) : undefined;
  // In feet, round the *caps* to clean numbers - unless `exactCap` says the
  // cap is a real constraint (trunk <= 90% of tree height, flush-mount height).
  const displayMax = isFeet && !exactCap && rawDisplayMax !== undefined ? niceNumber(rawDisplayMax) : rawDisplayMax;
  const displayHardMax = isFeet && !exactCap && rawDisplayHardMax !== undefined
    ? Math.max(niceNumber(rawDisplayHardMax), displayMax ?? 0)
    : rawDisplayHardMax;
  const displayStep = isFeet ? niceFeetStep(step * 3.28084) : step;
  // The range input snaps to min + n*step, so in feet start it on a clean
  // multiple of the step; the real lower bound (displayMin) still applies to
  // the number box.
  const sliderMin = isFeet && displayMin !== undefined ? Math.ceil(displayMin / displayStep - 1e-9) * displayStep : displayMin;
  const displayValue = toDisplay(numeric);
  const sliderDisplayValue = Math.min(
    displayMax ?? Infinity,
    Math.max(sliderMin ?? -Infinity, displayValue)
  );
  const outOfRange = sliderDisplayValue !== displayValue;
  const allowNegative = displayMin === undefined || displayMin < 0;
  const committedText = String(isFeet ? +displayValue.toFixed(2) : value);
  const text = draft ?? committedText;

  const clamp = (v: number) => {
    if (displayMin !== undefined && v < displayMin) v = displayMin;
    if (displayHardMax !== undefined && v > displayHardMax) v = displayHardMax;
    return v;
  };

  const handleTextChange = (e: any) => {
    const raw = e.target.value;
    const pattern = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
    if (!pattern.test(raw)) return;
    setDraft(raw);
    const val = parseFloat(raw);
    if (!Number.isFinite(val)) return;
    // Don't commit while below the lower bound or above a hard cap - that
    // would fight the user mid-keystroke (typing "5" toward 500 with min
    // 100); blur snaps it into bounds instead.
    if (displayMin !== undefined && val < displayMin) return;
    if (displayHardMax !== undefined && val > displayHardMax) return;
    onChange(toMeters(val));
  };

  const commitOnBlur = () => {
    if (draft !== null) {
      const val = parseFloat(draft);
      if (Number.isFinite(val)) {
        const clamped = clamp(val);
        if (clamped !== displayValue) onChange(toMeters(clamped));
      }
    }
    setDraft(null);
  };

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const base = draft !== null && Number.isFinite(parseFloat(draft)) ? parseFloat(draft) : displayValue;
      // Snap to the next/previous multiple of the step, so an off-grid value
      // (e.g. 10.33 ft) lands on 10.5 rather than 10.58.
      const q = base / displayStep;
      const next = clamp(+((e.key === 'ArrowUp' ? Math.floor(q + 1e-9) + 1 : Math.ceil(q - 1e-9) - 1) * displayStep).toFixed(4));
      setDraft(String(next));
      onChange(toMeters(next));
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
      <input
        type="range" min={sliderMin} max={displayMax} step={displayStep} value={sliderDisplayValue} disabled={disabled}
        onChange={(e) => { setDraft(null); onChange(toMeters(+e.target.value)); }}
        className={outOfRange ? 'pde-slider-out-of-range' : undefined}
        style={{ flex: 1, minWidth: 0 }}
      />
      <input
        type="text" inputMode="decimal" autoComplete="off" value={text} disabled={disabled}
        onChange={handleTextChange}
        onBlur={commitOnBlur}
        onFocus={(e) => e.target.select()}
        onKeyDown={handleKeyDown}
        className="pde-slider-num"
        style={{ width: Math.max(numberWidth, text.length * 8 + 14), maxWidth: '60%', flexShrink: 0 }}
      />
    </div>
  );
}

// Small "ⓘ" explainer next to a label - shows `text` in a bubble on hover
// (desktop) or tap (mobile, where there's no hover; a second tap or
// blurring away closes it).
export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`pde-info-tip${open ? ' open' : ''}`}>
      <button
        type="button"
        className="pde-info-tip-btn"
        aria-label="More info"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >ⓘ</button>
      <span className="pde-info-tip-bubble" role="tooltip">{text}</span>
    </span>
  );
}
