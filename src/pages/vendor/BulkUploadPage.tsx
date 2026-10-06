import { useState } from "react";
import { ApiError } from "../../api/client";
import { bulkUpload, downloadListingTemplate, type BulkUploadResult } from "../../api/vendorListings";
import { useAuth } from "../../lib/AuthContext";
import "../marketplace/mp.css";

export default function BulkUploadPage() {
  const { user } = useAuth();
  const entityId = user?.entity_id ?? null;
  const [file, setFile] = useState<File | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function template() {
    if (entityId == null) return;
    try {
      const blob = await downloadListingTemplate(entityId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "listings-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }

  async function run(dry: boolean) {
    if (entityId == null || !file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await bulkUpload(entityId, file, { dry_run: dry, skip_invalid: skipInvalid }));
    } catch (e) {
      setResult(null);
      setError(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mp-page">
      <h1>Bulk upload listings</h1>
      <p className="mp-intro">
        Create or update many listings from a CSV. Rows are matched on product + SKU, and stock is set to the quantity in the
        file, so re-uploading the same file changes nothing. Always run a check first.
      </p>
      <div className="mp-card">
        <div className="mp-row" style={{ marginTop: 0 }}>
          <button className="mp-btn" onClick={template}>
            Download template
          </button>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </div>
        <div className="mp-row">
          <label>
            <input type="checkbox" checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} /> Skip invalid rows and
            apply the rest (otherwise one bad row blocks everything)
          </label>
        </div>
        <div className="mp-row">
          <button className="mp-btn" disabled={!file || busy} onClick={() => run(true)}>
            Check file (dry run)
          </button>
          <button className="mp-btn primary" disabled={!file || busy} onClick={() => run(false)}>
            Upload &amp; apply
          </button>
        </div>
        {error && (
          <p className="mp-error" role="alert">
            {error}
          </p>
        )}
      </div>

      {result && (
        <div className="mp-card">
          <p>
            <strong>{result.dry_run ? "Dry run — nothing saved." : result.applied ? "Applied." : "Not applied."}</strong> {result.total_rows}{" "}
            rows: {result.created} created, {result.updated} updated, {result.unchanged} unchanged, {result.error_count} with errors.
          </p>
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Result</th>
                  <th>Problems</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td>
                      <span className={`mp-badge ${r.status === "ERROR" ? "bad" : "ok"}`}>{r.status}</span>
                    </td>
                    <td>{r.errors.map((x) => `${x.field}: ${x.message}`).join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
