import { useEffect, useRef, useState } from "react";
import {
  listEmailTemplates,
  getEmailTemplate,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  uploadEmailAttachment,
  type EmailTemplate,
  type EmailTemplateListItem,
} from "../../api/adminEmail";
import { ApiError } from "../../api/client";
import ConfirmDialog from "../../components/ConfirmDialog";
import RichTextEditor from "../../components/RichTextEditor";
import { FromEmailFields } from "../../components/FromEmailFields";
import { composeFromEmail, parseFromEmail, DEFAULT_DISPLAY_NAME, DEFAULT_LOCAL_PART } from "../../lib/emailFromAddress";
import "../admin/EntitiesPage.css";
import "./EmailPage.css";

const PERSONALIZATION_TOKENS = ["name", "email"];

type Draft = {
  name: string;
  subject: string;
  body_html: string;
  attachment_key: string | null;
  attachment_filename: string | null;
  attachment_content_type: string | null;
  attachment_size_bytes: number | null;
};

const BLANK_DRAFT: Draft = {
  name: "",
  subject: "",
  body_html: "",
  attachment_key: null,
  attachment_filename: null,
  attachment_content_type: null,
  attachment_size_bytes: null,
};

export default function EmailTemplatesPanel() {
  const [items, setItems] = useState<EmailTemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK_DRAFT);
  const [fromDisplayName, setFromDisplayName] = useState(DEFAULT_DISPLAY_NAME);
  const [fromLocalPart, setFromLocalPart] = useState(DEFAULT_LOCAL_PART);
  // True only when the admin explicitly clicked "Remove" on an attachment
  // that existed when the edit form opened -- distinct from draft.attachment_key
  // simply being null because the template never had one, which must NOT
  // send remove_attachment: true (see handleSave).
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pendingDelete, setPendingDelete] = useState<EmailTemplateListItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    listEmailTemplates()
      .then((res) => setItems(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load templates"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function openCreateForm() {
    setEditingId(null);
    setDraft(BLANK_DRAFT);
    setFromDisplayName(DEFAULT_DISPLAY_NAME);
    setFromLocalPart(DEFAULT_LOCAL_PART);
    setRemoveAttachment(false);
    setFormError(null);
    setFormOpen(true);
  }

  async function openEditForm(templateId: number) {
    setFormError(null);
    try {
      const t: EmailTemplate = await getEmailTemplate(templateId);
      setEditingId(templateId);
      setDraft({
        name: t.name,
        subject: t.subject,
        body_html: t.body_html,
        attachment_key: null, // null = "leave attachment as-is" on PATCH unless removeAttachment is set below.
        attachment_filename: t.attachment_filename,
        attachment_content_type: t.attachment_content_type,
        attachment_size_bytes: t.attachment_size_bytes,
      });
      const parsed = parseFromEmail(t.from_email);
      setFromDisplayName(parsed.displayName || DEFAULT_DISPLAY_NAME);
      setFromLocalPart(parsed.localPart || DEFAULT_LOCAL_PART);
      setRemoveAttachment(false);
      setFormOpen(true);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load template");
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      const uploaded = await uploadEmailAttachment(file);
      setRemoveAttachment(false);
      setDraft((prev) => ({
        ...prev,
        attachment_key: uploaded.attachment_key,
        attachment_filename: uploaded.attachment_filename,
        attachment_content_type: uploaded.attachment_content_type,
        attachment_size_bytes: uploaded.attachment_size_bytes,
      }));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Attachment upload failed");
    } finally {
      setUploading(false);
    }
  }

  function clearAttachment() {
    setRemoveAttachment(true);
    setDraft((prev) => ({
      ...prev,
      attachment_key: null,
      attachment_filename: null,
      attachment_content_type: null,
      attachment_size_bytes: null,
    }));
  }

  async function handleSave() {
    setFormError(null);
    if (!draft.name.trim() || !draft.subject.trim() || !draft.body_html.trim()) {
      setFormError("Name, subject, and body are all required.");
      return;
    }
    if (!fromDisplayName.trim() || !fromLocalPart.trim()) {
      setFormError("From display name and address are both required.");
      return;
    }
    const from_email = composeFromEmail(fromDisplayName, fromLocalPart);
    setSaving(true);
    try {
      if (editingId == null) {
        await createEmailTemplate({ ...draft, from_email });
      } else {
        await updateEmailTemplate(editingId, { ...draft, from_email, remove_attachment: removeAttachment });
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(templateId: number) {
    setPendingDelete(null);
    setDeletingId(templateId);
    try {
      await deleteEmailTemplate(templateId);
      setItems((prev) => prev.filter((t) => t.template_id !== templateId));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="email-attachment-row" style={{ marginBottom: 16 }}>
        <button type="button" className="entities-action-btn primary" onClick={openCreateForm}>
          New template
        </button>
      </div>

      {formOpen && (
        <div className="email-panel" style={{ marginBottom: 20, border: "1px solid var(--app-border)" }}>
          <h3 style={{ marginTop: 0 }}>{editingId == null ? "New template" : "Edit template"}</h3>

          <div className="email-field">
            <label htmlFor="etName">Name</label>
            <input
              id="etName"
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>

          <div className="email-field">
            <FromEmailFields
              displayName={fromDisplayName}
              localPart={fromLocalPart}
              onDisplayNameChange={setFromDisplayName}
              onLocalPartChange={setFromLocalPart}
            />
          </div>

          <div className="email-field">
            <label htmlFor="etSubject">Subject</label>
            <input
              id="etSubject"
              type="text"
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              placeholder="e.g. Hi {{name}}, your invoice is ready"
            />
            <span className="email-hint">
              Use <code>{"{{name}}"}</code>, <code>{"{{email}}"}</code>, or any other field that will be present in
              the recipient JSON you paste when sending a campaign with this template — any key in that JSON works
              as a token, not just <code>name</code>/<code>email</code>.
            </span>
          </div>

          <div className="email-field">
            <label>Body</label>
            <RichTextEditor
              value={draft.body_html}
              onChange={(html) => setDraft({ ...draft, body_html: html })}
              tokens={PERSONALIZATION_TOKENS}
            />
          </div>

          <div className="email-field">
            <label>Attachment (optional, one file)</label>
            <div className="email-attachment-row">
              <input ref={fileInputRef} type="file" onChange={handleFileSelected} disabled={uploading} />
              {uploading && <span className="email-hint">Uploading…</span>}
              {draft.attachment_filename && (
                <>
                  <span className="email-hint">{draft.attachment_filename}</span>
                  <button type="button" className="entities-action-btn" onClick={clearAttachment}>
                    Remove
                  </button>
                </>
              )}
            </div>
            <span className="email-hint">PDF, JPEG, PNG, DOCX, or XLSX.</span>
          </div>

          {formError && <p className="entities-row-error">{formError}</p>}

          <div className="email-attachment-row">
            <button type="button" className="entities-action-btn primary" onClick={handleSave} disabled={saving || uploading}>
              {saving ? "Saving…" : "Save template"}
            </button>
            <button type="button" className="entities-action-btn" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="entities-table-wrap">
        {loading ? (
          <div className="entities-loading">Loading…</div>
        ) : loadError ? (
          <div className="entities-loading">{loadError}</div>
        ) : items.length === 0 ? (
          <div className="entities-empty">No templates yet.</div>
        ) : (
          <table className="entities-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Subject</th>
                <th>Attachment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.template_id}>
                  <td>{t.name}</td>
                  <td>{t.subject}</td>
                  <td>{t.has_attachment ? "Yes" : "—"}</td>
                  <td>
                    <div className="email-attachment-row">
                      <button className="entities-action-btn" onClick={() => openEditForm(t.template_id)}>
                        Edit
                      </button>
                      <button
                        className="entities-action-btn"
                        disabled={deletingId === t.template_id}
                        onClick={() => setPendingDelete(t)}
                      >
                        {deletingId === t.template_id ? "…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete this template?"
        message={`This permanently deletes "${pendingDelete?.name}". Past campaigns that used it keep their own copy of the subject/body/attachment, so this can't affect anything already sent. This can't be undone.`}
        confirmLabel="Delete"
        confirming={deletingId === pendingDelete?.template_id}
        confirmingLabel="Deleting…"
        onConfirm={() => pendingDelete && handleDelete(pendingDelete.template_id)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
