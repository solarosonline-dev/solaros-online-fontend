import type { DocumentCustomization } from "../../../api/entityPreferences";

type Props = {
  draft: DocumentCustomization;
  onChange: (draft: DocumentCustomization) => void;
};

function toArray(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function LineListField({
  id,
  label,
  help,
  value,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="entity-field" style={{ maxWidth: "100%" }}>
      <label htmlFor={id}>
        {label} <span className="entity-field-help">{help}</span>
      </label>
      <textarea
        id={id}
        rows={5}
        value={value.join("\n")}
        onChange={(e) => onChange(toArray(e.target.value))}
      />
    </div>
  );
}

export default function DocumentsTab({ draft, onChange }: Props) {
  return (
    <div>
      <LineListField
        id="quote_notes"
        label="Quote notes"
        help="one note per line"
        value={draft.quote_notes}
        onChange={(v) => onChange({ ...draft, quote_notes: v })}
      />
      <LineListField
        id="agreement_notes"
        label="Agreement notes"
        help="one note per line"
        value={draft.agreement_notes}
        onChange={(v) => onChange({ ...draft, agreement_notes: v })}
      />
      <LineListField
        id="custom_terms_and_conditions"
        label="Custom terms & conditions"
        help="one clause per line — used as the default for new quotes"
        value={draft.custom_terms_and_conditions}
        onChange={(v) => onChange({ ...draft, custom_terms_and_conditions: v })}
      />
    </div>
  );
}
