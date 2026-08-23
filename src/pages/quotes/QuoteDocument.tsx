import type { CSSProperties } from "react";
import { formatINR, type QuoteComputeResult } from "../../lib/quoteCalculations";
import type { QuoteComponentRow } from "../../api/quotes";
import {
  formatINRShort,
  formatDate,
  SEGMENT_LABELS,
  pitchLine,
  subsidyExplanationNote,
  WHATS_INCLUDED,
  installTimeline,
} from "../../lib/quoteDocumentCopy";
import "./QuoteDocument.css";

export type QuoteDocumentBranding = {
  entityName: string;
  primaryColor?: string;
  logoUrl?: string | null;
  tagline?: string;
  footerTag?: string;
  gstno?: string | null;
  address?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  typography?: { h1?: string; h2?: string; h3?: string; body?: string; small?: string };
};

export type QuoteDocumentAmc = { name: string; ratePerKw: number | null; inclusion: string[] } | null;

export type QuoteDocumentProps = {
  quoteId: number | null;
  createdAt: string | null;
  validityDays: number | null;
  capacityKw: number;
  panelMake: string | null;
  inverterMake: string | null;
  panelType: string | null;
  notes: string | null;
  terms: string[];
  components: QuoteComponentRow[];
  customerName: string;
  customerCompany?: string | null;
  customerAddress: string | null;
  customerDiscom: string | null;
  customerMobile: string | null;
  customerEmail: string | null;
  segment: string | null;
  pricePerWatt: number;
  gstRate: number;
  computed: QuoteComputeResult;
  amc: QuoteDocumentAmc;
  amcDurationYears: number | null;
  branding: QuoteDocumentBranding;
};

