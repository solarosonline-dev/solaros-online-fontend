import type { ReactNode } from "react";
import type { CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import { formatINR, type QuoteComputeResult } from "../../lib/quoteCalculations";
import type { PaymentScheduleRow } from "../../api/entityPreferences";
import type { QuoteComponentRow } from "../../api/quotes";
import { formatDate, SEGMENT_LABELS } from "../../lib/quoteDocumentCopy";
import { AGREEMENT_ACKNOWLEDGEMENT, AGREEMENT_SCOPE_ITEMS, EQUIPMENT_ROWS } from "../../lib/agreementDocumentCopy";
import type { QuoteDocumentBranding } from "../quotes/QuoteDocument";
import "../quotes/QuoteDocument.css";
import "./AgreementDocument.css";

export type AgreementDocumentAmc = { name: string; ratePerKw: number | null; inclusion: string[] } | null;

export type AgreementDocumentAmcPost5 = {
  enabled: boolean;
  /** Up to 3 plans, selected from the same AMC catalog as `amc`. */
  plans: { name: string; ratePerKw: number | null; inclusion: string[] }[];
};

export type AgreementDocumentSignature = {
  signed: boolean;
  signerName?: string | null;
  signatureImage?: string | null;
  signedAt?: string | null;
  signedIp?: string | null;
};

export type AgreementDocumentProps = {
  agreementId: number | null;
  createdAt: string | null;
  quoteId: number | null;
  capacityKw: number;
  panelMake: string | null;
  inverterMake: string | null;
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
  /** True when this AMC data was already committed on the linked quote
   * (not freshly offered here) — the quote's AMC is always a single plan,
   * so the multi-select `amcPlans` never applies in that case, and the
   * section reads as "already included" rather than "recommended add-on". */
  amcFromQuote: boolean;
  /** Single years 1-5 plan — used when amcMode is "included" (one bundled
   * plan is all that makes sense for a freebie), or when amcFromQuote is
   * true (the quote's own AMC is always a single plan regardless of mode). */
  amc: AgreementDocumentAmc;
  /** Years 1-5 multi-select — used only when the agreement is offering its
   * own AMC fresh (amcFromQuote is false) and amcMode is "chargeable",
   * since the customer is paying either way and can be given a few tiers
   * to choose from, same as the years 6-15 upsell already offers. Up to 3
   * plans. */
  amcPlans: { name: string; ratePerKw: number | null; inclusion: string[] }[];
  amcDurationYears: number | null;
  amcMode: "included" | "chargeable";
  amcPost5: AgreementDocumentAmcPost5;
  paymentSchedule: PaymentScheduleRow[];
  terms: string[];
  branding: QuoteDocumentBranding;
  shareUrl?: string | null;
  signature: AgreementDocumentSignature;
  /** Rendered above the signature line when unsigned — the public page's
   * signature-pad + "Sign & accept" control. Omitted on the EPC-side
   * builder preview, which has no visitor to sign. */
  signatureAction?: ReactNode;
};

export default function AgreementDocument({
  agreementId,
  createdAt,
  quoteId,
  capacityKw,
  panelMake,
  inverterMake,
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
  amcFromQuote,
  amc,
  amcPlans,
  amcDurationYears,
  amcMode,
  amcPost5,
  paymentSchedule,
  terms,
  branding,
  shareUrl,
  signature,
  signatureAction,
}: AgreementDocumentProps) {
  const segLabel = SEGMENT_LABELS[segment ?? ""] ?? "Custom";
  const issuedOn = createdAt ? new Date(createdAt) : new Date();

  const findWarrantyYears = (keywords: string[]): number | null => {
    const row = components.find((r) => {
      const particular = (r.particular ?? "").toLowerCase();
      return keywords.some((k) => particular.includes(k));
    });
    return row?.warranty_years ?? null;
  };
  const equipmentRows = EQUIPMENT_ROWS.map((row) => {
    const make =
      row.label === "Solar Panels" ? panelMake : row.label === "Inverter" ? inverterMake : null;
    const warrantyYears = findWarrantyYears(row.keywords);
    return { ...row, make, warrantyYears };
  });

  let paymentRunningTotal = 0;
  const paymentRows = paymentSchedule.map((row, i) => {
    const isLast = i === paymentSchedule.length - 1;
    const amount = isLast ? c.totalCost - paymentRunningTotal : Math.round((c.totalCost * (row.percent / 100)) / 10) * 10;
    paymentRunningTotal += amount;
    return { ...row, amount };
  });

  const amcYearly = amc?.ratePerKw != null ? Math.round(amc.ratePerKw * capacityKw) : null;
  const amcTotal = amcYearly != null && amcDurationYears != null ? amcYearly * amcDurationYears : null;
  const amc5Free = amcMode === "included";

  // Years 1-5: a single plan when "included" (a freebie only makes sense
  // as one plan) or when amcFromQuote (the quote's own AMC is always a
  // single plan, regardless of mode) — otherwise, when the agreement is
  // freshly offering a "chargeable" AMC, up to 3 plans to choose from,
  // since the customer is paying either way and can be given a few tiers
  // instead of just one, same as years 6-15 already offers.
  const yr1to5Multi = !amc5Free && !amcFromQuote;
  const yr1to5Plans = yr1to5Multi ? amcPlans.slice(0, 3) : [];
  const yr1to5Include = yr1to5Multi ? yr1to5Plans.length > 0 : amc != null;
  const yr1to5TileData = yr1to5Plans.map((p) => {
    const ratePerKw = p.ratePerKw ?? 0;
    const yearly = Math.round(ratePerKw * capacityKw);
    const total = amcDurationYears != null ? yearly * amcDurationYears : null;
    return { ...p, ratePerKw, yearly, total };
  });

  // Same tile-grid combination logic as QuoteDocument's AMC section: the
  // years 1-5 AMC and up to 3 years 6-15 upsell plans render together as
  // columns when they fit 3-across; once there are 4+ tiles total the
  // post5 plans move to their own 3-column row instead of splitting
  // across rows mid-group.
  const post5Plans = amcPost5.plans.slice(0, 3);
  const post5Include = amcPost5.enabled && capacityKw > 0 && post5Plans.length > 0;
  const post5TileData = post5Plans.map((p) => {
    const ratePerKw = p.ratePerKw ?? 0;
    const yearly = Math.round(ratePerKw * capacityKw);
    return { ...p, ratePerKw, yearly, tenYr: yearly * 10 };
  });
  const combinedTileCount = (yr1to5Multi ? yr1to5TileData.length : amc ? 1 : 0) + (post5Include ? post5TileData.length : 0);
  const post5OwnRow = combinedTileCount > 3;
  const gridClassForCount = (n: number) => (n === 1 ? "qdoc-tile-grid--single" : n === 2 ? "qdoc-tile-grid--pair" : "");
  const YR1_5_TILE_STYLES = ["qdoc-tile--feature", "qdoc-tile--green-dark", "qdoc-tile--purple"];
  const POST5_TILE_STYLES = ["qdoc-tile--orange", "qdoc-tile--green-dark", "qdoc-tile--purple"];

  const firmContact = [branding.businessEmail, branding.businessPhone].filter(Boolean).join(" · ");

  // Numbered like the reference document (1, 2, 3, ...) — numbers stay
  // sequential even though Terms is conditionally rendered, rather than
  // leaving a gap when it's skipped. AMC always renders now (either as an
  // already-committed quote inclusion or a fresh agreement offer), so it
  // always gets a number.
  let sectionNumber = 1;
  const numProvides = sectionNumber++;
  const numPrice = sectionNumber++;
  const numEquipment = sectionNumber++;
  const numPayment = sectionNumber++;
  const numAmc = sectionNumber++;
  const numTerms = terms.length > 0 ? sectionNumber++ : null;

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
          <p className="qdoc-tagline">Solar Rooftop Installation Agreement</p>
          {branding.address && <p className="qdoc-creds">{branding.address}</p>}
          {firmContact && <p className="qdoc-creds">{firmContact}</p>}
          {branding.gstno && <p className="qdoc-creds">GSTIN: {branding.gstno}</p>}
        </div>
        <div className="qdoc-meta">
          <div>
            <span className="qdoc-meta-label">Agreement no.</span>
            <strong>{agreementId ?? "DRAFT"}</strong>
          </div>
          <div className="qdoc-meta-row">
            <div>
              <span className="qdoc-meta-label">Date</span>
              <strong>{formatDate(issuedOn)}</strong>
            </div>
            <div>
              <span className="qdoc-meta-label">System</span>
              <strong>{capacityKw ? `${capacityKw} kWp` : "—"}</strong>
            </div>
            {quoteId != null && (
              <div>
                <span className="qdoc-meta-label">Quote ref.</span>
                <strong>{quoteId}</strong>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="qdoc-hero agr-hero">
        <div>
          <p className="qdoc-eyebrow">Between {branding.entityName} &amp; Customer · {segLabel}</p>
          <h1>
            <span className="qdoc-customer-name">{customerName || "Valued customer"}</span>
            {customerCompany && <small> · {customerCompany}</small>}
          </h1>
          {customerAddress && <p className="qdoc-address">{customerAddress}</p>}
          <p className="qdoc-address qdoc-address-muted">
            {[customerDiscom, customerMobile, customerEmail].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="qdoc-pitch">
          <p>
            This agreement covers the supply, installation, testing and commissioning of a{" "}
            <strong>{capacityKw ? `${capacityKw} kWp` : "____ kWp"}</strong> rooftop solar system on a{" "}
            <strong>RCC</strong> roof, at the price and terms set out below.
          </p>
        </div>
      </section>

      <section className="qdoc-section">
        <h2>
          {numProvides}. What {branding.entityName} provides <small className="qdoc-h2-sub">— turnkey scope</small>
        </h2>
        <ul className="qdoc-incl">
          {AGREEMENT_SCOPE_ITEMS.map((item, i) => (
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

      <section className="qdoc-section">
        <h2>{numPrice}. Agreed price</h2>
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
              <td>Total system cost</td>
              <td>
                <small>Inclusive of GST</small>
              </td>
              <td className="qdoc-ta-r">{formatINR(c.totalCost)}</td>
            </tr>
            {c.subsidy > 0 && (
              <>
                <tr className="qdoc-row-accent">
                  <td>Less: PM Surya Ghar subsidy</td>
                  <td>
                    <small>Credited by government to customer's bank account</small>
                  </td>
                  <td className="qdoc-ta-r qdoc-amt-green">– {formatINR(c.subsidy)}</td>
                </tr>
                <tr className="qdoc-row-total">
                  <td>Net effective cost</td>
                  <td>
                    <small>After subsidy · subsidy varies by state</small>
                  </td>
                  <td className="qdoc-ta-r">{formatINR(c.netInvestment)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
        {c.subsidy > 0 && (
          <p className="qdoc-row-note">
            The {formatINR(c.subsidy)} PM Surya Ghar subsidy is credited directly by the government to the
            customer's bank account after net-metering. Payment milestones below are calculated on the total system
            cost; the subsidy is not deducted from amounts payable to {branding.entityName}.
          </p>
        )}
      </section>

      <section className="qdoc-section">
        <h2>{numEquipment}. Equipment — make, model &amp; warranty</h2>
        <table className="qdoc-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Make</th>
              <th>Model</th>
              <th className="qdoc-ta-r">Warranty</th>
            </tr>
          </thead>
          <tbody>
            {equipmentRows.map((row) => (
              <tr key={row.label}>
                <td>
                  <strong>{row.label}</strong>
                </td>
                <td>{row.make || <span className="qdoc-placeholder">to be confirmed</span>}</td>
                <td>
                  <span className="qdoc-placeholder">to be confirmed</span>
                </td>
                <td className="qdoc-ta-r">
                  {row.warrantyYears != null ? (
                    `${row.warrantyYears} yr`
                  ) : (
                    <span className="qdoc-placeholder">to be confirmed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="qdoc-row-note">
          Warranty on all electrical components is as provided by the make and model, and warranty cards are handed
          over before installation. Beyond the stated warranty period, repair or replacement is at the customer's
          cost.
        </p>
      </section>

      <section className="qdoc-section">
        <h2>{numPayment}. Payment schedule</h2>
        <table className="qdoc-table qdoc-table-pay">
          <tbody>
            {paymentRows.map((row, i) => (
              <tr key={i}>
                <td>
                  <strong>{row.percent}%</strong> {row.label}
                </td>
                <td>{row.description}</td>
                <td className="qdoc-ta-r">
                  <strong>{formatINR(row.amount)}</strong>
                </td>
              </tr>
            ))}
            <tr className="qdoc-row-total">
              <td>Total</td>
              <td>NEFT / RTGS / Cheque to {branding.entityName}</td>
              <td className="qdoc-ta-r">{formatINR(c.totalCost)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="qdoc-section qdoc-amc">
        <h2>
          {numAmc}. AMC{" "}
          <small className="qdoc-h2-sub">
            {amcFromQuote ? "— included with your accepted quote" : "— recommended add-on"}
          </small>
        </h2>
        {yr1to5Include || post5Include ? (
            <>
              {(() => {
                // Included mode, or already committed via the quote: one
                // tile, since a freebie or an already-agreed plan is only
                // ever one plan. Otherwise (agreement freshly offering a
                // chargeable AMC): up to 3 tiles the customer picks
                // between, same treatment as the years 6-15 upsell below.
                const yr1to5Tiles = !yr1to5Multi
                  ? amc
                    ? [
                        <article className="qdoc-tile qdoc-tile--feature" key="amc-5yr">
                          <div className="qdoc-tile-tag">
                            {amc5Free
                              ? "Included · 5 years"
                              : amcFromQuote
                                ? `From your quote · ${amcDurationYears ?? 5} years`
                                : "Recommended · 5 years"}
                          </div>
                          <h3>{amc.name}</h3>
                          {amc5Free ? (
                            <>
                              <p className="qdoc-tile-price">
                                Included<small> · free of cost</small>
                              </p>
                              <p className="qdoc-tile-rate">
                                Bundled with your system at no extra charge
                                {amc.ratePerKw != null
                                  ? ` — worth ${formatINR(amc.ratePerKw)}/kW/yr${
                                      amcTotal != null && amcDurationYears ? ` (${formatINR(amcTotal)} over ${amcDurationYears} years)` : ""
                                    }.`
                                  : "."}
                              </p>
                            </>
                          ) : amcYearly != null ? (
                            <>
                              <p className="qdoc-tile-price">
                                {formatINR(amcYearly)}
                                <small> / year</small>
                              </p>
                              <p className="qdoc-tile-rate">
                                {formatINR(amc.ratePerKw ?? 0)}/kW/yr × {capacityKw} kW
                                {amcTotal != null && amcDurationYears ? ` · ${formatINR(amcTotal)} for ${amcDurationYears} year(s)` : ""}
                              </p>
                            </>
                          ) : (
                            <p className="qdoc-tile-rate">Contact us for pricing.</p>
                          )}
                          {amc.inclusion.length > 0 && (
                            <ul>
                              {amc.inclusion.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          )}
                        </article>,
                      ]
                    : []
                  : yr1to5TileData.map((plan, i) => (
                      <article className={`qdoc-tile ${YR1_5_TILE_STYLES[i % YR1_5_TILE_STYLES.length]}`} key={`yr1to5-${i}`}>
                        <div className="qdoc-tile-tag">Years 1-5{amcDurationYears ? ` · ${amcDurationYears} years` : ""}</div>
                        <h3>{plan.name}</h3>
                        <p className="qdoc-tile-price">
                          {formatINR(plan.yearly)}
                          <small> / year</small>
                        </p>
                        <p className="qdoc-tile-rate">
                          {formatINR(plan.ratePerKw)}/kW/yr × {capacityKw} kW
                          {plan.total != null && amcDurationYears ? ` · ${formatINR(plan.total)} for ${amcDurationYears} year(s)` : ""}
                        </p>
                        {plan.inclusion.length > 0 && (
                          <ul>
                            {plan.inclusion.map((item, j) => (
                              <li key={j}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </article>
                    ));

                const post5Tiles = post5Include
                  ? post5TileData.map((plan, i) => (
                      <article className={`qdoc-tile ${POST5_TILE_STYLES[i % POST5_TILE_STYLES.length]}`} key={`post5-${i}`}>
                        <div className="qdoc-tile-tag">Years 6-15 · 10 years</div>
                        <h3>{plan.name}</h3>
                        <p className="qdoc-tile-price">
                          {formatINR(plan.yearly)}
                          <small> / year</small>
                        </p>
                        <p className="qdoc-tile-rate">
                          {formatINR(plan.ratePerKw)}/kW/yr × {capacityKw} kW · {formatINR(plan.tenYr)} for 10 years
                        </p>
                        {plan.inclusion.length > 0 && (
                          <ul>
                            {plan.inclusion.map((item, j) => (
                              <li key={j}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </article>
                    ))
                  : [];

                if (!post5OwnRow) {
                  const combined = [...yr1to5Tiles, ...post5Tiles];
                  return <div className={`qdoc-tile-grid ${gridClassForCount(combined.length)}`}>{combined}</div>;
                }

                return (
                  <>
                    <div className={`qdoc-tile-grid ${gridClassForCount(yr1to5Tiles.length)}`}>{yr1to5Tiles}</div>
                    <h3 className="qdoc-post5-heading" style={{ marginTop: 28, marginBottom: 14 }}>
                      Years 6–15 <small>— continue the same care for the next 10 years</small>
                    </h3>
                    <div className="qdoc-tile-grid">{post5Tiles}</div>
                  </>
                );
              })()}
              {post5Include && (
                <p className="qdoc-row-note" style={{ marginTop: 12 }}>
                  Years 6–15 AMC pricing shown above is indicative, based on today's rates. It is only a guide to
                  what maintenance may cost after year 5 — the actual price applicable at that time will follow the
                  AMC rates prevailing on that day.
                </p>
              )}
            </>
          ) : amcFromQuote ? (
            <article className="qdoc-tile qdoc-tile--chargeable">
              <div className="qdoc-tile-tag">Unavailable</div>
              <h3>AMC details could not be loaded</h3>
              <p className="qdoc-tile-rate">
                Your quote included AMC, but its plan details are unavailable right now — contact your sales
                representative for the specifics.
              </p>
            </article>
          ) : (
            <article className="qdoc-tile qdoc-tile--chargeable">
              <div className="qdoc-tile-tag">Not included</div>
              <h3>AMC is not bundled with this agreement</h3>
              <p className="qdoc-tile-rate">
                Annual maintenance is available as a chargeable add-on — ask your sales contact for current rates.
              </p>
            </article>
          )}
          <p className="qdoc-row-note" style={{ marginTop: 12 }}>
            Installation workmanship is warranted for 12 months, valid only while an AMC is active. Without AMC,
            after 12 months {branding.entityName} is not responsible for warranty, service or system performance,
            and any visit is charged separately.
          </p>
      </section>

      {terms.length > 0 && (
        <section className="qdoc-section">
          <h2>{numTerms}. Terms &amp; conditions</h2>
          <ol className="qdoc-terms">
            {terms.map((term, i) => (
              <li key={i}>{term}</li>
            ))}
          </ol>
        </section>
      )}

      <footer className="qdoc-footer agr-footer">
        <div>
          <strong>{branding.entityName}</strong>
          {branding.address && <p>{branding.address}</p>}
          {firmContact && <p>{firmContact}</p>}
          {branding.gstno && <p>GSTIN: {branding.gstno}</p>}
          {branding.footerTag && <p className="qdoc-footer-tag">{branding.footerTag}</p>}
        </div>
        <div className="qdoc-qr">
          <div className="qdoc-qr-code">
            {shareUrl ? (
              <QRCodeSVG value={shareUrl} size={64} />
            ) : (
              <div className="agr-qr-pending" aria-label="QR code will appear once this agreement is shared">
                QR pending
              </div>
            )}
          </div>
          <p className="qdoc-powered-by">
            Powered by <strong>SolarOS</strong>
          </p>
        </div>
        <div className="qdoc-sign agr-sign-col">
          {signature.signed ? (
            <div className="agr-signed">
              {signature.signatureImage && (
                <img className="agr-signed-img" src={signature.signatureImage} alt="Customer signature" />
              )}
              <p className="agr-signed-name">{signature.signerName}</p>
              <p className="agr-signed-meta">
                Signed electronically on {signature.signedAt ? formatDate(new Date(signature.signedAt)) : "—"}
                {signature.signedIp ? ` · IP ${signature.signedIp}` : ""}
              </p>
              <p className="agr-signed-consent">✔ Consent recorded — the customer accepted the terms above.</p>
            </div>
          ) : (
            <>
              {signatureAction && <div className="qdoc-sign-action no-print">{signatureAction}</div>}
              <p className="qdoc-sign-label">Customer acceptance</p>
              <p className="agr-ack">{AGREEMENT_ACKNOWLEDGEMENT}</p>
              <div className="qdoc-sign-line" />
              <p>Name, Signature &amp; Date</p>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
