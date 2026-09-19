import { useEffect, useRef, useState } from "react";
import {
  getCommissioning,
  advanceCommissioningStage,
  updateNetmeterApplicationNumber,
  uploadCommissioningScreenshot,
  deleteCommissioningScreenshot,
  nextCommissioningStage,
  COMMISSIONING_STAGE_SEQUENCE,
  COMMISSIONING_STAGE_LABEL,
  MAX_COMMISSIONING_SCREENSHOT_SIZE_BYTES,
  type CommissioningDetail,
} from "../../api/commissioning";
import { ApiError } from "../../api/client";
import ConfirmDialog from "../../components/ConfirmDialog";

const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.webp";

/** The Discom net-meter lifecycle for a COMMISSIONING work order -- its own
 * 4-stage state machine (apply net meter / Discom visit / meter installation
 * / meter commissioning), distinct from and finer-grained than the generic
 * NEW/IN_PROGRESS/COMPLETED WorkOrder.status every other type uses. Rendered
 * by WorkOrderDetailPage in place of the generic next-status button for
 * wo.type === "COMMISSIONING" -- the backend itself rejects the generic
 * PATCH .../status endpoint for this type (409 USE_COMMISSIONING_STAGE_
 * ENDPOINT), so this panel's own advance action is the only way forward. */
