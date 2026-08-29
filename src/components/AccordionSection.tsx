import type { ReactNode } from "react";

/** One collapsible panel in a single-open-at-a-time accordion -- clicking an
 * already-open section's header collapses it, clicking a closed one opens it
 * and implicitly closes whichever section was previously open. The caller
 * owns that exclusivity via `open`/`onToggle` (typically one `openSection`
 * state variable); this component just renders one panel. Shared by
 * QuoteBuilderPage.tsx and AgreementBuilderPage.tsx -- both rely on the
 * `quote-accordion-*` CSS classes from QuoteBuilderPage.css, which the
 * caller is responsible for importing. */
export default function AccordionSection<T extends string>({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: T;
  title: string;
  open: boolean;
  onToggle: (id: T) => void;
  children: ReactNode;
}) {
  return (
    <div className={`quote-accordion-section${open ? " open" : ""}`}>
      <button type="button" className="quote-accordion-toggle" aria-expanded={open} onClick={() => onToggle(id)}>
        <span className="quote-section-label">{title}</span>
        <span className="quote-accordion-icon" aria-hidden="true" />
      </button>
      {open && <div className="quote-accordion-body">{children}</div>}
    </div>
  );
}
