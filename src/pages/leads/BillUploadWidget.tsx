import { useRef, useState } from "react";
import { extractLeadFromBill, type ExtractedLeadData } from "../../api/leads";
import { ApiError } from "../../api/client";

type Props = {
  entityId: number;
  onExtracted: (data: ExtractedLeadData) => void;
};

export default function BillUploadWidget({ entityId, onExtracted }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractSummary, setExtractSummary] = useState<string | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtractError(null);
    setExtractSummary(null);
    setExtracting(true);
    try {
      const data = await extractLeadFromBill(entityId, file);
      onExtracted(data);

      const parts: string[] = [];
      if (data.avg_monthly_bill) parts.push(`₹${data.avg_monthly_bill}/mo avg bill`);
      if (data.avg_monthly_units != null) parts.push(`${data.avg_monthly_units} kWh/mo avg usage`);
      setExtractSummary(parts.length ? parts.join(" · ") : "Extracted what we could — please check the fields below.");
    } catch (err) {
      setExtractError(
        err instanceof ApiError ? err.message : "Couldn't read this PDF — please fill the form manually.",
      );
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="add-lead-upload">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />
      <button type="button" className="leads-btn" onClick={() => fileInputRef.current?.click()} disabled={extracting}>
        {extracting ? "Reading bill…" : "📄 Autofill from electricity bill (PDF)"}
      </button>
      <span className="add-lead-upload-status">optional — fills in the fields below</span>
      {extractError && <p className="add-lead-upload-status error">{extractError}</p>}
      {extractSummary && <div className="add-lead-summary">{extractSummary}</div>}
    </div>
  );
}