export default function CommissioningPanel({
  entityId,
  workOrderId,
  onAdvanced,
}: {
  entityId: number;
  workOrderId: number;
  /** Fired right after a successful stage advance -- work_order_status
   * reflects the WorkOrder's own status post-advance (flips NEW -> IN_PROGRESS
   * on the first advance, IN_PROGRESS -> COMPLETED on reaching
   * METER_COMMISSIONING); project_status is the project's current status
   * either way (only actually changes on that final completion). Lets the
   * parent page refresh its own header/status display without a full reload. */
  onAdvanced?: (result: { work_order_status: string; project_status: string | null }) => void;
}) {
  const [commissioning, setCommissioning] = useState<CommissioningDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [applicationNumber, setApplicationNumber] = useState("");
  const [savingApplicationNumber, setSavingApplicationNumber] = useState(false);
  const [applicationNumberStatus, setApplicationNumberStatus] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingScreenshot, setDeletingScreenshot] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    getCommissioning(entityId, workOrderId)
      .then((res) => {
        setCommissioning(res);
        setApplicationNumber(res.netmeter_application_number ?? "");
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load commissioning detail"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, workOrderId]);

  async function handleSaveApplicationNumber() {
    setSavingApplicationNumber(true);
    setApplicationNumberStatus(null);
    try {
      const res = await updateNetmeterApplicationNumber(entityId, workOrderId, applicationNumber.trim() || null);
      setCommissioning(res);
      setApplicationNumberStatus({ kind: "success", message: "Application number saved." });
    } catch (err) {
      setApplicationNumberStatus({
        kind: "error",
        message: err instanceof ApiError ? err.message : "Could not save application number",
      });
    } finally {
      setSavingApplicationNumber(false);
    }
  }

  async function handleAdvance() {
    if (!commissioning) return;
    const target = nextCommissioningStage(commissioning.current_stage);
    if (!target) return;
    setAdvancing(true);
    setAdvanceError(null);
    try {
      const res = await advanceCommissioningStage(entityId, workOrderId, target);
      setCommissioning((prev) => (prev ? { ...prev, current_stage: res.current_stage } : prev));
      onAdvanced?.({ work_order_status: res.work_order_status, project_status: res.project_status });
      // completed_at/updated_at aren't in the stage-advance response -- reload
      // to pick those up (and the now-terminal current_stage) accurately
      // rather than guessing them client-side.
      load();
    } catch (err) {
      setAdvanceError(err instanceof ApiError ? err.message : "Could not advance stage");
    } finally {
      setAdvancing(false);
    }
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after an error
    if (!file) return;
    if (file.size > MAX_COMMISSIONING_SCREENSHOT_SIZE_BYTES) {
      setUploadError(
        `${file.name} — must be ${MAX_COMMISSIONING_SCREENSHOT_SIZE_BYTES / (1024 * 1024)} MB or smaller.`,
      );
      return;
    }
    setUploading(true);
    setUploadError(null);
    uploadCommissioningScreenshot(entityId, workOrderId, file)
      .then(setCommissioning)
      .catch((err) => setUploadError(err instanceof ApiError ? err.message : "Could not upload screenshot"))
      .finally(() => setUploading(false));
  }

  async function handleDeleteScreenshot() {
    setConfirmDeleteOpen(false);
    setDeletingScreenshot(true);
    setUploadError(null);
    try {
      await deleteCommissioningScreenshot(entityId, workOrderId);
      setCommissioning((prev) =>
        prev ? { ...prev, screenshot_file_name: null, screenshot_content_type: null, screenshot_download_url: null } : prev,
      );
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Could not delete screenshot");
    } finally {
      setDeletingScreenshot(false);
    }
  }

  if (loading) return <div className="projects-loading">Loading…</div>;
  if (loadError || !commissioning) {
    return <p className="projects-status error">{loadError ?? "Commissioning detail not found."}</p>;
  }

  const stageIdx = COMMISSIONING_STAGE_SEQUENCE.indexOf(commissioning.current_stage);
  const isComplete = commissioning.current_stage === "METER_COMMISSIONING";
  const nextStage = nextCommissioningStage(commissioning.current_stage);

  return (
    <>
      <p className="projects-section-label">Commissioning (net meter)</p>

      <div className="project-detail-stepper">
        {COMMISSIONING_STAGE_SEQUENCE.map((stage, i) => (
          <span
            key={stage}
            className={`project-step${i < stageIdx || (i === stageIdx && isComplete) ? " done" : ""}${
              i === stageIdx && !isComplete ? " current" : ""
            }`}
          >
            {COMMISSIONING_STAGE_LABEL[stage]}
          </span>
        ))}
      </div>

      <div className="project-detail-panel">
        <div className="project-detail-row">
          <span>Discom application number</span>
          <span>
            <input
              type="text"
              value={applicationNumber}
              onChange={(e) => setApplicationNumber(e.target.value)}
              placeholder="e.g. NM-2026-000123"
              disabled={savingApplicationNumber}
            />
          </span>
        </div>
        <div className="work-orders-new-panel">
          <button
            className="projects-btn"
            disabled={savingApplicationNumber || applicationNumber.trim() === (commissioning.netmeter_application_number ?? "")}
            onClick={handleSaveApplicationNumber}
          >
            {savingApplicationNumber ? "Saving…" : "Save application number"}
          </button>
          {applicationNumberStatus && (
            <span
              className="work-order-type-hint"
              style={applicationNumberStatus.kind === "error" ? { color: "var(--app-danger)" } : undefined}
            >
              {applicationNumberStatus.message}
            </span>
          )}
        </div>
      </div>

      <p className="projects-section-label">Discom application screenshot</p>
      <p className="work-order-type-hint">
        JPG, PNG, or WEBP — up to {MAX_COMMISSIONING_SCREENSHOT_SIZE_BYTES / (1024 * 1024)} MB. Uploading a new one
        replaces the current screenshot.
      </p>
      {commissioning.screenshot_download_url && (
        <div className="work-order-documents-list">
          <div className="work-order-document-card">
            <button
              type="button"
              className="work-order-document-thumb-btn"
              onClick={() => window.open(commissioning.screenshot_download_url!, "_blank", "noopener,noreferrer")}
              aria-label={`Open ${commissioning.screenshot_file_name}`}
            >
              <img
                src={commissioning.screenshot_download_url}
                alt={commissioning.screenshot_file_name ?? "Discom application screenshot"}
                className="work-order-document-thumb"
                loading="lazy"
              />
            </button>
            <div className="work-order-document-name">{commissioning.screenshot_file_name}</div>
            <div className="work-order-document-actions">
              <button
                className="projects-btn danger"
                disabled={deletingScreenshot}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                {deletingScreenshot ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="work-order-upload-controls">
        <label className={`work-orders-new-panel work-order-upload-row${uploading ? " disabled" : ""}`}>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            disabled={uploading}
            onChange={handleFileSelected}
            className="visually-hidden"
          />
          <span>
            {uploading
              ? "Uploading…"
              : commissioning.screenshot_download_url
                ? "Replace screenshot"
                : "Upload screenshot"}
          </span>
        </label>
      </div>
      {uploadError && (
        <p className="work-order-type-hint" style={{ color: "var(--app-danger)" }}>
          {uploadError}
        </p>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete this screenshot?"
        message="This permanently deletes the Discom application screenshot. This can't be undone."
        confirmLabel="Delete"
        confirming={deletingScreenshot}
        confirmingLabel="Deleting…"
        onConfirm={handleDeleteScreenshot}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      <div className="work-orders-new-panel">
        {nextStage ? (
          <button className="projects-btn primary" disabled={advancing} onClick={handleAdvance}>
            {advancing ? "Advancing…" : `Advance to ${COMMISSIONING_STAGE_LABEL[nextStage]}`}
          </button>
        ) : (
          <span className="work-order-type-hint">Commissioning complete.</span>
        )}
        {advanceError && (
          <span className="work-order-type-hint" style={{ color: "var(--app-danger)" }}>
            {advanceError}
          </span>
        )}
      </div>
    </>
  );
}
