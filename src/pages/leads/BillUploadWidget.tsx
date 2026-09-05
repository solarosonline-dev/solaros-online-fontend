import { useRef, useState } from "react";
import { extractLeadFromBill, type ExtractedLeadData } from "../../api/leads";
import { ApiError } from "../../api/client";
import ConfirmDialog from "../../components/ConfirmDialog";

type Props = {
  entityId: number;
  onExtracted: (data: ExtractedLeadData) => void;
  /** Whether the form already has any details filled in (typed manually or
   * from an earlier bill upload) -- gates the "this will clear the form"
   * confirmation before a new file is read. */
  hasExistingDetails: boolean;
  /** Clears every field on the form -- called only after the admin confirms
   * overwriting, right before the newly selected file is sent for
   * extraction. */
  onResetDetails: () => void;
};

export default function BillUploadWidget({ entityId, onExtracted, hasExistingDetails, onResetDetails }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractSummary, setExtractSummary] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  async function processFile(file: File) {
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
        err instanceof ApiError ? err.message : "Couldn't read this file — please fill the form manually.",
      );
    } finally {
      setExtracting(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately (not just on completion) so selecting the same file
    // again -- e.g. after cancelling the confirmation below -- still fires
    // a change event.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    if (hasExistingDetails) {
      setPendingFile(file);
      return;
    }
    void processFile(file);
  }

  function handleConfirmReset() {
    const file = pendingFile;
    setPendingFile(null);
    if (!file) return;
    onResetDetails();
    void processFile(file);
  }

  return (
    <div className="add-lead-upload">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />
      <button type="button" className="leads-btn" onClick={() => fileInputRef.current?.click()} disabled={extracting}>
        {extracting && <span className="add-lead-upload-spinner" aria-hidden="true" />}
        {extracting ? "Reading bill…" : "📄 Autofill from electricity bill (PDF or photo)"}
      </button>
      <span className="add-lead-upload-status">optional — fills in the fields below</span>
      {extractError && <p className="add-lead-upload-status error">{extractError}</p>}
      {extractSummary && (
        <div className="add-lead-summary">
          {extractSummary}
          <p className="add-lead-ai-notice">
            These details were extracted with AI — please review them for accuracy before saving.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={pendingFile != null}
        title="Replace the current details?"
        message="This form already has details filled in. Uploading a new bill will clear everything and refill it from the new file. Continue?"
        confirmLabel="Clear and continue"
        cancelLabel="Keep current details"
        onConfirm={handleConfirmReset}
        onCancel={() => setPendingFile(null)}
      />
    </div>
  );
}
