import { useEffect } from "react";
import type { ReactNode } from "react";
import "./Modal.css";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** When false, the backdrop click and Escape key no longer close the
   * modal — used while a request is in flight so a stray click doesn't lose
   * progress (e.g. mid-OTP-verification). Defaults to true. */
  dismissible?: boolean;
  "aria-label"?: string;
};

/** Minimal, generic centered dialog — no such primitive exists elsewhere in
 * the app yet. Styled with the shared `--app-*` tokens so it fits in
 * wherever it's used next. */
export default function Modal({ open, onClose, children, dismissible = true, ...rest }: ModalProps) {
  useEffect(() => {
    if (!open || !dismissible) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (dismissible) onClose();
      }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={rest["aria-label"]}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
