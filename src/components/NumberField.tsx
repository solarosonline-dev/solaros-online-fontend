import { useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  /** Called with the parsed number whenever the box holds a valid number. */
  onCommit: (value: number) => void;
  /**
   * What an empty box means once the user leaves it. Omit to snap back to the
   * last committed value; pass a number (usually 0) to commit that instead.
   */
  emptyValue?: number;
};

/**
 * A numeric input that can be cleared and retyped freely.
 *
 * The usual `value={n} onChange={e => set(Number(e.target.value))}` pattern
 * turns an empty box into `0` on every keystroke, so a stuck "0" is left in
 * the field and the next digits land after it. This keeps the text the user
 * is typing in local state and only reports a number upward when the text
 * parses to one; an empty (or half-typed, like "-" or "1.") box simply isn't
 * committed until it's valid again. On blur the box shows the committed value
 * (or commits `emptyValue` if the field was left empty).
 */
export default function NumberField({ value, onCommit, emptyValue, onBlur, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (Number.isFinite(value) ? String(value) : "");

  return (
    <input
      {...rest}
      type="number"
      inputMode={rest.inputMode ?? "decimal"}
      value={shown}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        // A type=number box reports "" for empty *and* for half-typed text.
        if (raw.trim() === "") return;
        const n = Number(raw);
        if (Number.isFinite(n)) onCommit(n);
      }}
      onBlur={(e) => {
        if (draft !== null && draft.trim() === "" && emptyValue !== undefined) onCommit(emptyValue);
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}
