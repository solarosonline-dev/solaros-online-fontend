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

export function login(email: string, password: string) {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
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

export function getMe() {
  return apiRequest<LoginResponse["user"]>("/me");
}
