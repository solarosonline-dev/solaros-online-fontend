import { useState, type ReactNode } from "react";
import "./AdminMetrics.css";

// Per-EPC tables are detail, not overview — collapsed by default so the
// dashboard reads as KPI cards + charts at a glance, with the row-level
// breakdowns one click away when someone actually needs to dig in.
export default function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="admin-metrics-collapsible">
      <button
        type="button"
        className="admin-metrics-collapsible-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`admin-metrics-collapsible-chevron ${open ? "open" : ""}`}>▸</span>
        <span className="admin-metrics-collapsible-title">{title}</span>
        {subtitle && <span className="admin-metrics-collapsible-subtitle">{subtitle}</span>}
      </button>
      {open && <div className="admin-metrics-collapsible-body">{children}</div>}
    </div>
  );
}
