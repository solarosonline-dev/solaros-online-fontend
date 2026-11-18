import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface SearchableOption {
  value: string;
  label: string;
}

/** Type-to-search dropdown for long lists (e.g. hundreds of agents). Closed, it
 * shows the selected label (or the placeholder) and fills the width it's given;
 * open, the same field becomes a search input over a scrollable list that
 * opens below (or above, near the screen bottom). Styles: `.m-ss*` in
 * `src/mobile/mobile-system.css`. */
export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Search…",
  ariaLabel,
}: {
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: Event) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function openList() {
    if (open) return;
    if (rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      setOpenUp(window.innerHeight - rect.bottom < 320 && rect.top > 320);
    }
    setOpen(true);
  }

  function select(v: string) {
    close();
    inputRef.current?.blur();
    if (v !== value) onChange(v);
  }

  return (
    <div className={`m-ss${open ? " open" : ""}${current ? " has-value" : ""}`} ref={rootRef}>
      <input
        ref={inputRef}
        className="m-ss-input"
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        autoComplete="off"
        enterKeyHint="search"
        placeholder={current && !open ? current.label : placeholder}
        value={open ? query : current?.label ?? ""}
        onFocus={openList}
        onClick={openList}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) openList();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered.length === 1) {
            e.preventDefault();
            select(filtered[0].value);
          }
        }}
      />
      <svg className="m-ss-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
      {open && (
        <ul id={listId} className={`m-ss-list${openUp ? " up" : ""}`} role="listbox">
          {filtered.length === 0 ? (
            <li className="m-ss-empty">No match</li>
          ) : (
            filtered.map((o) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button type="button" className={o.value === value ? "selected" : ""} onClick={() => select(o.value)}>
                  <span>{o.label}</span>
                  {o.value === value && <span aria-hidden="true">✓</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
