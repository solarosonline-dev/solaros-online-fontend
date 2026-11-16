import { useState } from "react";
import { ApiError } from "../../api/client";

// Creates/renews the design's view-only link (valid 1 week) and copies it.
// Used on the designs list and in the editor's header; `onShare` is supplied
// by the host so this stays free of entity/design ids.
export default function ShareDesignButton({
  onShare,
  className,
  disabled,
}: {
  onShare: () => Promise<string>;
  className?: string;
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleClick() {
    setState("busy");
    try {
      const url = await onShare();
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        window.prompt("Copy this view-only link (valid for 7 days):", url);
      }
      setMessage("Link copied - valid for 7 days");
      setState("copied");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not create link");
      setState("error");
    }
    setTimeout(() => setState("idle"), 3000);
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button type="button" className={className} onClick={handleClick} disabled={disabled || state === "busy"}>
        {state === "busy" ? "Sharing…" : "Share"}
      </button>
      {(state === "copied" || state === "error") && (
        <span style={{ fontSize: 12, color: state === "error" ? "var(--app-danger, #b42318)" : "var(--app-text-muted, #667085)" }}>
          {message}
        </span>
      )}
    </span>
  );
}
