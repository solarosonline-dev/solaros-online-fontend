import { apiRequest } from "./client";

// Product modules an entity can have enabled -- mirrors the backend's
// EntityFeature enum. CRM is everything except plant design; DESIGN is plant
// design only. A SYSTEM admin toggles them per entity (Entities page).
export type Feature = "CRM" | "DESIGN" | "MARKETPLACE_BUY" | "MARKETPLACE_SELL" | "DELIVERY";

export type LoginResponse = {
  token: string;
  user: {
    user_id: number;
    full_name: string;
    email: string;
    entity_id: number | null;
    roles: string[];
    // Display label per role this user holds, e.g.
    // {"ENTITY_SERVICE_MANAGER": "Field Ops Lead"} -- resolved server-side
    // from the entity's role_labels preference merged with the built-in
    // defaults. Empty for SYSTEM-scope users.
    role_labels: Record<string, string>;
    trial_ends_at: string | null;
    // The user's entity's enabled modules -- empty for SYSTEM-scope users.
    features: Feature[];
    // Platform role of the user's entity (EPC | VENDOR | LOGISTICS); null for
    // SYSTEM-scope users. Distinct from the entity's free-text business type.
    entity_kind: "EPC" | "VENDOR" | "LOGISTICS" | null;
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

export function activateAccount(token: string, password?: string) {
  return apiRequest<{ message: string }>("/auth/activate", {
    method: "POST",
    body: { token, password },
    auth: false,
  });
}

export function forgotPassword(email: string) {
  return apiRequest<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: { email },
    auth: false,
  });
}

export function resetPassword(token: string, password: string) {
  return apiRequest<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: { token, password },
    auth: false,
  });
}

export function getMe() {
  return apiRequest<LoginResponse["user"]>("/me");
}
