import { apiRequest } from "./client";

export type LoginResponse = {
  token: string;
  user: {
    user_id: number;
    full_name: string;
    email: string;
    entity_id: number | null;
    roles: string[];
  };
};

// `identifier` accepts either an email address or a phone number -- the
// backend distinguishes by whether it contains "@".
export function login(identifier: string, password: string) {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: { identifier, password },
    auth: false,
  });
}

export type ActivateAccountResponse = {
  message: string;
  // Present once the account's entity is known; "PENDING_APPROVAL" means the
  // email is now verified but the entity still needs GST-certificate
  // verification (or manual admin approval) before it's fully active.
  entity_state: string | null;
};

export function activateAccount(token: string, password?: string) {
  return apiRequest<ActivateAccountResponse>("/auth/activate", {
    method: "POST",
    body: { token, password },
    auth: false,
  });
}

export type GstCertificateVerificationResponse = {
  status: "MATCHED" | "NO_MATCH" | "ALREADY_ACTIVE";
  entity_state: string | null;
  message: string;
};

export function verifyGstCertificate(token: string, file: File) {
  const formData = new FormData();
  formData.append("token", token);
  formData.append("file", file);
  return apiRequest<GstCertificateVerificationResponse>("/auth/gst-certificate", {
    method: "POST",
    body: formData,
    auth: false,
  });
}

export function getMe() {
  return apiRequest<LoginResponse["user"]>("/me");
}
