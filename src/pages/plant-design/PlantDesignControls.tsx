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

// A `<input type="range">` paired with a plain number box, kept in sync -
// dragging the slider updates the number box and vice versa. `min`/`max`
// only bound the *slider* thumb, not the value itself: the number box
// still accepts anything, the slider just pins to whichever end is closer
// when the real value falls outside its own range, rather than the two
// controls disagreeing or one silently clamping the other.
//
// `value`/`onChange`/`min`/`max`/`step` are always in meters when `unit`
// is given (a length field) - conversion to/from the display unit happens
// entirely inside this component (both the slider's own range and the
// number box), so callers never juggle units themselves. Omit `unit` (or
// pass 'm') for a non-length field (wattage, degrees, a fraction, %) -
// the app-wide meter/feet toggle shouldn't touch those.
export function SliderInput({ value, onChange, min, max, step = 1, disabled = false, numberWidth = 70, unit = 'm' }: any) {
  const numeric = Number.isFinite(value) ? value : 0;
  const isFeet = unit === 'ft';
  const toDisplay = (m: any) => (isFeet ? metersToFeet(m) : m);
  const toMeters = (d: any) => (isFeet ? feetToMeters(d) : d);
  const displayMin = min !== undefined ? toDisplay(min) : undefined;
  const displayMax = max !== undefined ? toDisplay(max) : undefined;
  const displayStep = isFeet ? step * 3.28084 : step;
  const displayValue = toDisplay(numeric);
  const sliderDisplayValue = Math.min(
    displayMax ?? Infinity,
    Math.max(displayMin ?? -Infinity, displayValue)
  );

  const handleNumberChange = (e: any) => {
    const valStr = e.target.value;
    if (valStr === '') return;
    let val = +valStr;
    if (isNaN(val)) return;
    if (displayMin !== undefined && val < displayMin) {
      val = displayMin;
    }
    if (displayMax !== undefined && val > displayMax) {
      val = displayMax;
    }
    onChange(toMeters(val));
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
      <input
        type="range" min={displayMin} max={displayMax} step={displayStep} value={sliderDisplayValue} disabled={disabled}
        onChange={(e) => onChange(toMeters(+e.target.value))}
        style={{ flex: 1, minWidth: 0 }}
      />
      <input
        type="number" min={displayMin} max={displayMax} step={displayStep} value={isFeet ? +displayValue.toFixed(2) : value} disabled={disabled}
        onChange={handleNumberChange}
        className="pde-slider-num"
        style={{ width: numberWidth, flexShrink: 0 }}
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
