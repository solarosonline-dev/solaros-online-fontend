import type { Typography } from "../../../api/entityPreferences";

type Props = {
  draft: Typography;
  onChange: (draft: Typography) => void;
};

const SIZE_FIELDS: { key: keyof Typography; label: string; min: number; max: number }[] = [
  { key: "h1_font_size", label: "H1 size", min: 20, max: 40 },
  { key: "h2_font_size", label: "H2 size", min: 16, max: 32 },
  { key: "h3_font_size", label: "H3 size", min: 14, max: 28 },
  { key: "body_font_size", label: "Body size", min: 12, max: 20 },
  { key: "small_font_size", label: "Small size", min: 10, max: 16 },
];

function px(value: string): number {
  return parseInt(value, 10) || 0;
}

export default function TypographyTab({ draft, onChange }: Props) {
  return (
    <div>
      {SIZE_FIELDS.map((f) => (
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
