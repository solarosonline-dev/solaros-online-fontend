import { useState } from "react";
import "./CopyLinkButton.css";

type CopyLinkButtonProps = {
  url: string;
  className?: string;
  /** When true, clicking copies nothing and instead flashes `disabledMessage`
   * as a tooltip -- used to stop admins sharing a link to stale (unsaved)
   * quote/agreement content. Kept clickable rather than a native `disabled`
   * button so the tooltip can actually fire on click. */
  disabled?: boolean;
  disabledMessage?: string;
};

/** Small "Copy" button for share-link rows (quote/agreement/AMC schedule
 * share boxes) — copies `url` to the clipboard and flashes a "Copied!"
 * confirmation for a couple seconds before reverting. */
export default function CopyLinkButton({
  url,
  className,
  disabled = false,
  disabledMessage = "Save your changes before copying the link",
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const [showDisabledTip, setShowDisabledTip] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context, older
      // browser) -- fall back to a hidden textarea + execCommand so the
      // button still works rather than silently doing nothing.
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(textarea);
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClick() {
    if (disabled) {
      setShowDisabledTip(true);
      setTimeout(() => setShowDisabledTip(false), 2000);
      return;
    }
    handleCopy();
  }

  return (
    <span className="copy-link-wrap">
      <button
        type="button"
        className={`${className ?? "quote-btn"}${disabled ? " copy-link-btn--disabled" : ""}`}
        aria-disabled={disabled}
        onClick={handleClick}
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
      {showDisabledTip && <span className="copy-link-tooltip">{disabledMessage}</span>}
    </span>
  );
}
