import { useState } from "react";

type CopyLinkButtonProps = {
  url: string;
  className?: string;
};

/** Small "Copy" button for share-link rows (quote/agreement/AMC schedule
 * share boxes) — copies `url` to the clipboard and flashes a "Copied!"
 * confirmation for a couple seconds before reverting. */
export default function CopyLinkButton({ url, className }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

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

  return (
    <button type="button" className={className ?? "quote-btn"} onClick={handleCopy}>
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
