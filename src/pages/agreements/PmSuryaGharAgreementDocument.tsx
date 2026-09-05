import type { ReactNode } from "react";
import type { CSSProperties } from "react";
import { formatINR as formatINRBase, type QuoteComputeResult } from "../../lib/quoteCalculations";
import type { PaymentScheduleRow } from "../../api/entityPreferences";
import { formatDate } from "../../lib/quoteDocumentCopy";
import type { QuoteDocumentBranding } from "../quotes/QuoteDocument";
import type { AgreementDocumentSignature } from "./AgreementDocument";
import {
  PMSG_TITLE,
  PMSG_PREAMBLE_WHEREAS_1,
  PMSG_PREAMBLE_WHEREAS_2,
  PMSG_DISCLAIMER,
  PMSG_CONSUMER_DUTIES,
  PMSG_VENDOR_DUTIES,
  PMSG_COST_CLAUSE_INDEX,
  PMSG_PAYMENT_CLAUSE_INDEX,
} from "../../lib/pmSuryaGharAgreementCopy";
import "../quotes/QuoteDocument.css";
import "./AgreementDocument.css";
import "./PmSuryaGharAgreementDocument.css";

/** Same signature shape as AgreementDocument's consumer signature, minus the
 * `signedIp` field being meaningful here (vendor signs from inside the admin
 * app, not a public link) -- kept optional so it can still be passed. */
export type PmSuryaGharVendorSignature = {
  signed?: boolean;
  signerName?: string | null;
  signatureImage?: string | null;
  signedAt?: string | null;
};

export type PmSuryaGharAgreementDocumentProps = {
  agreementNumber: string | null;
  /** Execution date -- rendered under the title. */
  createdAt: string | null;
  consumerName: string;
  consumerAddress: string | null;
  vendorName: string;
  vendorAddress: string | null;
  vendorGstin?: string | null;
  capacityKw: number;
  computed: QuoteComputeResult;
  pricePerWatt: number;
  taxRate: number;
  paymentSchedule: PaymentScheduleRow[];
  /** Consumer / First Party signature. */
  signature: AgreementDocumentSignature;
  /** Vendor / Second Party signature -- independent of the consumer's. */
  vendorSignature: PmSuryaGharVendorSignature;
  /** Rendered above the First Party signature block when unsigned -- the
   * public page's signature-pad + "Sign & accept" control. */
  signatureAction?: ReactNode;
  /** Rendered above the Second Party signature block when unsigned -- the
   * admin builder's vendor sign-pad control. */
  vendorSignatureAction?: ReactNode;
  shareUrl?: string | null;
  /** Minimal letterhead (logo/entity name only) -- this is a plain legal
   * document, not a marketing layout, so branding stays understated. */
  branding: QuoteDocumentBranding;
};

