import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Full-screen "add / edit" form for the mobile experience. Covers the whole
 * viewport (header with back arrow + title, scrolling body, sticky footer for
 * the primary action) instead of an inline panel or a small modal -- far
 * easier on a phone keyboard. Rendered through a portal so it isn't clipped
 * by the scrolling `.mobile-main` container. Styles live in
 * `src/mobile/mobile-system.css` (scoped to `body.mobile-view`). */
export default function FullScreenForm({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Sticky bottom bar -- normally the primary submit button. */
  footer?: ReactNode;
}) {
  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div className="m-fs" role="dialog" aria-modal="true" aria-label={title}>
      <div className="m-fs-header">
        <button type="button" className="m-icon-btn" onClick={onClose} aria-label="Close">
          ←
        </button>
        <h2>{title}</h2>
        <span className="m-fs-header-spacer" />
      </div>
      <div className="m-fs-body">{children}</div>
      {footer && <div className="m-fs-footer">{footer}</div>}
    </div>,
    document.body,
  );
}
