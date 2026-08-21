const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let authToken: string | null = localStorage.getItem("solaros_token");

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem("solaros_token", token);
  else localStorage.removeItem("solaros_token");
}

export function getAuthToken() {
  return authToken;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
};

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const isFormData = body instanceof FormData;

  const headers: Record<string, string> = {};
  if (!isFormData) headers["Content-Type"] = "application/json";
  if (auth && authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : body != null ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = data?.error ?? { code: "UNKNOWN_ERROR", message: "Request failed" };
    throw new ApiError(res.status, err.code, err.message);
  }

  return data as T;
}