export default function PmSuryaGharAgreementDocument({
  agreementNumber,
  createdAt,
  consumerName,
  consumerAddress,
  vendorName,
  vendorAddress,
  vendorGstin,
  capacityKw,
  computed: c,
  pricePerWatt,
  taxRate,
  paymentSchedule,
  signature,
  vendorSignature,
  signatureAction,
  vendorSignatureAction,
  branding,
}: PmSuryaGharAgreementDocumentProps) {
  const formatINR = (n: number) => formatINRBase(n, branding.currency);
  const taxLabel = branding.tax_label ?? "GST";
  const taxIdLabel = branding.tax_id_label ?? "GSTIN";
  const executionDate = createdAt ? new Date(createdAt) : new Date();

  let paymentRunningTotal = 0;
  const paymentRows = paymentSchedule.map((row, i) => {
    const isLast = i === paymentSchedule.length - 1;
    const amount = isLast ? c.totalCost - paymentRunningTotal : Math.round((c.totalCost * (row.percent / 100)) / 10) * 10;
    paymentRunningTotal += amount;
    return { ...row, amount };
  });

  const vendorSigned = Boolean(vendorSignature.signed || vendorSignature.signatureImage);

  const style = {
    "--qdoc-primary": branding.primaryColor || "#333",
    "--qdoc-h1": branding.typography?.h1 || "24px",
    "--qdoc-h2": branding.typography?.h2 || "18px",
    "--qdoc-h3": branding.typography?.h3 || "15px",
    "--qdoc-body": branding.typography?.body || "14px",
    "--qdoc-small": branding.typography?.small || "12px",
  } as CSSProperties;

  return (
    <div className="qdoc pmsg" style={style}>
      <div className="qdoc-toolbar no-print">
        <button type="button" className="qdoc-print-btn" onClick={() => window.print()}>
          🖨 Print / Save PDF
        </button>
      </div>

      {branding.logoUrl && (
        <div className="pmsg-letterhead">
          <img src={branding.logoUrl} alt={branding.entityName} />
        </div>
      )}

      <header className="pmsg-header">
        <h1>{PMSG_TITLE}</h1>
        <p className="pmsg-meta">
          Agreement no. <strong>{agreementNumber ?? "DRAFT"}</strong> · Executed on{" "}
          <strong>{formatDate(executionDate)}</strong>
        </p>
      </header>

      <section className="pmsg-parties">
        <p>
          Between <strong>{consumerName || "____________"}</strong> having address at{" "}
          <strong>{consumerAddress || "____________"}</strong> (First Party)
        </p>
        <p>
          And <strong>{vendorName || "____________"}</strong> having registered office at{" "}
          <strong>{vendorAddress || "____________"}</strong>
          {vendorGstin ? <> ({taxIdLabel}: {vendorGstin})</> : null} (Second Party)
        </p>
      </section>

      <section className="pmsg-section">
        <p>{PMSG_PREAMBLE_WHEREAS_1}</p>
        <p>{PMSG_PREAMBLE_WHEREAS_2}</p>
      </section>

      <section className="pmsg-section">
        <h2>The First Party hereby undertakes to perform the following activities:</h2>
        <ol className="pmsg-numbered">
          {PMSG_CONSUMER_DUTIES.map((duty, i) => (
            <li key={i}>{duty}</li>
          ))}
        </ol>
      </section>

      <section className="pmsg-section">
        <h2>The Second Party hereby undertakes to perform the following activities:</h2>
        <ol className="pmsg-numbered">
          {PMSG_VENDOR_DUTIES.map((duty, i) => (
            <li key={i}>
              {duty.title && <strong>{duty.title} </strong>}
              {duty.body}

              {i === PMSG_COST_CLAUSE_INDEX && (
                <div className="pmsg-table-wrap">
                  <table className="qdoc-table pmsg-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Calculation</th>
                        <th className="qdoc-ta-r">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>System cost (ex-{taxLabel})</td>
                        <td>
                          <small>
                            {capacityKw} kW × ₹{pricePerWatt.toFixed(2)}/W
                          </small>
                        </td>
                        <td className="qdoc-ta-r">{formatINR(c.baseCost)}</td>
                      </tr>
                      <tr>
                        <td>
                          {taxLabel} @ {taxRate.toFixed(1)}%
                        </td>
                        <td>
                          <small>Solar PV generating system</small>
                        </td>
                        <td className="qdoc-ta-r">{formatINR(c.gstAmount)}</td>
                      </tr>
                      <tr className="qdoc-row-strong">
                        <td>Total system cost</td>
                        <td>
                          <small>Inclusive of {taxLabel}</small>
                        </td>
                        <td className="qdoc-ta-r">{formatINR(c.totalCost)}</td>
                      </tr>
                      {c.subsidy > 0 && (
                        <>
                          <tr className="qdoc-row-accent">
                            <td>Less: PM Surya Ghar subsidy</td>
                            <td>
                              <small>Credited by government to consumer's bank account</small>
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
                </div>
              )}

              {i === PMSG_PAYMENT_CLAUSE_INDEX && (
                <div className="pmsg-table-wrap">
                  <table className="qdoc-table qdoc-table-pay pmsg-table">
                    <tbody>
                      {paymentRows.map((row, j) => (
                        <tr key={j}>
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
                        <td>NEFT / RTGS / Cheque to {vendorName}</td>
                        <td className="qdoc-ta-r">{formatINR(c.totalCost)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="pmsg-section">
        <p className="pmsg-disclaimer">{PMSG_DISCLAIMER}</p>
      </section>

      <section className="pmsg-signblock">
        <div className="pmsg-signcol">
          <h3>First Party</h3>
          {signature.signed ? (
            <div className="pmsg-signed">
              <p>
                <span className="pmsg-signed-label">Name:</span> {signature.signerName}
              </p>
              <p>
                <span className="pmsg-signed-label">Address:</span> {consumerAddress || "—"}
              </p>
              <div className="pmsg-signed-block">
                <span className="pmsg-signed-label">Sign:</span>
                {signature.signatureImage && (
                  <img className="pmsg-signed-img" src={signature.signatureImage} alt="First Party signature" />
                )}
              </div>
              <p>
                <span className="pmsg-signed-label">Date:</span>{" "}
                {signature.signedAt ? formatDate(new Date(signature.signedAt)) : "—"}
              </p>
            </div>
          ) : (
            <>
              {signatureAction && <div className="pmsg-sign-action no-print">{signatureAction}</div>}
              <div className="pmsg-blank-field">
                <span className="pmsg-blank-label">Name</span>
                <span className="pmsg-blank-line" />
              </div>
              <div className="pmsg-blank-field">
                <span className="pmsg-blank-label">Address</span>
                <span className="pmsg-blank-line" />
              </div>
              <div className="pmsg-blank-field">
                <span className="pmsg-blank-label">Sign</span>
                <span className="pmsg-blank-line" />
              </div>
              <div className="pmsg-blank-field">
                <span className="pmsg-blank-label">Date</span>
                <span className="pmsg-blank-line" />
              </div>
            </>
          )}
        </div>

        <div className="pmsg-signcol">
          <h3>Second Party</h3>
          {vendorSigned ? (
            <div className="pmsg-signed">
              <p>
                <span className="pmsg-signed-label">Name:</span> {vendorSignature.signerName}
              </p>
              <p>
                <span className="pmsg-signed-label">Address:</span> {vendorAddress || "—"}
              </p>
              <div className="pmsg-signed-block">
                <span className="pmsg-signed-label">Sign:</span>
                {vendorSignature.signatureImage && (
                  <img className="pmsg-signed-img" src={vendorSignature.signatureImage} alt="Second Party signature" />
                )}
              </div>
              <p>
                <span className="pmsg-signed-label">Date:</span>{" "}
                {vendorSignature.signedAt ? formatDate(new Date(vendorSignature.signedAt)) : "—"}
              </p>
            </div>
          ) : (
            <>
              {vendorSignatureAction && <div className="pmsg-sign-action no-print">{vendorSignatureAction}</div>}
              <div className="pmsg-blank-field">
                <span className="pmsg-blank-label">Name</span>
                <span className="pmsg-blank-line" />
              </div>
              <div className="pmsg-blank-field">
                <span className="pmsg-blank-label">Address</span>
                <span className="pmsg-blank-line" />
              </div>
              <div className="pmsg-blank-field">
                <span className="pmsg-blank-label">Sign</span>
                <span className="pmsg-blank-line" />
              </div>
              <div className="pmsg-blank-field">
                <span className="pmsg-blank-label">Date</span>
                <span className="pmsg-blank-line" />
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
