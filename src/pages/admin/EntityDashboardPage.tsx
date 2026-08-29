import { useEffect, useState } from "react";
import { getMyEntityMetrics, type AdminEntityMetrics } from "../../api/adminMetrics";
import { getEntity } from "../../api/entity";
import { useAuth } from "../../lib/AuthContext";
import { ApiError } from "../../api/client";
import { formatCount, formatDays, formatKw, formatPercent, formatPerKw } from "./adminMetricsFormat";
import { formatMoneyShort } from "../../lib/money";
import { EntityStepperRow, EntityStepperStage, EntityStepperArrow } from "./EntityFunnelSteps";
import { HeroMetric, MetricTile } from "./EntityMetricCard";
import { QuoteStatusDonut, SegmentBreakdownBar } from "./EntityDashboardCharts";
import "./EntityDashboard.css";

// Business-friendly dashboard for entity-scoped admins (ENTITY_ADMIN /
// ENTITY_SUPER_ADMIN). Structure: a hero KPI strip, a single-row funnel
// stepper (one glanceable number per stage, deliberately uniform in size --
// see EntityFunnelSteps.tsx for why the old clockwise-grid layout was
// dropped), then dedicated sections for anything compositional (quote mix,
// project economics) that needs more room than a stepper card can offer.

// Division helper for client-side derived rates — guards against 0/0 and
// n/0 instead of surfacing NaN/Infinity in the UI.
function safeRate(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export default function EntityDashboardPage() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<AdminEntityMetrics | null>(null);
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const entityId = user?.entity_id;
    Promise.all([getMyEntityMetrics(), entityId != null ? getEntity(entityId) : Promise.resolve(null)])
      .then(([metricsRes, entityRes]) => {
        if (cancelled) return;
        setMetrics(metricsRes);
        setCurrency(entityRes?.currency);
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
  }, [user?.entity_id]);

  if (loading) return <div className="entity-dashboard-loading">Loading…</div>;
  if (loadError || !metrics) return <div className="entity-dashboard-loading">{loadError ?? "No data"}</div>;

  const { leads, quotes, agreements, projects, workorders } = metrics;

  const leadToQuote = safeRate(quotes.quotes_count, leads.leads_count);
  const quoteToAgreement = safeRate(agreements.agreements_count, quotes.quotes_accepted_count);
  const agreementToProject = safeRate(projects.projects_started_count, agreements.agreements_signed_count);
  const leadToProject = safeRate(projects.projects_started_count, leads.leads_count);
  const signingRate = safeRate(agreements.agreements_signed_count, agreements.agreements_count);
  const workorderCompletionRate = safeRate(workorders.workorders_completed_count, workorders.workorders_generated_count);

  return (
    <div className="entity-dashboard-page">
      <h1>{metrics.entity_name}</h1>
      <p className="entity-dashboard-subtitle">Your leads, quotes, agreements, projects, and work orders — at a glance.</p>

      <div className="entity-hero-strip">
        <HeroMetric label="Active projects" value={formatCount(projects.projects_active_count)} />
        <HeroMetric label="Pipeline value" value={formatMoneyShort(quotes.quotes_total_amount, currency)} />
        <HeroMetric label="Revenue realized" value={formatMoneyShort(projects.completed_amount, currency)} />
        <HeroMetric label="Capacity quoted" value={formatKw(quotes.total_capacity_kw)} />
        <HeroMetric label="Lead → project conversion" value={formatPercent(leadToProject)} />
      </div>

      <EntityStepperRow>
        <EntityStepperStage title="Leads" area="lead">
          <HeroMetric label="Leads generated" value={formatCount(leads.leads_count)} />
        </EntityStepperStage>

        <EntityStepperArrow conversion={formatPercent(leadToQuote)} />

        <EntityStepperStage title="Quotes" area="quote">
          <HeroMetric
            label="Accepted"
            value={formatCount(quotes.quotes_accepted_count)}
            secondary={`${formatPercent(quotes.quote_acceptance_rate)} acceptance rate`}
          />
          <div className="entity-metric-tile-row">
            <MetricTile label="Generated" value={formatCount(quotes.quotes_count)} />
          </div>
        </EntityStepperStage>

        <EntityStepperArrow conversion={formatPercent(quoteToAgreement)} />

        <EntityStepperStage title="Agreements" area="agreement">
          <HeroMetric
            label="Signed"
            value={formatCount(agreements.agreements_signed_count)}
            secondary={`${formatPercent(signingRate)} signing rate`}
          />
          <div className="entity-metric-tile-row">
            <MetricTile label="Generated" value={formatCount(agreements.agreements_count)} />
          </div>
        </EntityStepperStage>

        <EntityStepperArrow conversion={formatPercent(agreementToProject)} />

        <EntityStepperStage title="Projects" area="project">
          <HeroMetric label="Completed" value={formatCount(projects.projects_completed_count)} />
          <div className="entity-metric-tile-row">
            <MetricTile label="Started" value={formatCount(projects.projects_started_count)} />
            <MetricTile label="Active" value={formatCount(projects.projects_active_count)} />
          </div>
        </EntityStepperStage>

        <EntityStepperArrow />

        <EntityStepperStage title="Work orders" area="workorder">
          <HeroMetric
            label="Completed"
            value={formatCount(workorders.workorders_completed_count)}
            secondary={`${formatPercent(workorderCompletionRate)} completion rate`}
          />
          <div className="entity-metric-tile-row">
            <MetricTile label="Generated" value={formatCount(workorders.workorders_generated_count)} />
          </div>
        </EntityStepperStage>
      </EntityStepperRow>

      <div className="entity-section">
        <h2 className="entity-section-title">Quote insights</h2>
        <div className="entity-card-row">
          <div className="entity-card">
            <h3>Status mix</h3>
            <QuoteStatusDonut quotes={quotes} />
          </div>
          <div className="entity-card">
            <h3>Customer segments</h3>
            <SegmentBreakdownBar quotes={quotes} />
          </div>
          <div className="entity-card">
            <h3>Unit economics</h3>
            <div className="entity-metric-tile-row entity-metric-tile-row-stack">
              <MetricTile label="Total quoted" value={formatMoneyShort(quotes.quotes_total_amount, currency)} />
              <MetricTile label="Accepted kW" value={formatKw(quotes.accepted_capacity_kw)} />
              <MetricTile label="₹ per kW (accepted)" value={formatPerKw(quotes.accepted_amount_per_kw)} />
            </div>
          </div>
        </div>
      </div>

      <div className="entity-section">
        <h2 className="entity-section-title">Project economics</h2>
        <div className="entity-card entity-card-wide">
          <div className="entity-metric-tile-row">
            <MetricTile label="Total quoted" value={formatMoneyShort(projects.total_amount, currency)} />
            <MetricTile label="Realized" value={formatMoneyShort(projects.completed_amount, currency)} />
            <MetricTile label="Total kW" value={formatKw(projects.total_capacity_kw)} />
            <MetricTile label="Completed kW" value={formatKw(projects.completed_capacity_kw)} />
            <MetricTile label="Avg. completion" value={formatDays(projects.avg_project_completion_days)} />
          </div>
        </div>
      </div>
    </div>
  );
}
