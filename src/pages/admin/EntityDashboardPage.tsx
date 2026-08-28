import { useEffect, useState } from "react";
import { getMyEntityMetrics, type AdminEntityMetrics } from "../../api/adminMetrics";
import { ApiError } from "../../api/client";
import { formatCount, formatDays, formatKw, formatMs, formatPercent, formatPerKw } from "./adminMetricsFormat";
import { FunnelGrid, FunnelStage, FunnelArrow, Tile } from "./FunnelGrid";
import { formatINRShort } from "../../lib/quoteDocumentCopy";
import "./AdminMetrics.css";

// Self-service dashboard for entity-scoped admins (ENTITY_ADMIN /
// ENTITY_SUPER_ADMIN) — the same funnel layout as the system admin's
// dashboard, but scoped to the caller's own EPC and with no per-EPC
// breakdown section, comparative charts, or top-5 tables, since there's
// only ever one entity's worth of data to show here.
export default function EntityDashboardPage() {
  const [metrics, setMetrics] = useState<AdminEntityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getMyEntityMetrics()
      .then((res) => {
        if (!cancelled) setMetrics(res);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Failed to load dashboard metrics");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="admin-metrics-loading">Loading…</div>;
  if (loadError || !metrics) return <div className="admin-metrics-loading">{loadError ?? "No data"}</div>;

  return (
    <div className="admin-dashboard-page">
      <h1>{metrics.entity_name}</h1>
      <p className="admin-metrics-page-subtitle">Your leads, quotes, agreements, projects, and work orders.</p>

      <FunnelGrid>
        <FunnelStage title="Leads" area="lead">
          <Tile label="Leads generated" value={formatCount(metrics.leads.leads_count)} />
          <Tile label="Entry time p50" value={formatMs(metrics.leads.lead_entry_p50_ms)} />
          <Tile label="Entry time p95" value={formatMs(metrics.leads.lead_entry_p95_ms)} />
        </FunnelStage>

        <FunnelArrow direction="right" area="lead-quote" />

        <FunnelStage title="Quotes" area="quote">
          <Tile label="Generated" value={formatCount(metrics.quotes.quotes_count)} />
          <Tile label="Accepted" value={formatCount(metrics.quotes.quotes_accepted_count)} />
          <Tile label="Dropped" value={formatCount(metrics.quotes.quotes_rejected_count)} />
          <Tile label="In progress" value={formatCount(metrics.quotes.quotes_in_progress_count)} />
          <Tile label="Acceptance" value={formatPercent(metrics.quotes.quote_acceptance_rate)} />
          <Tile label="Gen. p50" value={formatMs(metrics.quotes.quote_generation_p50_ms)} />
          <Tile label="Gen. p95" value={formatMs(metrics.quotes.quote_generation_p95_ms)} />
          <Tile label="Total amount" value={formatINRShort(metrics.quotes.quotes_total_amount)} />
          <Tile label="Total kW" value={formatKw(metrics.quotes.total_capacity_kw)} />
          <Tile label="Accepted kW" value={formatKw(metrics.quotes.accepted_capacity_kw)} />
          <Tile label="₹/kW (accepted)" value={formatPerKw(metrics.quotes.accepted_amount_per_kw)} />
          <Tile
            label="Residential"
            value={formatCount(metrics.quotes.residential.count)}
            sublabel={`avg ${formatKw(metrics.quotes.residential.avg_capacity_kw ?? 0)}`}
          />
          <Tile
            label="Commercial"
            value={formatCount(metrics.quotes.commercial.count)}
            sublabel={`avg ${formatKw(metrics.quotes.commercial.avg_capacity_kw ?? 0)}`}
          />
          <Tile
            label="Industrial"
            value={formatCount(metrics.quotes.industrial.count)}
            sublabel={`avg ${formatKw(metrics.quotes.industrial.avg_capacity_kw ?? 0)}`}
          />
        </FunnelStage>

        <FunnelArrow direction="down" area="quote-agreement" />

        <FunnelStage title="Agreements" area="agreement">
          <Tile label="Generated" value={formatCount(metrics.agreements.agreements_count)} />
          <Tile label="Signed" value={formatCount(metrics.agreements.agreements_signed_count)} />
          <Tile label="Gen. p50" value={formatMs(metrics.agreements.agreement_generation_p50_ms)} />
          <Tile label="Gen. p95" value={formatMs(metrics.agreements.agreement_generation_p95_ms)} />
        </FunnelStage>

        <FunnelArrow direction="left" area="agreement-project" />

        <FunnelStage title="Projects" area="project">
          <Tile label="Started" value={formatCount(metrics.projects.projects_started_count)} />
          <Tile label="Active" value={formatCount(metrics.projects.projects_active_count)} />
          <Tile label="Completed" value={formatCount(metrics.projects.projects_completed_count)} />
          <Tile label="Avg. completion" value={formatDays(metrics.projects.avg_project_completion_days)} />
          <Tile label="Total kW" value={formatKw(metrics.projects.total_capacity_kw)} />
          <Tile label="Completed kW" value={formatKw(metrics.projects.completed_capacity_kw)} />
        </FunnelStage>

        <FunnelStage title="Work orders" area="workorder">
          <Tile label="Generated" value={formatCount(metrics.workorders.workorders_generated_count)} />
          <Tile label="Completed" value={formatCount(metrics.workorders.workorders_completed_count)} />
        </FunnelStage>
      </FunnelGrid>
    </div>
  );
}
