// The Design Report step's document: fixed-size landscape A4 pages
// (`.pde-report-page`, 1123x794 CSS px = A4 at 96 DPI) rendered on screen
// exactly as they'll appear in the PDF - designReportPdf.ts captures each
// page element into one PDF page, so what you see is what gets attached or
// downloaded. Customer-facing, so it carries the entity's branding the same
// way the Quote document does (logo, tagline, contact, tax id).
//
// Pages: 1 Overview (client/site, headline numbers, location image),
// 2 System configuration, 3 Energy output (monthly chart), 4 SLD. Site
// design images (2D plan / 3D renders) are a planned addition between 2
// and 3. No pricing - the Quote covers that.
import type { ReactNode } from 'react';
import { REPORT_PAGE_CLASS } from './designReportPdf';
import { formatKWh, formatPct, shadingLossPct, type OutputSeries } from './OutputChartPanel';
import './DesignReport.css';

export interface ReportBranding {
  entityName: string;
  primaryColor?: string;
  logoUrl?: string | null;
  tagline?: string;
  footerTag?: string;
  gstno?: string | null;
  taxIdLabel?: string;
  address?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
}

// From the design's linked lead, when there is one.
export interface ReportClient {
  name: string;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  discom?: string | null;
}

export interface ReportRoofRow {
  key: string;
  name: string;
  type: string;
  tiltDeg: number;
  azimuthDeg: number;
  facing: string;
  panels: number;
  kw: number;
}

