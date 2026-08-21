import { useState, type KeyboardEvent } from "react";
import type { DocumentCustomization } from "../../../api/entityPreferences";

type Props = {
  draft: DocumentCustomization;
  onChange: (draft: DocumentCustomization) => void;
};

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
  const [newItem, setNewItem] = useState("");

  function handleAdd() {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    onChange([...value, trimmed]);
    setNewItem("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  function handleRemove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="entity-field" style={{ maxWidth: "100%" }}>
      <label htmlFor={id}>
        {label} <span className="entity-field-help">{help}</span>
      </label>

      {value.length > 0 && (
        <ul className="entity-line-list">
          {value.map((item, i) => (
            <li key={i}>
              <span>{item}</span>
              <button type="button" className="entity-line-remove" onClick={() => handleRemove(i)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="entity-line-add-row">
        <input
          id={id}
          type="text"
          placeholder="Type a line and press Add"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="entity-btn" onClick={handleAdd}>
          + Add
        </button>
      </div>
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
        help="one clause per line — used as the default for new quotes/agreements"
        value={draft.custom_terms_and_conditions}
        onChange={(v) => onChange({ ...draft, custom_terms_and_conditions: v })}
      />
    </div>
  );
}
