import "./DraftRestoredBanner.css";

type Props = {
  restoredAt: number;
  onReset: () => void;
};

function relativeTime(timestampMs: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - timestampMs) / 60000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  return "over an hour ago";
}

/** Shown when a form's fields were silently populated from a local draft
 * (see useDraftAutosave/readDraft) instead of the fetched/blank starting
 * point -- gives the user a visible way to undo a restore they didn't ask
 * for, without blocking them with a confirmation dialog first. */
export default function DraftRestoredBanner({ restoredAt, onReset }: Props) {
  return (
    <p className="draft-restored-banner no-print">
      Draft restored from {relativeTime(restoredAt)}.{" "}
      <button type="button" className="draft-restored-reset" onClick={onReset}>
        Reset
      </button>
    </p>
  );
}
