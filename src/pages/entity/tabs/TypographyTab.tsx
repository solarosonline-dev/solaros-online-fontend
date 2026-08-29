import type { Typography } from "../../../api/entityPreferences";

type Props = {
  draft: Typography;
  onChange: (draft: Typography) => void;
};

type SizeField = { key: keyof Typography; label: string; min: number; max: number };

// Headings are free-text (no number-input spinner) so an admin can type or
// paste any px value directly -- the min/max range is still enforced, just
// on blur instead of via the browser's native number-input constraints.
const HEADING_FIELDS: SizeField[] = [
  { key: "h1_font_size", label: "H1 size", min: 20, max: 40 },
  { key: "h2_font_size", label: "H2 size", min: 20, max: 35 },
  { key: "h3_font_size", label: "H3 size", min: 14, max: 22 },
];

// Unchanged -- still plain number inputs with the browser's own min/max.
const BODY_SIZE_FIELDS: SizeField[] = [
  { key: "body_font_size", label: "Body size", min: 12, max: 20 },
  { key: "small_font_size", label: "Small size", min: 10, max: 16 },
];

function px(value: string): number {
  return parseInt(value, 10) || 0;
}

// Strips the trailing "px" for display without round-tripping through
// parseInt -- px("") is 0, which would render a stuck "0" in the field
// (and swallow every further backspace) once the admin clears it, instead
// of leaving it genuinely empty while they retype.
function digitsOnly(value: string): string {
  return value.replace(/px$/, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function TypographyTab({ draft, onChange }: Props) {
  return (
    <div>
      {HEADING_FIELDS.map((f) => (
        <div className="entity-field" key={f.key}>
          <label htmlFor={f.key}>
            {f.label}{" "}
            <span className="entity-field-help">
              (px, {f.min}-{f.max})
            </span>
          </label>
          <input
            id={f.key}
            type="text"
            inputMode="numeric"
            value={digitsOnly(draft[f.key])}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "");
              if (!digits) {
                // Let the field go genuinely empty while backspacing --
                // storing "0" here is what caused the stuck-zero bug.
                onChange({ ...draft, [f.key]: "" });
                return;
              }
              // Cap to the max in real time (not just on blur) so typing a
              // value above the allowed range can't land at all -- the min
              // is still only enforced on blur, since a value typed so far
              // (e.g. a single leading digit) is often transiently below it.
              const capped = Math.min(f.max, parseInt(digits, 10));
              onChange({ ...draft, [f.key]: `${capped}px` });
            }}
            onBlur={(e) => {
              const clamped = clamp(px(e.target.value) || f.min, f.min, f.max);
              onChange({ ...draft, [f.key]: `${clamped}px` });
            }}
          />
        </div>
      ))}

      {BODY_SIZE_FIELDS.map((f) => (
        <div className="entity-field" key={f.key}>
          <label htmlFor={f.key}>
            {f.label} <span className="entity-field-help">(px)</span>
          </label>
          <input
            id={f.key}
            type="number"
            min={f.min}
            max={f.max}
            value={px(draft[f.key])}
            onChange={(e) => onChange({ ...draft, [f.key]: `${e.target.value}px` })}
          />
        </div>
      ))}

      <div className="entity-panel" style={{ marginTop: 20 }}>
        <div style={{ fontSize: draft.h1_font_size, fontWeight: 700 }}>H1 preview text</div>
        <div style={{ fontSize: draft.h2_font_size, fontWeight: 600 }}>H2 preview text</div>
        <div style={{ fontSize: draft.h3_font_size, fontWeight: 600 }}>H3 preview text</div>
        <div style={{ fontSize: draft.body_font_size }}>Body preview text</div>
        <div style={{ fontSize: draft.small_font_size, color: "var(--app-text-muted)" }}>Small preview text</div>
      </div>
    </div>
  );
}
