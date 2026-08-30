import { useRef, useState } from "react";
import type { Branding } from "../../../api/entityPreferences";
import { uploadBrandingLogo } from "../../../api/entityPreferences";
import { ApiError } from "../../../api/client";

type Props = {
  entityId: number;
  draft: Branding;
  onChange: (draft: Branding) => void;
};

// Logo upload is temporarily disabled -- flip this back on to re-show the
// "Logo" field (and its file picker) once it's ready again.
const SHOW_LOGO_UPLOAD = false;

export default function BrandingTab({ entityId, draft, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    if (file.size > 2 * 1024 * 1024) {
      setUploadError("Logo must be under 2MB.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type)) {
      setUploadError("Logo must be PNG, JPG, or SVG.");
      return;
    }

    setUploading(true);
    try {
      const res = await uploadBrandingLogo(entityId, file);
      onChange({ ...draft, logo_url: res.logo_url });
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="entity-field">
        <label htmlFor="primary_color">Primary color</label>
        <div className="entity-color-field">
          <input
            id="primary_color"
            type="color"
            value={draft.primary_color}
            onChange={(e) => onChange({ ...draft, primary_color: e.target.value })}
          />
          <span className="entity-color-swatch">{draft.primary_color}</span>
        </div>
      </div>

      {SHOW_LOGO_UPLOAD && (
        <div className="entity-field">
          <label>Logo</label>
          <div className="entity-logo-row">
            {draft.logo_url ? (
              <img src={draft.logo_url} alt="Logo" className="entity-logo-preview" />
            ) : (
              <div className="entity-logo-placeholder">No logo</div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
            <button type="button" className="entity-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? "Uploading…" : "Choose file"}
            </button>
            {draft.logo_url && (
              <button type="button" className="entity-btn" onClick={() => onChange({ ...draft, logo_url: null })}>
                Remove
              </button>
            )}
          </div>
          {uploadError && <p className="entity-status error">{uploadError}</p>}
        </div>
      )}

      <div className="entity-field">
        <label htmlFor="company_tagline">Company tagline</label>
        <input
          id="company_tagline"
          type="text"
          maxLength={200}
          value={draft.company_tagline}
          onChange={(e) => onChange({ ...draft, company_tagline: e.target.value })}
        />
      </div>

      <div className="entity-field">
        <label htmlFor="footer_tag">Footer text</label>
        <input
          id="footer_tag"
          type="text"
          maxLength={500}
          value={draft.footer_tag}
          onChange={(e) => onChange({ ...draft, footer_tag: e.target.value })}
        />
      </div>
    </div>
  );
}