export default function QuoteDocument({
  quoteId,
  createdAt,
  validityDays,
  capacityKw,
  panelMake,
  inverterMake,
  panelType,
  notes,
  terms,
  components,
  customerName,
  customerCompany,
  customerAddress,
  customerDiscom,
  customerMobile,
  customerEmail,
  segment,
  pricePerWatt,
  gstRate,
  computed: c,
  amc,
  amcDurationYears,
  branding,
}: QuoteDocumentProps) {
  const isDCR = (panelType ?? "DCR") === "DCR";
  const isResidential = segment === "residential";
  const segLabel = SEGMENT_LABELS[segment ?? ""] ?? "Custom";

  const issuedOn = createdAt ? new Date(createdAt) : new Date();
  const validity = validityDays ?? 15;
  const validTill = new Date(issuedOn.getTime() + validity * 86400000);

  const subsidyNote = c.subsidy <= 0 ? subsidyExplanationNote(segment, panelType) : null;
  const amcTotal = amc?.ratePerKw != null && amcDurationYears != null ? amc.ratePerKw * capacityKw * amcDurationYears : null;
  const amcYearly = amc?.ratePerKw != null ? amc.ratePerKw * capacityKw : null;

  const compRowsCalc = components.map((r) => {
    const qty = r.qty ?? 0;
    const price = r.price ?? 0;
    const taxPercent = r.tax_percent ?? 0;
    const subtotal = qty * price;
    const total = subtotal + subtotal * (taxPercent / 100);
    return { particular: r.particular, qty, price, taxPercent, subtotal, total };
  });
  const compTotalPrice = compRowsCalc.reduce((sum, r) => sum + r.subtotal, 0);
  const compGrandTotal = compRowsCalc.reduce((sum, r) => sum + r.total, 0);
  const compAvgTaxPercent =
    compTotalPrice > 0 ? ((compGrandTotal - compTotalPrice) / compTotalPrice) * 100 : 0;

  const firmContact = [branding.businessEmail, branding.businessPhone].filter(Boolean).join(" · ");
  const whatsappNumber = branding.businessPhone ? branding.businessPhone.replace(/[^0-9]/g, "") : null;

  // Typography values already carry their unit (e.g. "28px") — set by the entity's
  // Typography preferences tab, don't append "px" again here.
  const style = {
    "--qdoc-primary": branding.primaryColor || "#ff6b1a",
    "--qdoc-h1": branding.typography?.h1 || "28px",
    "--qdoc-h2": branding.typography?.h2 || "22px",
    "--qdoc-h3": branding.typography?.h3 || "18px",
    "--qdoc-body": branding.typography?.body || "14px",
    "--qdoc-small": branding.typography?.small || "12px",
  } as CSSProperties;

  return (
    <div className="qdoc" style={style}>
      <div className="qdoc-toolbar no-print">
        <button type="button" className="qdoc-print-btn" onClick={() => window.print()}>
          🖨 Print / Save PDF
        </button>
      </div>

      <header className="qdoc-header">
        <div className="qdoc-brand">
          <div className="qdoc-logo">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.entityName} />
            ) : (
              <span className="qdoc-logo-fallback">{branding.entityName}</span>
            )}
          </div>
          {branding.tagline && <p className="qdoc-tagline">{branding.tagline}</p>}
          {branding.address && <p className="qdoc-creds">{branding.address}</p>}
          {firmContact && <p className="qdoc-creds">{firmContact}</p>}
          {branding.gstno && <p className="qdoc-creds">GSTIN: {branding.gstno}</p>}
        </div>
        <div className="qdoc-meta">
          <div>
            <span className="qdoc-meta-label">Quote no.</span>
            <strong>{quoteId ?? "DRAFT"}</strong>
          </div>
          <div>
            <span className="qdoc-meta-label">Issued</span>
            <strong>{formatDate(issuedOn)}</strong>
          </div>
          <div>
            <span className="qdoc-meta-label">Valid till</span>
            <strong>{formatDate(validTill)}</strong>
          </div>
        </div>
      </header>

      <section className="qdoc-hero">
        <div>
          <p className="qdoc-eyebrow">Personalized proposal · {segLabel}</p>
          <h1>
            {customerName || "Valued customer"}
            {customerCompany && <small> · {customerCompany}</small>}
          </h1>
          {customerAddress && <p className="qdoc-address">{customerAddress}</p>}
          <p className="qdoc-address qdoc-address-muted">
            {[customerDiscom, customerMobile, customerEmail].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="qdoc-pitch">
          <p>{pitchLine(segment, c)}</p>
        </div>
      </section>

      <section className="qdoc-metrics">
        <div className="qdoc-metric">
          <span>System size</span>
          <strong>{capacityKw} kWp</strong>
          <em>
            {panelMake || "ALMM Tier-1 panels"}
            {!isDCR ? " (Non-DCR)" : ""}
          </em>
        </div>
        <div className="qdoc-metric qdoc-metric-accent">
          <span>Monthly savings</span>
          <strong>{formatINR(c.monthlySaving)}</strong>
          <em>at current {customerDiscom || "DISCOM"} tariff</em>
        </div>
        <div className="qdoc-metric">
          <span>Generation</span>
          <strong>{c.monthlyKwh.toLocaleString("en-IN")} kWh/mo</strong>
          <em>{c.yearlyKwh.toLocaleString("en-IN")} kWh/yr</em>
        </div>
        <div className="qdoc-metric qdoc-metric-green">
          <span>Payback</span>
          <strong>{c.paybackYrs.toFixed(1)} years</strong>
          <em>then free power</em>
        </div>
        <div className="qdoc-metric">
          <span>CO₂ avoided</span>
          <strong>{c.co2Tons.toFixed(1)} t/yr</strong>
          <em>≈ {Math.round(c.trees).toLocaleString("en-IN")} tree-equivalent</em>
        </div>
        <div className="qdoc-metric">
          <span>Lifetime savings</span>
          <strong>{formatINRShort(c.lifetimeNet)}</strong>
          <em>after recovering investment</em>
        </div>
      </section>

      <section className="qdoc-section">
        <h2>Commercial summary</h2>
        <table className="qdoc-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Calculation</th>
              <th className="qdoc-ta-r">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>System cost (ex-GST)</td>
              <td>
                <small>
                  {capacityKw} kW × ₹{pricePerWatt.toFixed(2)}/W
                </small>
              </td>
              <td className="qdoc-ta-r">{formatINR(c.baseCost)}</td>
            </tr>
            <tr>
              <td>GST @ {gstRate.toFixed(1)}%</td>
              <td>
                <small>Solar PV generating system</small>
              </td>
              <td className="qdoc-ta-r">{formatINR(c.gstAmount)}</td>
            </tr>
            <tr className="qdoc-row-strong">
              <td>Total project cost</td>
              <td>
                <small>Inclusive of GST</small>
              </td>
              <td className="qdoc-ta-r">{formatINR(c.totalCost)}</td>
            </tr>
            {c.subsidy > 0 ? (
              <tr className="qdoc-row-accent">
                <td>Less subsidy</td>
                <td>
                  <small>PM Surya Ghar central financial assistance</small>
                </td>
                <td className="qdoc-ta-r qdoc-amt-green">– {formatINR(c.subsidy)}</td>
              </tr>
            ) : (
              subsidyNote && (
                <tr>
                  <td colSpan={3} className="qdoc-row-note">
                    {subsidyNote}
                  </td>
                </tr>
              )
            )}
            <tr className="qdoc-row-total">
              <td>Your investment</td>
              <td>
                <small>Net of subsidy{c.subsidy > 0 ? "" : " (no subsidy applied)"}</small>
              </td>
              <td className="qdoc-ta-r">{formatINR(c.netInvestment)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="qdoc-section">
        <h2>
          What's included <small className="qdoc-h2-sub">— turnkey, no surprises</small>
        </h2>
        <ul className="qdoc-incl">
          {WHATS_INCLUDED(panelMake, inverterMake, isDCR, isResidential).map((item, i) => (
            <li key={i}>
              <span className="qdoc-icon">{item.icon}</span>
              <div>
                <strong>{item.title}</strong>
                <span>{item.desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {compRowsCalc.length > 0 && (
        <section className="qdoc-section qdoc-components">
          <h2>Component-wise pricing</h2>
          <table className="qdoc-table">
            <thead>
              <tr>
                <th>Particulars</th>
                <th className="qdoc-ta-r">Qty</th>
                <th className="qdoc-ta-r">Price</th>
                <th className="qdoc-ta-r">Tax</th>
                <th className="qdoc-ta-r">Total</th>
              </tr>
            </thead>
            <tbody>
              {compRowsCalc.map((row, i) => (
                <tr key={i}>
                  <td>{row.particular}</td>
                  <td className="qdoc-ta-r">{row.qty}</td>
                  <td className="qdoc-ta-r">{formatINR(row.price)}</td>
                  <td className="qdoc-ta-r">{row.taxPercent}%</td>
                  <td className="qdoc-ta-r">{formatINR(row.total)}</td>
                </tr>
              ))}
              <tr className="qdoc-row-total">
                <td>Total</td>
                <td></td>
                <td className="qdoc-ta-r">{formatINR(compTotalPrice)}</td>
                <td className="qdoc-ta-r">{compAvgTaxPercent.toFixed(1)}%</td>
                <td className="qdoc-ta-r">{formatINR(compGrandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {amc && (
        <section className="qdoc-section qdoc-amc">
          <h2>
            AMC <small className="qdoc-h2-sub">— we stay on the roof with you</small>
          </h2>
          <article className="qdoc-amc-card">
            <div className="qdoc-amc-tag">{amc.name}</div>
            {amcYearly != null ? (
              <>
                <p className="qdoc-amc-price">
                  {formatINR(amcYearly)}
                  <small> / year</small>
                </p>
                <p className="qdoc-amc-rate">
                  {formatINR(amc.ratePerKw ?? 0)}/kW/yr × {capacityKw} kW
                  {amcTotal != null && amcDurationYears ? ` · ${formatINR(amcTotal)} for ${amcDurationYears} year(s)` : ""}
                </p>
              </>
            ) : (
              <p className="qdoc-amc-rate">Contact us for pricing.</p>
            )}
            {amc.inclusion.length > 0 && (
              <ul>
                {amc.inclusion.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </article>
        </section>
      )}

      <section className="qdoc-section">
        <h2>Payment schedule</h2>
        <table className="qdoc-table qdoc-table-pay">
          <tbody>
            <tr>
              <td>
                <strong>30%</strong> on signing
              </td>
              <td>Confirms PO and locks panel allocation</td>
              <td className="qdoc-ta-r">
                <strong>{formatINR(c.payAdvance)}</strong>
              </td>
            </tr>
            <tr>
              <td>
                <strong>60%</strong> before material dispatch
              </td>
              <td>~Day 5 once design + paperwork are signed off</td>
              <td className="qdoc-ta-r">
                <strong>{formatINR(c.payDispatch)}</strong>
              </td>
            </tr>
            <tr>
              <td>
                <strong>10%</strong> on commissioning
              </td>
              <td>Day 7–10 — net-meter live, generating units</td>
              <td className="qdoc-ta-r">
                <strong>{formatINR(c.payCommission)}</strong>
              </td>
            </tr>
            <tr className="qdoc-row-total">
              <td>Total</td>
              <td>NEFT / RTGS / Cheque to {branding.entityName}</td>
              <td className="qdoc-ta-r">{formatINR(c.totalCost)}</td>
            </tr>
          </tbody>
        </table>
        {c.subsidy > 0 && (
          <p className="qdoc-pay-note">
            PM Surya Ghar subsidy of <strong>{formatINR(c.subsidy)}</strong> credits to your bank account ~30 days after
            net-meter activation. We handle the entire filing — you sign three forms.
          </p>
        )}
      </section>

      <section className="qdoc-section qdoc-timeline">
        <h2>From go-ahead to first units — 7 to 10 days</h2>
        <ol>
          {installTimeline(amc ? `${amc.name} begins` : "Ongoing support").map((step, i) => (
            <li key={i}>
              <span>{step.day}</span>
              <strong>{step.title}</strong>
              <em>{step.detail}</em>
            </li>
          ))}
        </ol>
      </section>

      {notes && (
        <section className="qdoc-section">
          <h2>Notes</h2>
          <p className="qdoc-notes">{notes}</p>
        </section>
      )}

      {terms.length > 0 && (
        <section className="qdoc-section">
          <h2>Terms &amp; conditions</h2>
          <ol className="qdoc-terms">
            {terms.map((term, i) => (
              <li key={i}>{term}</li>
            ))}
          </ol>
          <p className="qdoc-row-note" style={{ marginTop: 8 }}>
            This quote is valid for {validity} days from issue.
          </p>
        </section>
      )}

      {branding.businessPhone && (
        <section className="qdoc-section qdoc-cta">
          <h2>Ready to make this real?</h2>
          <p>Reply to this quote on WhatsApp or call — we'll book a site visit within 48 hours.</p>
          <div className="qdoc-cta-row no-print">
            {whatsappNumber && (
              <a
                className="qdoc-btn qdoc-btn-primary"
                href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
                  `Hi ${branding.entityName}, I'd like to proceed with quote ${quoteId ?? ""}.`,
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                💬 Confirm on WhatsApp
              </a>
            )}
            <a className="qdoc-btn qdoc-btn-ghost" href={`tel:${branding.businessPhone.replace(/[^0-9+]/g, "")}`}>
              📞 {branding.businessPhone}
            </a>
          </div>
        </section>
      )}

      <footer className="qdoc-footer">
        <div>
          <strong>{branding.entityName}</strong>
          {branding.address && <p>{branding.address}</p>}
          {firmContact && <p>{firmContact}</p>}
          {branding.gstno && <p>GSTIN: {branding.gstno}</p>}
          {branding.footerTag && <p className="qdoc-footer-tag">{branding.footerTag}</p>}
        </div>
        <div className="qdoc-sign">
          <p className="qdoc-sign-label">Customer acceptance</p>
          <div className="qdoc-sign-line" />
          <p>Name &amp; Date</p>
        </div>
      </footer>
    </div>
  );
}
