import { useEffect, useMemo, useState } from "react";
import {
  batchSaveLeadSiteImages,
  MAX_LEAD_SITE_IMAGES,
  MAX_LEAD_SITE_IMAGE_SIZE_BYTES,
  type LeadSiteImage,
} from "../../api/leadSiteImages";
import { ApiError } from "../../api/client";
import "../projects/ProjectsPage.css";
import "../quotes/QuoteBuilderPage.css";

const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.webp";

type StagedItem =
  | { kind: "existing"; image: LeadSiteImage }
  | { kind: "pending"; localId: string; file: File; previewUrl: string };

function stagedKey(item: StagedItem): string {
  return item.kind === "existing" ? `existing-${item.image.image_id}` : `pending-${item.localId}`;
}

/** Site design/site-condition photos attached to the lead -- available
 * before a quote is ever generated (and reused across regenerations), so
 * this lives on the Lead rather than the Quote. Mounted at the bottom of
 * QuoteBuilderPage.tsx's form panel; the images themselves render into the
 * actual quote document via QuoteDocument.tsx's siteImages prop.
 *
 * Batched editing, not upload-immediately: selecting files only stages a
 * local preview (object URL, no network call), drag-and-drop reorders
 * purely client-side, and Delete just removes a staged item -- nothing is
 * persisted until "Save images" is clicked, which then calls
 * batchSaveLeadSiteImages once: new files, deleted ones, and the final
 * order all go in a single request/transaction (see the backend's
 * batch_save_lead_site_images). This is deliberately different from
 * WorkOrderDocuments' upload-per-select pattern: reordering while
 * persisting every drag would mean one API call per drag step, and
 * there's no "half uploaded" state to reconcile with a draft quote since
 * images live on the Lead (see the backend's AGENTS.md for why there's no
 * draft-quote concept here).
 *
 * Fully controlled for the *saved* state -- the caller owns `images` (and
 * its initial fetch), not this component, because the accordion section
 * this renders inside only mounts its children while open: if this
 * component did its own fetch on mount, the live preview (which needs the
 * images regardless of which accordion tab happens to be open) would stay
 * empty until the admin clicked open this specific section at least once.
 * `onImagesChange` fires only once, after a successful Save -- not on every
 * local staging edit -- so the preview updates when the admin is done, not
 * mid-drag. */
