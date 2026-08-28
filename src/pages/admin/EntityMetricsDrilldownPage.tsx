import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { listAdminEntityMetrics, type AdminEntityMetrics } from "../../api/adminMetrics";
import { ApiError } from "../../api/client";
import { formatCount, formatDays, formatKw, formatMs, formatPercent, formatPerKw } from "./adminMetricsFormat";
import { formatINRShort } from "../../lib/quoteDocumentCopy";
import AdminMetricsKpiGrid from "./AdminMetricsKpiGrid";
import CollapsibleSection from "./CollapsibleSection";
import "./AdminMetrics.css";

// There's no per-entity metrics endpoint — the list endpoint already returns
// every onboarded EPC (including zero-activity ones), so the drilldown just
// fetches that list and picks out the one row by id, same as the dashboard.
export default function EntityMetricsDrilldownPage() {
  const { entityId } = useParams<{ entityId: string }>();
  const navigate = useNavigate();
  const [entities, setEntities] = useState<AdminEntityMetrics[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    listAdminEntityMetrics()
      .then((res) => {
        if (!cancelled) setEntities(res.items);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Failed to load EPC metrics");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="admin-metrics-loading">Loading…</div>;
  if (loadError) return <div className="admin-metrics-loading">{loadError}</div>;

  const entity = entities?.find((e) => String(e.entity_id) === entityId) ?? null;
  if (!entity) return <div className="admin-metrics-loading">EPC not found.</div>;

  return (
    <div className="admin-dashboard-page">
      <span className="admin-metrics-back-link" onClick={() => navigate("/app/admin/dashboard")}>
        ← Back to dashboard
      </span>
      <h1>{entity.entity_name}</h1>
      <p className="admin-metrics-page-subtitle">EPC metrics drilldown.</p>

      <div className="admin-metrics-section">
        <h2>Leads</h2>
        <AdminMetricsKpiGrid
          items={[
            { label: "Leads generated", value: formatCount(entity.leads.leads_count) },
            { label: "Lead entry time p50", value: formatMs(entity.leads.lead_entry_p50_ms) },
            { label: "Lead entry time p95", value: formatMs(entity.leads.lead_entry_p95_ms) },
          ]}
        />
      </div>

      <div className="admin-metrics-section">
        <h2>Quotes</h2>
        <AdminMetricsKpiGrid
          items={[
            { label: "Quotes generated", value: formatCount(entity.quotes.quotes_count) },
            { label: "Accepted", value: formatCount(entity.quotes.quotes_accepted_count) },
            { label: "Dropped", value: formatCount(entity.quotes.quotes_rejected_count) },
            { label: "In progress", value: formatCount(entity.quotes.quotes_in_progress_count) },
            { label: "Quote acceptance", value: formatPercent(entity.quotes.quote_acceptance_rate) },
            { label: "Quote gen. p50", value: formatMs(entity.quotes.quote_generation_p50_ms) },
            { label: "Quote gen. p95", value: formatMs(entity.quotes.quote_generation_p95_ms) },
            { label: "Total quote amount", value: formatINRShort(entity.quotes.quotes_total_amount) },
            { label: "Total kW quoted", value: formatKw(entity.quotes.total_capacity_kw) },
            { label: "Accepted kW", value: formatKw(entity.quotes.accepted_capacity_kw) },
            { label: "₹/kW (accepted)", value: formatPerKw(entity.quotes.accepted_amount_per_kw) },
            {
              label: "Residential",
              value: formatCount(entity.quotes.residential.count),
              sublabel: `avg ${formatKw(entity.quotes.residential.avg_capacity_kw ?? 0)}`,
            },
            {
              label: "Commercial",
              value: formatCount(entity.quotes.commercial.count),
              sublabel: `avg ${formatKw(entity.quotes.commercial.avg_capacity_kw ?? 0)}`,
            },
            {
              label: "Industrial",
              value: formatCount(entity.quotes.industrial.count),
              sublabel: `avg ${formatKw(entity.quotes.industrial.avg_capacity_kw ?? 0)}`,
            },
          ]}
        />
      </div>

      <div className="admin-metrics-section">
        <CollapsibleSection title="Agreements" subtitle="hidden from the dashboard above — expand to review">
          <AdminMetricsKpiGrid
            items={[
              { label: "Agreements generated", value: formatCount(entity.agreements.agreements_count) },
              { label: "Signed", value: formatCount(entity.agreements.agreements_signed_count) },
              { label: "Agreement gen. p50", value: formatMs(entity.agreements.agreement_generation_p50_ms) },
              { label: "Agreement gen. p95", value: formatMs(entity.agreements.agreement_generation_p95_ms) },
            ]}
          />
        </CollapsibleSection>
      </div>

      <div className="admin-metrics-section">
        <h2>Projects</h2>
        <AdminMetricsKpiGrid
          items={[
            { label: "Projects started", value: formatCount(entity.projects.projects_started_count) },
            { label: "Active", value: formatCount(entity.projects.projects_active_count) },
            { label: "Completed", value: formatCount(entity.projects.projects_completed_count) },
            { label: "Avg. completion time", value: formatDays(entity.projects.avg_project_completion_days) },
            { label: "Total project kW", value: formatKw(entity.projects.total_capacity_kw) },
            { label: "Completed project kW", value: formatKw(entity.projects.completed_capacity_kw) },
          ]}
        />
      </div>

      <div className="admin-metrics-section">
        <h2>Work orders</h2>
        <AdminMetricsKpiGrid
          items={[
            { label: "Work orders generated", value: formatCount(entity.workorders.workorders_generated_count) },
            { label: "Work orders completed", value: formatCount(entity.workorders.workorders_completed_count) },
          ]}
        />
      </div>
    </div>
  );
}
