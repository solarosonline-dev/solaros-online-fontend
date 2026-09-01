import { useEffect, useState } from "react";
import {
  listEmailTemplates,
  getEmailTemplate,
  uploadEmailAttachment,
  createAndSendEmailCampaign,
  previewEmailCampaign,
  type EmailTemplateListItem,
  type EmailTemplate,
  type EmailRecipientInput,
  type CreateEmailCampaignResult,
  type EmailCampaignPreview,
} from "../../api/adminEmail";
import { ApiError } from "../../api/client";
import RichTextEditor from "../../components/RichTextEditor";
import { FromEmailFields } from "../../components/FromEmailFields";
import { composeFromEmail, parseFromEmail, DEFAULT_DISPLAY_NAME, DEFAULT_LOCAL_PART } from "../../lib/emailFromAddress";
import "./EmailPage.css";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type RecipientRow = {
  raw: EmailRecipientInput;
  error: string | null;
};

function validateRecipient(raw: unknown): RecipientRow {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { raw: { email: "", name: "" }, error: "Not a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const email = typeof obj.email === "string" ? obj.email : "";
  const name = typeof obj.name === "string" ? obj.name : "";
  if (!email || !EMAIL_RE.test(email)) {
    return { raw: { ...obj, email, name } as EmailRecipientInput, error: `"${email || "(missing)"}" is not a valid email address` };
  }
  if (!name.trim()) {
    return { raw: { ...obj, email, name } as EmailRecipientInput, error: "name must not be blank" };
  }
  return { raw: { ...obj, email, name } as EmailRecipientInput, error: null };
}

export default function EmailComposePanel() {
  const [templates, setTemplates] = useState<EmailTemplateListItem[]>([]);
  const [templateId, setTemplateId] = useState<number | "">("");
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);

  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [fromDisplayName, setFromDisplayName] = useState(DEFAULT_DISPLAY_NAME);
  const [fromLocalPart, setFromLocalPart] = useState(DEFAULT_LOCAL_PART);
  const [attachmentKey, setAttachmentKey] = useState<string | null>(null);
  const [attachmentFilename, setAttachmentFilename] = useState<string | null>(null);
  const [attachmentContentType, setAttachmentContentType] = useState<string | null>(null);
  const [attachmentRemoved, setAttachmentRemoved] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [rows, setRows] = useState<RecipientRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateEmailCampaignResult | null>(null);

  const [previewRecipientIndex, setPreviewRecipientIndex] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<EmailCampaignPreview | null>(null);

  useEffect(() => {
    listEmailTemplates({ page_size: 100 })
      .then((res) => setTemplates(res.items))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    if (templateId === "") {
      setSelectedTemplate(null);
      setFromDisplayName(DEFAULT_DISPLAY_NAME);
      setFromLocalPart(DEFAULT_LOCAL_PART);
      setSubject("");
      setBodyHtml("");
      return;
    }
    getEmailTemplate(templateId)
      .then((t) => {
        setSelectedTemplate(t);
        setAttachmentRemoved(false);
        // Load the template's own subject/body into the editable fields --
        // previously these were left blank (relying on the backend falling
        // back to the template when they're empty), so the admin had
        // nothing to look at or preview until they typed something of
        // their own. Loading them makes the fields double as both "what
        // will actually be sent" and "override this if you want to tweak
        // it for this send only".
        setSubject(t.subject);
        setBodyHtml(t.body_html);
        const parsed = parseFromEmail(t.from_email);
        setFromDisplayName(parsed.displayName || DEFAULT_DISPLAY_NAME);
        setFromLocalPart(parsed.localPart || DEFAULT_LOCAL_PART);
      })
      .catch(() => setSelectedTemplate(null));
  }, [templateId]);

  const effectiveAttachmentFilename = attachmentRemoved
    ? null
    : attachmentFilename ?? selectedTemplate?.attachment_filename ?? null;

  // Any field present in the actually-parsed recipient JSON is a valid
  // {{token}} -- not just name/email -- so derive the RichTextEditor's
  // insertable token list from the first parsed row instead of hardcoding
  // it. Falls back to name/email before any recipients have been parsed.
  const personalizationTokens = Array.from(
    new Set(["name", "email", ...Object.keys(rows?.[0]?.raw ?? {})])
  );

  function parseRecipients() {
    setParseError(null);
    setRows(null);
    setResult(null);
    setPreview(null);
    setPreviewError(null);
    setPreviewRecipientIndex(0);
    let parsed: unknown;
    try {
      parsed = JSON.parse(recipientsRaw);
    } catch {
      setParseError("Not valid JSON. Paste a JSON array of objects, e.g. [{\"email\": \"a@b.com\", \"name\": \"A\"}].");
      return;
    }
    if (!Array.isArray(parsed)) {
      setParseError("Expected a JSON array of recipient objects.");
      return;
    }
    if (parsed.length === 0) {
      setParseError("The list is empty.");
      return;
    }
    setRows(parsed.map(validateRecipient));
  }

  function removeRow(index: number) {
    setRows((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setSendError(null);
    try {
      const uploaded = await uploadEmailAttachment(file);
      setAttachmentKey(uploaded.attachment_key);
      setAttachmentFilename(uploaded.attachment_filename);
      setAttachmentContentType(uploaded.attachment_content_type);
      setAttachmentRemoved(false);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "Attachment upload failed");
    } finally {
      setUploading(false);
    }
  }

  function clearAttachment() {
    setAttachmentKey(null);
    setAttachmentFilename(null);
    setAttachmentContentType(null);
    setAttachmentRemoved(true);
  }

  const hasContentSource = templateId !== "" || (subject.trim() !== "" && bodyHtml.trim() !== "");
  const hasErrorRows = rows != null && rows.some((r) => r.error != null);
  const canSend = hasContentSource && rows != null && rows.length > 0 && !hasErrorRows && !sending;

  async function handleSend() {
    if (!rows) return;
    setSending(true);
    setSendError(null);
    setResult(null);
    try {
      const res = await createAndSendEmailCampaign({
        template_id: templateId === "" ? null : templateId,
        subject: templateId === "" ? subject : subject.trim() ? subject : undefined,
        body_html: templateId === "" ? bodyHtml : bodyHtml.trim() ? bodyHtml : undefined,
        from_email: composeFromEmail(fromDisplayName, fromLocalPart),
        attachment_key: attachmentRemoved ? "" : attachmentKey ?? undefined,
        attachment_filename: attachmentFilename ?? undefined,
        attachment_content_type: attachmentContentType ?? undefined,
        recipients: rows.map((r) => r.raw),
      });
      setResult(res);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const canPreview = hasContentSource && rows != null && rows.length > 0 && !previewing;

  async function runPreview() {
    if (!rows || rows.length === 0) return;
    const index = Math.min(previewRecipientIndex, rows.length - 1);
    setPreviewing(true);
    setPreviewError(null);
    try {
      const res = await previewEmailCampaign({
        template_id: templateId === "" ? null : templateId,
        subject: templateId === "" ? subject : subject.trim() ? subject : undefined,
        body_html: templateId === "" ? bodyHtml : bodyHtml.trim() ? bodyHtml : undefined,
        from_email: composeFromEmail(fromDisplayName, fromLocalPart),
        attachment_key: attachmentRemoved ? "" : attachmentKey ?? undefined,
        attachment_filename: attachmentFilename ?? undefined,
        attachment_content_type: attachmentContentType ?? undefined,
        recipient: rows[index].raw,
      });
      setPreview(res);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div>
      <div className="email-field">
        <label htmlFor="ecTemplate">Template (optional)</label>
        <select
          id="ecTemplate"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value === "" ? "" : Number(e.target.value))}
        >
          <option value="">— No template, write inline below —</option>
          {templates.map((t) => (
            <option key={t.template_id} value={t.template_id}>
              {t.name}
            </option>
          ))}
        </select>
        <span className="email-hint">
          Picking a template pre-fills subject/body/attachment below; anything you change here overrides it
          for this send only — the saved template itself is untouched.
        </span>
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
        <label htmlFor="ecSubject">Subject {templateId !== "" && "(override)"}</label>
        <input
          id="ecSubject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={selectedTemplate?.subject ?? "e.g. Hi {{name}}, your invoice is ready"}
        />
      </div>

      <div className="email-field">
        <label>Body {templateId !== "" && "(override)"}</label>
        <RichTextEditor value={bodyHtml} onChange={setBodyHtml} tokens={personalizationTokens} />
      </div>

      <div className="email-field">
        <label>Attachment</label>
        <div className="email-attachment-row">
          <input type="file" onChange={handleFileSelected} disabled={uploading} />
          {uploading && <span className="email-hint">Uploading…</span>}
          {effectiveAttachmentFilename && (
            <>
              <span className="email-hint">{effectiveAttachmentFilename}</span>
              <button type="button" className="entities-action-btn" onClick={clearAttachment}>
                Remove
              </button>
            </>
          )}
        </div>
      </div>

      <div className="email-field">
        <label htmlFor="ecRecipients">Recipients (paste a JSON array)</label>
        <textarea
          id="ecRecipients"
          value={recipientsRaw}
          onChange={(e) => setRecipientsRaw(e.target.value)}
          placeholder={'[\n  {"email": "a@example.com", "name": "Alice", "amount_due": 500},\n  {"email": "b@example.com", "name": "Bob"}\n]'}
        />
        <span className="email-hint">
          Each object needs at least <code>email</code> and <code>name</code>; any other field (e.g.{" "}
          <code>amount_due</code>) can be used as a <code>{"{{token}}"}</code> in the subject/body above.
        </span>
        <div className="email-attachment-row">
          <button type="button" className="entities-action-btn" onClick={parseRecipients}>
            Parse recipients
          </button>
        </div>
        {parseError && <p className="entities-row-error">{parseError}</p>}
      </div>

      {rows && (
        <div className="email-recipients-table-wrap">
          <table className="email-recipients-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Other fields</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const { email, name, ...rest } = row.raw;
                return (
                  <tr key={i} className={row.error ? "invalid" : undefined}>
                    <td>
                      {email || "—"}
                      {row.error && <div className="email-recipient-error">{row.error}</div>}
                    </td>
                    <td>{name || "—"}</td>
                    <td>{Object.keys(rest).length > 0 ? JSON.stringify(rest) : "—"}</td>
                    <td>
                      <button type="button" className="entities-action-btn" onClick={() => removeRow(i)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!hasContentSource && rows && (
        <p className="entities-row-error">Choose a template, or fill in both a subject and body, before sending.</p>
      )}
      {hasErrorRows && <p className="entities-row-error">Fix or remove the rows with errors above before sending.</p>}

      {rows && rows.length > 0 && (
        <div className="email-field">
          <label>Preview</label>
          <div className="email-attachment-row">
            {rows.length > 1 && (
              <select
                value={previewRecipientIndex}
                onChange={(e) => setPreviewRecipientIndex(Number(e.target.value))}
              >
                {rows.map((row, i) => (
                  <option key={i} value={i}>
                    {row.raw.email || `Recipient ${i + 1}`}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="entities-action-btn" onClick={runPreview} disabled={!canPreview}>
              {previewing ? "Loading preview…" : preview ? "Refresh preview" : "Preview"}
            </button>
          </div>
          {previewError && <p className="entities-row-error">{previewError}</p>}
          {preview && (
            <div className="email-preview-box">
              <div>
                <strong>From:</strong> {preview.from_email}
              </div>
              <div>
                <strong>Subject:</strong> {preview.subject}
              </div>
              {preview.warnings.length > 0 && (
                <div className="email-hint">{preview.warnings.join("; ")}</div>
              )}
              <div className="email-preview-body" dangerouslySetInnerHTML={{ __html: preview.body_html }} />
            </div>
          )}
        </div>
      )}

      {sendError && <p className="entities-row-error">{sendError}</p>}

      <div className="email-attachment-row" style={{ marginBottom: 16 }}>
        <button type="button" className="entities-action-btn primary" onClick={handleSend} disabled={!canSend}>
          {sending ? "Sending…" : `Send to ${rows?.length ?? 0} recipient${rows?.length === 1 ? "" : "s"}`}
        </button>
      </div>

      {result && (
        <div>
          <div className="email-summary-banner">
            <span>
              <strong>{result.sent_count}</strong> sent
            </span>
            <span>
              <strong>{result.failed_count}</strong> failed
            </span>
            <span>
              <strong>{result.recipient_count}</strong> total
            </span>
          </div>
          <div className="email-recipients-table-wrap">
            <table className="email-recipients-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r, i) => (
                  <tr key={i}>
                    <td>{r.email}</td>
                    <td>{r.name ?? "—"}</td>
                    <td>
                      <span className={`email-status-badge status-${r.status}`}>{r.status}</span>
                    </td>
                    <td>
                      {r.error && <div className="email-recipient-error">{r.error}</div>}
                      {r.warnings.length > 0 && (
                        <div className="email-hint">{r.warnings.join("; ")}</div>
                      )}
                    </td>
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