export default function LeadSiteImages({
  entityId,
  leadId,
  images,
  loading,
  loadError,
  onImagesChange,
  onPreviewChange,
}: {
  entityId: number;
  leadId: number;
  images: LeadSiteImage[];
  loading: boolean;
  loadError: string | null;
  onImagesChange: (images: LeadSiteImage[]) => void;
  /** Fires on every local staging edit (reorder, add, remove) -- not just
   * after Save -- so the live quote preview on the right can reflect the
   * in-progress order/selection immediately, using object-URL previews for
   * not-yet-uploaded files. */
  onPreviewChange?: (items: { imageId: number; url: string; fileName: string }[]) => void;
}) {
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);

  // Resync from the saved state whenever it changes (initial load, or right
  // after a successful Save round-trips through the parent) -- discards any
  // in-progress local edits, which is correct exactly then since a
  // successful Save is what just produced this new `images` value.
  useEffect(() => {
    setStagedItems(images.map((image) => ({ kind: "existing", image })));
  }, [images]);

  useEffect(() => {
    onPreviewChange?.(
      stagedItems.map((item, index) =>
        item.kind === "existing"
          ? { imageId: item.image.image_id, url: item.image.url ?? "", fileName: item.image.file_name }
          : { imageId: -(index + 1), url: item.previewUrl, fileName: item.file.name },
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagedItems]);

  const atLimit = stagedItems.length >= MAX_LEAD_SITE_IMAGES;

  const dirty = useMemo(() => {
    if (stagedItems.length !== images.length) return true;
    return stagedItems.some((item, i) => item.kind === "pending" || item.image.image_id !== images[i]?.image_id);
  }, [stagedItems, images]);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file(s) after an error
    if (selected.length === 0) return;

    setSelectError(null);

    const remainingSlots = MAX_LEAD_SITE_IMAGES - stagedItems.length;
    const toStage = selected.slice(0, remainingSlots);
    const skippedForLimit = selected.length - toStage.length;

    const tooLarge = toStage.filter((f) => f.size > MAX_LEAD_SITE_IMAGE_SIZE_BYTES);
    const withinLimit = toStage.filter((f) => f.size <= MAX_LEAD_SITE_IMAGE_SIZE_BYTES);

    const errors: string[] = [];
    if (tooLarge.length > 0) {
      errors.push(
        `${tooLarge.map((f) => f.name).join(", ")} — must be ${MAX_LEAD_SITE_IMAGE_SIZE_BYTES / (1024 * 1024)} MB or smaller.`,
      );
    }
    if (skippedForLimit > 0) {
      errors.push(`${skippedForLimit} file(s) skipped — only ${remainingSlots} slot(s) left.`);
    }
    if (errors.length > 0) setSelectError(errors.join(" "));

    const newItems: StagedItem[] = withinLimit.map((file) => ({
      kind: "pending",
      localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setStagedItems((prev) => [...prev, ...newItems]);
  }

  function handleRemove(item: StagedItem) {
    if (item.kind === "pending") URL.revokeObjectURL(item.previewUrl);
    setStagedItems((prev) => prev.filter((i) => stagedKey(i) !== stagedKey(item)));
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    setStagedItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);

    // Build the final order in one shot -- new files go up in the same
    // request, referenced by their position in newFiles, so adds, deletes,
    // and reordering all land in a single call/transaction.
    const newFiles: File[] = [];
    const order = stagedItems.map((item) => {
      if (item.kind === "existing") return { kind: "existing" as const, imageId: item.image.image_id };
      const index = newFiles.push(item.file) - 1;
      return { kind: "new" as const, index };
    });

    try {
      const res = await batchSaveLeadSiteImages(entityId, leadId, order, newFiles);
      for (const item of stagedItems) {
        if (item.kind === "pending") URL.revokeObjectURL(item.previewUrl);
      }
      onImagesChange(res.items);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not save the image changes.");
    }
    setSaving(false);
  }

  return (
    <>
      <p className="work-order-type-hint work-order-documents-hint">
        JPG, PNG, or WEBP — up to {MAX_LEAD_SITE_IMAGE_SIZE_BYTES / (1024 * 1024)} MB each, {MAX_LEAD_SITE_IMAGES} per
        lead. Shown on the customer-facing quote.
      </p>

      {atLimit ? (
        <p className="work-order-type-hint">Limit reached — remove an image to add another.</p>
      ) : (
        <label className="work-orders-new-panel work-order-upload-row">
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            multiple
            onChange={handleFileSelected}
            className="visually-hidden"
          />
          <span>Choose images to upload</span>
        </label>
      )}
      {selectError && (
        <p className="work-order-type-hint work-order-upload-error" style={{ color: "var(--app-danger)" }}>
          {selectError}
        </p>
      )}

      {loading ? (
        <div className="projects-loading">Loading…</div>
      ) : loadError ? (
        <div className="projects-loading">{loadError}</div>
      ) : stagedItems.length === 0 ? (
        <div className="projects-empty">No site design images yet.</div>
      ) : (
        <>
          <p className="work-order-type-hint site-images-drag-hint">Drag and drop to reorder.</p>
          <div className="site-images-grid">
            {stagedItems.map((item, index) => {
              const url = item.kind === "existing" ? item.image.url : item.previewUrl;
              const fileName = item.kind === "existing" ? item.image.file_name : item.file.name;
              return (
                <div
                  key={stagedKey(item)}
                  className={`site-image-card${dragIndex === index ? " dragging" : ""}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <span className="site-image-drag-handle" aria-hidden="true">
                    ⠿
                  </span>
                  <div className="site-image-thumb-wrap">
                    <span className="site-image-number">{index + 1}</span>
                    {url ? (
                      <img src={url} alt={fileName} className="site-image-thumb" />
                    ) : (
                      <div className="site-image-thumb site-image-thumb-placeholder">{fileName}</div>
                    )}
                  </div>
                  <span className="site-image-file-name">{fileName}</span>
                  <button type="button" className="projects-btn danger" onClick={() => handleRemove(item)}>
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {saveError && (
        <p className="work-order-type-hint work-order-upload-error" style={{ color: "var(--app-danger)" }}>
          {saveError}
        </p>
      )}
      <div className="work-orders-new-panel" style={{ marginTop: 12 }}>
        <button type="button" className="projects-btn primary" disabled={!dirty || saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save images"}
        </button>
      </div>
    </>
  );
}
