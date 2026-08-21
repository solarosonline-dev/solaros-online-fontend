import { useRef, useState } from "react";
import {
  extractBillFromFile,
  calculateAverageConsumption,
  calculateAverageUnits,
  suggestSystemSize,
  type ExtractedBillData,
} from "../../lib/billExtractor";

type Props = {
  onExtracted: (data: ExtractedBillData) => void;
};

export default function BillUploadWidget({ onExtracted }: Props) {
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
      const data: ExtractedBillData = await extractBillFromFile(file);
      onExtracted(data);

      const avgBill = calculateAverageConsumption(data);
      const avgUnits = calculateAverageUnits(data);
      const suggestion = suggestSystemSize(data);
      const parts: string[] = [];
      if (suggestion) parts.push(`~${suggestion.recommendedKW} kW suggested system size`);
      if (avgBill) parts.push(`₹${avgBill}/mo avg bill`);
      if (avgUnits) parts.push(`${avgUnits} kWh/mo avg usage`);
      setExtractSummary(parts.length ? parts.join(" · ") : "Extracted what we could — please check the fields below.");
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Couldn't read this PDF — please fill the form manually.");
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