interface DesignReportProps {
  branding: ReportBranding;
  client: ReportClient | null;
  projectName: string;
  siteAddress: string | null;
  location: { lat: number; lon: number };
  locationImageUrl: string | null;
  capacityKw: number;
  panelCount: number;
  panelSpec: any;
  inverterChoice: any;
  inverterCount: number;
  gridConnection: any;
  dcAcRatio: number | null;
  designTemp: { min: number; max: number } | null;
  roofRows: ReportRoofRow[];
  output: OutputSeries | null;
  ghiStatus: string;
  sld: ReactNode;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Literal colors (not CSS variables) in anything SVG: the PDF export draws
// SVGs through svg2pdf.js, which can't resolve var(--...).
const BAR_COLOR = '#2563eb';
const LOSS_COLOR = '#f2b866';

function todayLabel() {
  return new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function num(v: number, digits = 0) {
  return v.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function ReportHeader({ branding, projectName }: { branding: ReportBranding; projectName: string }) {
  return (
    <header className="pde-report-header">
      <div className="pde-report-brand">
        {branding.logoUrl ? (
          <img className="pde-report-logo" src={branding.logoUrl} alt={branding.entityName} />
        ) : (
          <span className="pde-report-logo-fallback">{branding.entityName}</span>
        )}
        {branding.tagline && <span className="pde-report-tagline">{branding.tagline}</span>}
      </div>
      <div className="pde-report-header-meta">
        <strong>Design Report</strong>
        <span>{projectName || 'Untitled project'}</span>
      </div>
    </header>
  );
}

function ReportFooter({ branding, page, pageCount }: { branding: ReportBranding; page: number; pageCount: number }) {
  const contact = [branding.businessPhone, branding.businessEmail].filter(Boolean).join(' · ');
  return (
    <footer className="pde-report-footer">
      <div>
        <strong>{branding.entityName}</strong>
        {branding.address && <span> · {branding.address}</span>}
        {contact && <span> · {contact}</span>}
        {branding.gstno && <span> · {branding.taxIdLabel || 'GSTIN'}: {branding.gstno}</span>}
        {branding.footerTag && <div className="pde-report-footer-tag">{branding.footerTag}</div>}
      </div>
      <span className="pde-report-page-no">Page {page} of {pageCount}</span>
    </footer>
  );
}

function Page({ branding, projectName, page, pageCount, title, children }: {
  branding: ReportBranding; projectName: string; page: number; pageCount: number; title?: string; children: ReactNode;
}) {
  return (
    <section className={REPORT_PAGE_CLASS}>
      <ReportHeader branding={branding} projectName={projectName} />
      <div className="pde-report-body">
        {title && <h2 className="pde-report-title">{title}</h2>}
        {children}
      </div>
      <ReportFooter branding={branding} page={page} pageCount={pageCount} />
    </section>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="pde-report-stat">
      <span className="pde-report-stat-label">{label}</span>
      <span className="pde-report-stat-value">{value}{unit && <small> {unit}</small>}</span>
    </div>
  );
}

function KeyValueTable({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <div className="pde-report-card">
      <div className="pde-report-card-title">{title}</div>
      <table className="pde-report-kv">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><th>{k}</th><td>{v}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Monthly output (stacked with shading loss), drawn as plain SVG rather than
// with recharts: deterministic (no animation frame to catch mid-way during
// capture), fixed-size, literal colors - so it exports as clean vector.
function MonthlyChart({ output }: { output: OutputSeries }) {
  const W = 960, H = 300;
  const padL = 64, padR = 12, padT = 16, padB = 32;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const totals = output.monthlyKWh.map((v, m) => v + output.monthlyLostKWh[m]);
  const rawMax = Math.max(...totals, 1);
  const step = niceStep(rawMax / 4);
  const yMax = Math.ceil(rawMax / step) * step;
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  const slot = plotW / 12;
  const barW = slot * 0.62;
  const y = (v: number) => padT + plotH - (v / yMax) * plotH;
  return (
    <svg data-pdf-vector viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth={1} />
          <text x={padL - 8} y={y(t) + 4} fontSize={11} fill="#6b7280" textAnchor="end">{num(t)}</text>
        </g>
      ))}
      <text x={14} y={padT + plotH / 2} fontSize={11} fill="#6b7280" textAnchor="middle" transform={`rotate(-90 14 ${padT + plotH / 2})`}>kWh</text>
      {output.monthlyKWh.map((v, m) => {
        const x = padL + slot * m + (slot - barW) / 2;
        const lost = output.monthlyLostKWh[m];
        return (
          <g key={m}>
            <rect x={x} y={y(v)} width={barW} height={y(0) - y(v)} fill={BAR_COLOR} />
            {lost > 0 && <rect x={x} y={y(v + lost)} width={barW} height={y(v) - y(v + lost)} fill={LOSS_COLOR} />}
            <text x={x + barW / 2} y={H - padB + 18} fontSize={12} fill="#374151" textAnchor="middle">{MONTH_SHORT[m]}</text>
          </g>
        );
      })}
      <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="#9ca3af" strokeWidth={1} />
    </svg>
  );
}

function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

export default function DesignReport(props: DesignReportProps) {
  const {
    branding, client, projectName, siteAddress, location, locationImageUrl, capacityKw, panelCount,
    panelSpec, inverterChoice, inverterCount, gridConnection, dcAcRatio, designTemp, roofRows, output, ghiStatus, sld,
  } = props;
  const pageCount = 4;
  const common = { branding, projectName };
  const coords = `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}`;
  const annual = output?.totalKWh ?? null;
  const specificYield = annual != null && capacityKw > 0 ? annual / capacityKw : null;
  const lossPct = output ? shadingLossPct(output) : null;
  const totalInverterKw = (inverterChoice?.acPowerKw ?? 0) * inverterCount;

  return (
    <div className="pde-report" style={{ ['--report-primary' as any]: branding.primaryColor || '#ff6b1a' }}>
      {/* 1. Overview */}
      <Page {...common} page={1} pageCount={pageCount} title="Solar plant design report">
        <div className="pde-report-overview">
          <div className="pde-report-overview-main">
            <div className="pde-report-parties">
              <div>
                <span className="pde-report-eyebrow">Prepared for</span>
                <strong className="pde-report-party-name">{client?.name || projectName || 'Customer'}</strong>
                {client?.address && <p>{client.address}</p>}
                {client && <p className="pde-report-muted">{[client.mobile, client.email].filter(Boolean).join(' · ')}</p>}
              </div>
              <div>
                <span className="pde-report-eyebrow">Site</span>
                <strong className="pde-report-party-name">{projectName || 'Untitled project'}</strong>
                {siteAddress && <p>{siteAddress}</p>}
                <p className="pde-report-muted">{coords}</p>
              </div>
              <div>
                <span className="pde-report-eyebrow">Report date</span>
                <strong className="pde-report-party-name">{todayLabel()}</strong>
                {(client?.discom || gridConnection?.discom) && <p className="pde-report-muted">DISCOM: {client?.discom || gridConnection.discom}</p>}
              </div>
            </div>
            <div className="pde-report-stats">
              <Stat label="System size" value={num(capacityKw, 2)} unit="kWp" />
              <Stat label="Solar panels" value={num(panelCount)} unit="nos" />
              <Stat label="Annual generation" value={annual != null ? num(annual) : '-'} unit="kWh" />
              <Stat label="Specific yield" value={specificYield != null ? num(specificYield) : '-'} unit="kWh/kWp/yr" />
              <Stat label="Shading loss" value={lossPct != null ? formatPct(lossPct) : '-'} />
              <Stat label="Inverters" value={`${inverterCount} × ${inverterChoice?.acPowerKw ?? '-'} kW`} />
            </div>
          </div>
          <div className="pde-report-location">
            {locationImageUrl ? (
              <img src={locationImageUrl} alt="Site location" />
            ) : (
              <div className="pde-report-location-empty">No site image</div>
            )}
            <span className="pde-report-muted">Site location · {coords}</span>
          </div>
        </div>
      </Page>

      {/* 2. System configuration */}
      <Page {...common} page={2} pageCount={pageCount} title="System configuration">
        <div className="pde-report-grid-3">
          <KeyValueTable
            title="Solar module"
            rows={[
              ['Make / model', `${panelSpec?.make ?? ''} ${panelSpec?.model ?? ''}`.trim() || 'Custom'],
              ['Rated power', `${panelSpec?.wattage ?? '-'} Wp`],
              ['Dimensions', panelSpec?.width && panelSpec?.height ? `${panelSpec.height} × ${panelSpec.width} m` : '-'],
              ['Quantity', `${num(panelCount)} nos`],
              ['DC capacity', `${num(capacityKw, 2)} kWp`],
            ]}
          />
          <KeyValueTable
            title="Inverter"
            rows={[
              ['Make / model', `${inverterChoice?.make ?? ''} ${inverterChoice?.model ?? ''}`.trim() || 'Custom'],
              ['Rated AC power', `${inverterChoice?.acPowerKw ?? '-'} kW`],
              ['Quantity', `${inverterCount} nos`],
              ['Total AC capacity', `${num(totalInverterKw, 1)} kW`],
              ['DC/AC ratio', dcAcRatio != null ? num(dcAcRatio, 2) : '-'],
            ]}
          />
          <KeyValueTable
            title="Grid connection"
            rows={[
              ['Voltage / phase', `${gridConnection?.voltage ?? '-'} V · ${gridConnection?.phase ?? '-'}-phase`],
              ['DISCOM', client?.discom || gridConnection?.discom || '-'],
              ['Sanctioned load', gridConnection?.sanctionedLoadKw !== '' && gridConnection?.sanctionedLoadKw != null ? `${gridConnection.sanctionedLoadKw} kW` : '-'],
              ['Design temperature', designTemp ? `${num(designTemp.min, 1)}°C to ${num(designTemp.max, 1)}°C` : '-'],
            ]}
          />
        </div>
        <div className="pde-report-card">
          <div className="pde-report-card-title">Roof layout</div>
          <table className="pde-report-table">
            <thead>
              <tr><th>Roof / array</th><th>Roof type</th><th>Panel tilt</th><th>Facing (azimuth)</th><th>Panels</th><th>Capacity</th></tr>
            </thead>
            <tbody>
              {roofRows.map((r) => (
                <tr key={r.key}>
                  <td>{r.name}</td>
                  <td>{r.type}</td>
                  <td>{r.tiltDeg}°</td>
                  <td>{r.azimuthDeg}° · {r.facing}</td>
                  <td>{num(r.panels)}</td>
                  <td>{num(r.kw, 2)} kWp</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>

      {/* 3. Energy output */}
      <Page {...common} page={3} pageCount={pageCount} title="Energy output">
        {output ? (
          <>
            <div className="pde-report-stats pde-report-stats--row">
              <Stat label="Annual generation" value={num(output.totalKWh)} unit="kWh" />
              <Stat label="Average per day" value={num(output.totalKWh / 365, 1)} unit="kWh" />
              <Stat label="Specific yield" value={specificYield != null ? num(specificYield) : '-'} unit="kWh/kWp/yr" />
              <Stat label="Shading loss" value={formatPct(shadingLossPct(output))} unit={`(${formatKWh(output.totalLostKWh)}/yr)`} />
            </div>
            <div className="pde-report-card">
              <div className="pde-report-card-title">
                Monthly generation · typical year
                <span className="pde-report-legend">
                  <i style={{ background: BAR_COLOR }} /> Output
                  <i style={{ background: LOSS_COLOR }} /> Lost to shading
                </span>
              </div>
              <MonthlyChart output={output} />
              <table className="pde-report-table pde-report-table--months">
                <thead>
                  <tr><th />{MONTH_SHORT.map((m) => <th key={m}>{m}</th>)}</tr>
                </thead>
                <tbody>
                  <tr><th>kWh</th>{output.monthlyKWh.map((v, m) => <td key={m}>{num(v)}</td>)}</tr>
                </tbody>
              </table>
            </div>
            <p className="pde-report-note">
              {ghiStatus === 'ready'
                ? 'Typical-year estimate from NASA POWER 2001-2020 monthly irradiance averages for this site. Actual generation varies with each year\'s weather, soiling and grid availability.'
                : 'Estimate based on illustrative sample irradiance averages, not this site\'s own data.'}
            </p>
          </>
        ) : (
          <p className="pde-report-note">Output estimate not available - place panels to see it.</p>
        )}
      </Page>

      {/* 4. SLD - no page title, SldView carries its own drawing header */}
      <Page {...common} page={4} pageCount={pageCount}>
        {sld}
      </Page>
    </div>
  );
}
