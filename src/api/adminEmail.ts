import { apiRequest } from "./client";

// One-to-one with app/api/v1/endpoints/email.py on the backend, gated there
// to SYSTEM_SUPER_ADMIN only -- see lib/RequireSystemSuperAdmin.tsx.

export type EmailTemplate = {
  template_id: number;
  name: string;
  subject: string;
  body_html: string;
  from_email: string;
  attachment_filename: string | null;
  attachment_content_type: string | null;
  attachment_size_bytes: number | null;
  attachment_download_url: string | null;
};

export type EmailTemplateListItem = {
  template_id: number;
  name: string;
  subject: string;
  has_attachment: boolean;
};

export type EmailTemplateList = {
  items: EmailTemplateListItem[];
  page: number;
  page_size: number;
  total: number;
};

export type EmailAttachmentUpload = {
  attachment_key: string;
  attachment_filename: string;
  attachment_content_type: string;
  attachment_size_bytes: number;
};

export type EmailTemplateAttachmentFields = {
  attachment_key?: string | null;
  attachment_filename?: string | null;
  attachment_content_type?: string | null;
  attachment_size_bytes?: number | null;
};

export type EmailTemplateInput = EmailTemplateAttachmentFields & {
  name: string;
  subject: string;
  body_html: string;
  from_email: string;
};

export type EmailTemplateUpdateInput = EmailTemplateInput & {
  remove_attachment?: boolean;
};

export function listEmailTemplates(params: { page?: number; page_size?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiRequest<EmailTemplateList>(`/admin/email-templates${query ? `?${query}` : ""}`);
}

export function getEmailTemplate(templateId: number) {
  return apiRequest<EmailTemplate>(`/admin/email-templates/${templateId}`);
}

export function createEmailTemplate(data: EmailTemplateInput) {
  return apiRequest<EmailTemplate>("/admin/email-templates", { method: "POST", body: data });
}

export function updateEmailTemplate(templateId: number, data: EmailTemplateUpdateInput) {
  return apiRequest<EmailTemplate>(`/admin/email-templates/${templateId}`, { method: "PATCH", body: data });
}

export function deleteEmailTemplate(templateId: number) {
  return apiRequest<void>(`/admin/email-templates/${templateId}`, { method: "DELETE" });
}

export function uploadEmailAttachment(file: File) {
  const form = new FormData();
  form.append("file", file, file.name);
  return apiRequest<EmailAttachmentUpload>("/admin/email-attachments", { method: "POST", body: form });
}

export type EmailRecipientInput = {
  email: string;
  name: string;
  [key: string]: unknown;
};

export type EmailRecipientResult = {
  email: string;
  name: string | null;
  status: "PENDING" | "SENT" | "FAILED";
  error: string | null;
  warnings: string[];
};

export type CreateEmailCampaignInput = EmailTemplateAttachmentFields & {
  template_id?: number | null;
  subject?: string;
  body_html?: string;
  from_email?: string;
  recipients: EmailRecipientInput[];
};

export type PreviewEmailCampaignInput = EmailTemplateAttachmentFields & {
  template_id?: number | null;
  subject?: string;
  body_html?: string;
  from_email?: string;
  recipient: EmailRecipientInput;
};

export type EmailCampaignPreview = {
  subject: string;
  body_html: string;
  from_email: string;
  warnings: string[];
};

export function previewEmailCampaign(data: PreviewEmailCampaignInput) {
  return apiRequest<EmailCampaignPreview>("/admin/email-campaigns/preview", { method: "POST", body: data });
}

export type CreateEmailCampaignResult = {
  campaign_id: number;
  subject: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  results: EmailRecipientResult[];
};

export function createAndSendEmailCampaign(data: CreateEmailCampaignInput) {
  return apiRequest<CreateEmailCampaignResult>("/admin/email-campaigns", { method: "POST", body: data });
}

export type EmailCampaignListItem = {
  campaign_id: number;
  subject: string;
  from_email: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  sent_by_user_id: number;
  created_at: string;
};

export type EmailCampaignList = {
  items: EmailCampaignListItem[];
  page: number;
  page_size: number;
  total: number;
};

export function listEmailCampaigns(params: { page?: number; page_size?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString();
  return apiRequest<EmailCampaignList>(`/admin/email-campaigns${query ? `?${query}` : ""}`);
}

export type EmailCampaignDetail = {
  campaign_id: number;
  subject: string;
  body_html: string;
  from_email: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  sent_by_user_id: number;
  created_at: string;
  results: EmailRecipientResult[];
};

export function getEmailCampaign(campaignId: number) {
  return apiRequest<EmailCampaignDetail>(`/admin/email-campaigns/${campaignId}`);
}
