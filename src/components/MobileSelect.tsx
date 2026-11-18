import { useEffect, useId, useRef, useState } from "react";

export interface MobileSelectOption {
  value: string;
  label: string;
}

/** Mobile dropdown that opens as a list directly below (or, near the bottom
 * of the screen, above) its trigger -- unlike a native <select>, which hands
 * off to the OS picker and opens mid-screen. Styles live in
 * `src/mobile/mobile-system.css` (`.m-select*`). */
export default function MobileSelect({
  value,
  options,
  onChange,
  disabled,
  placeholder = "Select",
  ariaLabel,
  compact,
}: {
  value: string;
  options: MobileSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  /** Smaller trigger for use inside cards. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDown(e: Event) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (disabled) return;
    if (!open && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      // Leave room for the floating bottom tab bar (~90px) plus the list.
      const listHeight = Math.min(260, options.length * 44 + 12);
      setOpenUp(window.innerHeight - rect.bottom < listHeight + 100 && rect.top > listHeight);
    }
    setOpen((o) => !o);
  }

  return (
    <div className={`m-select${compact ? " compact" : ""}${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="m-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={toggle}
      >
        <span className={`m-select-value${current ? "" : " placeholder"}`}>{current?.label ?? placeholder}</span>
        <svg className="m-select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul id={listId} className={`m-select-list${openUp ? " up" : ""}`} role="listbox">
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                className={o.value === value ? "selected" : ""}
                onClick={() => {
                  setOpen(false);
                  if (o.value !== value) onChange(o.value);
                }}
              >
                <span>{o.label}</span>
                {o.value === value && <span aria-hidden="true">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
