import "./AdminMetrics.css";

export type KpiItem = {
  label: string;
  value: string;
  sublabel?: string;
};

export default function AdminMetricsKpiGrid({ items }: { items: KpiItem[] }) {
  return (
    <div className="admin-metrics-kpi-grid">
      {items.map((item) => (
        <div className="admin-metrics-kpi-card" key={item.label}>
          <div className="admin-metrics-kpi-label">{item.label}</div>
          <div className="admin-metrics-kpi-value">{item.value}</div>
          {item.sublabel && <div className="admin-metrics-kpi-sublabel">{item.sublabel}</div>}
        </div>
      ))}
    </div>
  );
}
