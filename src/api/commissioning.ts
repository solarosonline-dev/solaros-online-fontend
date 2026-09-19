import { apiRequest } from "./client";

// Mirrors CommissioningStage in app/models/enums.py on the backend -- the
// Discom net-meter sequence a COMMISSIONING work order actually walks
// through: apply for the net meter, Discom visits the site, the meter is
// installed, then commissioned. Linear, one stage at a time, no skipping,
// no REJECTED escape hatch (see COMMISSIONING_STAGE_SEQUENCE in
// app/api/v1/endpoints/commissioning.py).
export type CommissioningStage = "APPLY_NET_METER" | "DISCOM_VISIT" | "METER_INSTALLATION" | "METER_COMMISSIONING";

export const COMMISSIONING_STAGE_SEQUENCE: CommissioningStage[] = [
  "APPLY_NET_METER",
  "DISCOM_VISIT",
  "METER_INSTALLATION",
  "METER_COMMISSIONING",
];

export const COMMISSIONING_STAGE_LABEL: Record<CommissioningStage, string> = {
  APPLY_NET_METER: "Apply net meter",
  DISCOM_VISIT: "Visit by Discom",
  METER_INSTALLATION: "Meter installation",
  METER_COMMISSIONING: "Meter commissioning",
};

/** The immediate next stage, or null once at the terminal METER_COMMISSIONING
 * stage -- mirrors _is_valid_commissioning_transition on the backend, which
 * only ever accepts this exact next value (no skipping ahead). */
export function nextCommissioningStage(stage: CommissioningStage): CommissioningStage | null {
  const idx = COMMISSIONING_STAGE_SEQUENCE.indexOf(stage);
  if (idx === -1 || idx === COMMISSIONING_STAGE_SEQUENCE.length - 1) return null;
  return COMMISSIONING_STAGE_SEQUENCE[idx + 1];
}

export const MAX_COMMISSIONING_SCREENSHOT_SIZE_BYTES = 5 * 1024 * 1024;

export type CommissioningDetail = {
  commissioning_id: number;
  work_order_id: number;
  current_stage: CommissioningStage;
  netmeter_application_number: string | null;
  screenshot_file_name: string | null;
  screenshot_content_type: string | null;
  // Presigned, short-lived -- same convention as work order document
  // downloads. Null whenever no screenshot has been uploaded yet.
  screenshot_download_url: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export function getCommissioning(entityId: number, workOrderId: number) {
  return apiRequest<CommissioningDetail>(`/entities/${entityId}/work-orders/${workOrderId}/commissioning`);
}

export function advanceCommissioningStage(entityId: number, workOrderId: number, stage: CommissioningStage) {
  return apiRequest<{
    commissioning_id: number;
    current_stage: CommissioningStage;
    work_order_status: string;
    project_status: string | null;
  }>(`/entities/${entityId}/work-orders/${workOrderId}/commissioning/stage`, { method: "PATCH", body: { stage } });
}

export function updateNetmeterApplicationNumber(
  entityId: number,
  workOrderId: number,
  netmeterApplicationNumber: string | null,
) {
  return apiRequest<CommissioningDetail>(
    `/entities/${entityId}/work-orders/${workOrderId}/commissioning/application-number`,
    { method: "PUT", body: { netmeter_application_number: netmeterApplicationNumber } },
  );
}

export function uploadCommissioningScreenshot(entityId: number, workOrderId: number, file: File) {
  const form = new FormData();
  form.append("file", file, file.name);
  return apiRequest<CommissioningDetail>(
    `/entities/${entityId}/work-orders/${workOrderId}/commissioning/screenshot`,
    { method: "POST", body: form },
  );
}

export function getCommissioningScreenshotDownloadUrl(entityId: number, workOrderId: number) {
  return apiRequest<{ download_url: string; file_name: string }>(
    `/entities/${entityId}/work-orders/${workOrderId}/commissioning/screenshot`,
  );
}

export function deleteCommissioningScreenshot(entityId: number, workOrderId: number) {
  return apiRequest<void>(`/entities/${entityId}/work-orders/${workOrderId}/commissioning/screenshot`, {
    method: "DELETE",
  });
}
