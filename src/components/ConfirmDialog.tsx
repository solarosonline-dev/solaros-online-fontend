import Modal from "./Modal";
import "./ConfirmDialog.css";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button red for destructive actions. Defaults to true. */
  danger?: boolean;
  /** Disables the confirm button and swaps its label while a request is in flight. */
  confirming?: boolean;
  confirmingLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Generic "are you sure?" dialog for destructive or hard-to-undo actions
 * (delete, reject, discard-unsaved-changes, etc.). Built on the shared
 * Modal primitive so every confirmation in the app looks and behaves the
 * same way. */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  confirming = false,
  confirmingLabel = "Working…",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} dismissible={!confirming} aria-label={title}>
      <div className="confirm-dialog">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-btn confirm-dialog-btn--ghost" onClick={onCancel} disabled={confirming}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-dialog-btn ${danger ? "confirm-dialog-btn--danger" : "confirm-dialog-btn--primary"}`}
            onClick={onConfirm}
            disabled={confirming}
          >
            {confirming ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
