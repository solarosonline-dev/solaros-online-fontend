import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminMetrics,
  listAdminEntityMetrics,
  type AdminEntityMetrics,
  type AdminMetrics,
} from "../../api/adminMetrics";
import { ApiError } from "../../api/client";
import { formatCount, formatDays, formatKw, formatMs, formatPercent, formatPerKw } from "./adminMetricsFormat";
import {
  ProjectCapacityByEntityChart,
  QuoteAmountByEntityChart,
  QuoteGenerationTimeByEntityChart,
} from "./AdminMetricsCharts";
import CollapsibleSection from "./CollapsibleSection";
import { FunnelGrid, FunnelStage, FunnelArrow, Tile } from "./FunnelGrid";
import { formatINRShort } from "../../lib/quoteDocumentCopy";
import "./AdminMetrics.css";

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<AdminMetrics | null>(null);
  const [entities, setEntities] = useState<AdminEntityMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([getAdminMetrics(), listAdminEntityMetrics()])
      .then(([summaryRes, entitiesRes]) => {
        if (cancelled) return;
        setSummary(summaryRes);
        setEntities(entitiesRes.items);
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
  if (loadError || !summary) return <div className="admin-metrics-loading">{loadError ?? "No data"}</div>;

  const goToEntity = (id: number) => navigate(`/app/admin/entities/${id}/metrics`);
  const topByAmount = [...entities].sort((a, b) => b.quotes.quotes_total_amount - a.quotes.quotes_total_amount).slice(0, 5);
  const epcCountLabel = `${entities.length} EPC${entities.length === 1 ? "" : "s"}`;

  return (
    <div className="admin-dashboard-page">
      <h1>Admin Dashboard</h1>
      <p className="admin-metrics-page-subtitle">Aggregated across every EPC onboarded onto the system.</p>

      {/* --- Funnel grid: Leads -> Quotes -> Agreements -> Projects as a 2x2
           quadrant flow (clockwise: right, down, left arrows), each stage
           filled with small tiles. Work orders is the output of a signed
           project rather than a funnel stage, so it gets its own full-width
           row underneath instead of a fifth quadrant. -------------------- */}
      <FunnelGrid>
        <FunnelStage title="Leads" area="lead">
          <Tile label="Leads generated" value={formatCount(summary.leads.leads_count)} />
          <Tile label="Entry time p50" value={formatMs(summary.leads.lead_entry_p50_ms)} />
          <Tile label="Entry time p95" value={formatMs(summary.leads.lead_entry_p95_ms)} />
        </FunnelStage>

        <FunnelArrow direction="right" area="lead-quote" />

        <FunnelStage title="Quotes" area="quote">
          <Tile label="Generated" value={formatCount(summary.quotes.quotes_count)} />
          <Tile label="Accepted" value={formatCount(summary.quotes.quotes_accepted_count)} />
          <Tile label="Dropped" value={formatCount(summary.quotes.quotes_rejected_count)} />
          <Tile label="In progress" value={formatCount(summary.quotes.quotes_in_progress_count)} />
          <Tile label="Acceptance" value={formatPercent(summary.quotes.quote_acceptance_rate)} />
          <Tile label="Gen. p50" value={formatMs(summary.quotes.quote_generation_p50_ms)} />
          <Tile label="Gen. p95" value={formatMs(summary.quotes.quote_generation_p95_ms)} />
          <Tile label="Total amount" value={formatINRShort(summary.quotes.quotes_total_amount)} />
          <Tile label="Total kW" value={formatKw(summary.quotes.total_capacity_kw)} />
          <Tile label="Accepted kW" value={formatKw(summary.quotes.accepted_capacity_kw)} />
          <Tile label="₹/kW (accepted)" value={formatPerKw(summary.quotes.accepted_amount_per_kw)} />
          <Tile
            label="Residential"
            value={formatCount(summary.quotes.residential.count)}
            sublabel={`avg ${formatKw(summary.quotes.residential.avg_capacity_kw ?? 0)}`}
          />
          <Tile
            label="Commercial"
            value={formatCount(summary.quotes.commercial.count)}
            sublabel={`avg ${formatKw(summary.quotes.commercial.avg_capacity_kw ?? 0)}`}
          />
          <Tile
            label="Industrial"
            value={formatCount(summary.quotes.industrial.count)}
            sublabel={`avg ${formatKw(summary.quotes.industrial.avg_capacity_kw ?? 0)}`}
          />
        </FunnelStage>

        <FunnelArrow direction="down" area="quote-agreement" />

        <FunnelStage title="Agreements" area="agreement">
          <Tile label="Generated" value={formatCount(summary.agreements.agreements_count)} />
          <Tile label="Signed" value={formatCount(summary.agreements.agreements_signed_count)} />
          <Tile label="Gen. p50" value={formatMs(summary.agreements.agreement_generation_p50_ms)} />
          <Tile label="Gen. p95" value={formatMs(summary.agreements.agreement_generation_p95_ms)} />
        </FunnelStage>

        <FunnelArrow direction="left" area="agreement-project" />

        <FunnelStage title="Projects" area="project">
          <Tile label="Started" value={formatCount(summary.projects.projects_started_count)} />
          <Tile label="Active" value={formatCount(summary.projects.projects_active_count)} />
          <Tile label="Completed" value={formatCount(summary.projects.projects_completed_count)} />
          <Tile label="Avg. completion" value={formatDays(summary.projects.avg_project_completion_days)} />
          <Tile label="Total kW" value={formatKw(summary.projects.total_capacity_kw)} />
          <Tile label="Completed kW" value={formatKw(summary.projects.completed_capacity_kw)} />
        </FunnelStage>

        <FunnelStage title="Work orders" area="workorder">
          <Tile label="Generated" value={formatCount(summary.workorders.workorders_generated_count)} />
          <Tile label="Completed" value={formatCount(summary.workorders.workorders_completed_count)} />
        </FunnelStage>
      </FunnelGrid>

      {/* --- Comparative charts ------------------------------------------- */}
      <div className="admin-metrics-section">
        <h2>Comparative charts</h2>
        <div className="admin-metrics-charts-grid">
          <div className="admin-metrics-chart-card">
            <h3>Quote amount by EPC</h3>
            <QuoteAmountByEntityChart entities={entities} />
          </div>
          <div className="admin-metrics-chart-card">
            <h3>Quote generation time (p50 / p95) by EPC</h3>
            <QuoteGenerationTimeByEntityChart entities={entities} />
          </div>
          <div className="admin-metrics-chart-card">
            <h3>Total project kW by EPC</h3>
            <ProjectCapacityByEntityChart entities={entities} />
          </div>
        </div>
      </div>

      {/* --- Per-EPC breakdowns: every row-level table lives here, collapsed
           by default, so the funnel above reads as glanceable tiles and the
           row-by-row detail is one click away when it's actually needed. -- */}
      <div className="admin-metrics-section">
        <h2>Per-EPC breakdowns</h2>

        <CollapsibleSection title="Leads by EPC" subtitle={epcCountLabel}>
          <EntityMetricsTable entities={entities} columns={LEAD_COLUMNS} onRowClick={goToEntity} />
        </CollapsibleSection>

        <CollapsibleSection title="Top 5 EPCs by quote amount">
          <EntityMetricsTable entities={topByAmount} columns={[COLUMN_QUOTE_AMOUNT]} onRowClick={goToEntity} />
        </CollapsibleSection>

        <CollapsibleSection title="Top 5 EPCs by quote acceptance">
          <TopAcceptanceTable entities={entities} onRowClick={goToEntity} />
        </CollapsibleSection>

        <CollapsibleSection title="Quotes by EPC" subtitle={epcCountLabel}>
          <EntityMetricsTable entities={entities} columns={QUOTE_COLUMNS} onRowClick={goToEntity} />
        </CollapsibleSection>

        <CollapsibleSection title="Agreements by EPC" subtitle={epcCountLabel}>
          <EntityMetricsTable entities={entities} columns={AGREEMENT_COLUMNS} onRowClick={goToEntity} />
        </CollapsibleSection>

        <CollapsibleSection title="Projects by EPC" subtitle={epcCountLabel}>
          <EntityMetricsTable entities={entities} columns={PROJECT_COLUMNS} onRowClick={goToEntity} />
        </CollapsibleSection>

        <CollapsibleSection title="Work orders by EPC" subtitle={epcCountLabel}>
          <EntityMetricsTable entities={entities} columns={WORKORDER_COLUMNS} onRowClick={goToEntity} />
        </CollapsibleSection>
      </div>
    </div>
  );
}

// --- Per-EPC table plumbing --------------------------------------------------

type ColumnDef = {
  key: string;
  label: string;
  render: (entity: AdminEntityMetrics) => string;
};

const COLUMN_QUOTE_AMOUNT: ColumnDef = {
  key: "quotes_total_amount",
  label: "Quote amount",
  render: (e) => formatINRShort(e.quotes.quotes_total_amount),
};

const LEAD_COLUMNS: ColumnDef[] = [
  { key: "leads_count", label: "Leads", render: (e) => formatCount(e.leads.leads_count) },
  { key: "lead_entry_p50", label: "Entry time p50", render: (e) => formatMs(e.leads.lead_entry_p50_ms) },
  { key: "lead_entry_p95", label: "Entry time p95", render: (e) => formatMs(e.leads.lead_entry_p95_ms) },
];

const QUOTE_COLUMNS: ColumnDef[] = [
  { key: "quotes_count", label: "Quotes", render: (e) => formatCount(e.quotes.quotes_count) },
  { key: "quotes_accepted_count", label: "Accepted", render: (e) => formatCount(e.quotes.quotes_accepted_count) },
  { key: "quotes_rejected_count", label: "Dropped", render: (e) => formatCount(e.quotes.quotes_rejected_count) },
  { key: "quotes_in_progress_count", label: "In progress", render: (e) => formatCount(e.quotes.quotes_in_progress_count) },
  COLUMN_QUOTE_AMOUNT,
  { key: "quote_acceptance_rate", label: "Acceptance rate", render: (e) => formatPercent(e.quotes.quote_acceptance_rate) },
  { key: "total_capacity_kw", label: "Total kW quoted", render: (e) => formatKw(e.quotes.total_capacity_kw) },
  { key: "accepted_capacity_kw", label: "Accepted kW", render: (e) => formatKw(e.quotes.accepted_capacity_kw) },
  { key: "accepted_amount_per_kw", label: "₹/kW (accepted)", render: (e) => formatPerKw(e.quotes.accepted_amount_per_kw) },
];

const AGREEMENT_COLUMNS: ColumnDef[] = [
  { key: "agreements_count", label: "Agreements", render: (e) => formatCount(e.agreements.agreements_count) },
  { key: "agreements_signed_count", label: "Signed", render: (e) => formatCount(e.agreements.agreements_signed_count) },
  { key: "agreement_generation_p50_ms", label: "Gen. p50", render: (e) => formatMs(e.agreements.agreement_generation_p50_ms) },
  { key: "agreement_generation_p95_ms", label: "Gen. p95", render: (e) => formatMs(e.agreements.agreement_generation_p95_ms) },
];

const PROJECT_COLUMNS: ColumnDef[] = [
  { key: "projects_started_count", label: "Started", render: (e) => formatCount(e.projects.projects_started_count) },
  { key: "projects_active_count", label: "Active", render: (e) => formatCount(e.projects.projects_active_count) },
  { key: "projects_completed_count", label: "Completed", render: (e) => formatCount(e.projects.projects_completed_count) },
  { key: "avg_project_completion_days", label: "Avg. completion", render: (e) => formatDays(e.projects.avg_project_completion_days) },
  { key: "total_capacity_kw", label: "Total kW", render: (e) => formatKw(e.projects.total_capacity_kw) },
  { key: "completed_capacity_kw", label: "Completed kW", render: (e) => formatKw(e.projects.completed_capacity_kw) },
];

const WORKORDER_COLUMNS: ColumnDef[] = [
  { key: "workorders_generated_count", label: "Generated", render: (e) => formatCount(e.workorders.workorders_generated_count) },
  { key: "workorders_completed_count", label: "Completed", render: (e) => formatCount(e.workorders.workorders_completed_count) },
];

function EntityMetricsTable({
  entities,
  columns,
  onRowClick,
}: {
  entities: AdminEntityMetrics[];
  columns: ColumnDef[];
  onRowClick: (entityId: number) => void;
}) {
  if (entities.length === 0) return <div className="admin-metrics-empty">No data yet.</div>;

  return (
    <div className="admin-metrics-table-wrap">
      <table className="admin-metrics-table">
        <thead>
          <tr>
            <th>EPC</th>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entities.map((entity) => (
            <tr key={entity.entity_id} onClick={() => onRowClick(entity.entity_id)}>
              <td>{entity.entity_name}</td>
              {columns.map((col) => (
                <td key={col.key}>{col.render(entity)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type AcceptanceSort = "rate" | "count";

// Top 5 by quote acceptance shows both the rate and the accepted-quote count
// (per the "top 5 EPCs by ... quote acceptance" requirement, which the acting
// user asked to cover both ways) — sortable by either, defaulting to rate.
function TopAcceptanceTable({
  entities,
  onRowClick,
}: {
  entities: AdminEntityMetrics[];
  onRowClick: (entityId: number) => void;
}) {
  const [sort, setSort] = useState<AcceptanceSort>("rate");

  const decided = entities.filter((e) => e.quotes.quote_acceptance_rate != null);
  const sorted = [...decided].sort((a, b) =>
    sort === "rate"
      ? b.quotes.quote_acceptance_rate! - a.quotes.quote_acceptance_rate!
      : b.quotes.quotes_accepted_count - a.quotes.quotes_accepted_count,
  );
  const top5 = sorted.slice(0, 5);

  if (top5.length === 0) return <div className="admin-metrics-empty">No decided quotes yet.</div>;

  return (
    <div className="admin-metrics-table-wrap">
      <table className="admin-metrics-table">
        <thead>
          <tr>
            <th>EPC</th>
            <th className="sortable" onClick={() => setSort("rate")}>
              Acceptance rate{sort === "rate" ? " ▾" : ""}
            </th>
            <th className="sortable" onClick={() => setSort("count")}>
              Quotes accepted{sort === "count" ? " ▾" : ""}
            </th>
          </tr>
        </thead>
        <tbody>
          {top5.map((entity) => (
            <tr key={entity.entity_id} onClick={() => onRowClick(entity.entity_id)}>
              <td>{entity.entity_name}</td>
              <td>{formatPercent(entity.quotes.quote_acceptance_rate)}</td>
              <td>{formatCount(entity.quotes.quotes_accepted_count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
