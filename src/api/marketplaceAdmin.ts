import { apiRequest } from "./client";

export type MarketStatus = "DRAFT" | "PILOT" | "LIVE" | "PAUSED";
export type Market = {
  market_id: number;
  code: string;
  name: string;
  status: MarketStatus;
  launch_at: string | null;
  created_at: string;
};
export type Readiness = {
  market_id: number;
  status: MarketStatus;
  can_go_pilot: boolean;
  can_go_live: boolean;
  checks: { key: string; label: string; passed: boolean; enforced: boolean }[];
};
export type Coverage = { coverage_id: number; market_id: number; kind: "STATE" | "DISTRICT" | "PINCODE"; value: string };
export type Participant = {
  participant_id: number;
  market_id: number;
  entity_id: number;
  entity_name: string | null;
  role: "BUYER" | "VENDOR" | "LOGISTICS";
  status: string;
};
type Paged<T> = { items: T[]; page: number; page_size: number; total: number };

export const listMarkets = () => apiRequest<Paged<Market>>("/admin/mp/markets?page_size=200");
export const createMarket = (body: { code: string; name: string }) =>
  apiRequest<Market>("/admin/mp/markets", { method: "POST", body });
export const getReadiness = (id: number) => apiRequest<Readiness>(`/admin/mp/markets/${id}/readiness`);
export const setMarketStatus = (id: number, status: MarketStatus) =>
  apiRequest<Market>(`/admin/mp/markets/${id}/status`, { method: "PATCH", body: { status } });

export const listCoverage = (id: number) => apiRequest<Paged<Coverage>>(`/admin/mp/markets/${id}/coverage?page_size=200`);
export const addCoverage = (
  id: number,
  item: { kind: "STATE" | "DISTRICT" | "PINCODE"; state?: string; district?: string; pincode?: string },
) => apiRequest<{ added: Coverage[]; already_present: number }>(`/admin/mp/markets/${id}/coverage`, {
  method: "POST",
  body: { items: [item] },
});
export const removeCoverage = (id: number, coverageId: number) =>
  apiRequest<void>(`/admin/mp/markets/${id}/coverage/${coverageId}`, { method: "DELETE" });

export const listParticipants = (id: number) =>
  apiRequest<Paged<Participant>>(`/admin/mp/markets/${id}/participants?page_size=200`);
export const addParticipant = (id: number, body: { entity_id: number; role: Participant["role"] }) =>
  apiRequest<Participant>(`/admin/mp/markets/${id}/participants`, { method: "POST", body });
export const removeParticipant = (id: number, participantId: number) =>
  apiRequest<void>(`/admin/mp/markets/${id}/participants/${participantId}`, { method: "DELETE" });

export type PincodeRow = { pincode: string; state: string; district: string; city?: string };
export const importPincodes = (rows: PincodeRow[]) =>
  apiRequest<{ created: number; updated: number }>("/admin/mp/pincodes/import", { method: "POST", body: { rows } });

// --- Config rules ---
export type ConfigScope = "GLOBAL" | "MARKET" | "LANE" | "CATEGORY" | "VENDOR" | "ENTITY";
export type ConfigKey = {
  key: string;
  kind: "decimal" | "int" | "bool" | "enum";
  default: unknown;
  description: string;
  min: number | null;
  max: number | null;
  options: string[];
  scopes: ConfigScope[];
};
export type ConfigRule = {
  rule_id: number;
  key: string;
  scope_type: ConfigScope;
  scope_id: number | null;
  value: unknown;
  effective_from: string | null;
  effective_to: string | null;
  priority: number;
  note: string | null;
  created_at: string;
};
export type Resolved = {
  key: string;
  value: unknown;
  source: "rule" | "default";
  rule_id: number | null;
  scope_type: ConfigScope | null;
  scope_id: number | null;
};

export const listConfigKeys = () => apiRequest<{ items: ConfigKey[] }>("/admin/mp/config/keys");
export const listConfigRules = (key?: string) =>
  apiRequest<Paged<ConfigRule>>(`/admin/mp/config/rules?page_size=200${key ? `&key=${encodeURIComponent(key)}` : ""}`);
export const createConfigRule = (body: {
  key: string;
  scope_type: ConfigScope;
  scope_id: number | null;
  value: unknown;
  priority?: number;
  note?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
}) => apiRequest<ConfigRule>("/admin/mp/config/rules", { method: "POST", body });
export const updateConfigRule = (id: number, body: { value?: unknown; priority?: number; note?: string | null }) =>
  apiRequest<ConfigRule>(`/admin/mp/config/rules/${id}`, { method: "PATCH", body });
export const deleteConfigRule = (id: number) => apiRequest<void>(`/admin/mp/config/rules/${id}`, { method: "DELETE" });
export const resolveConfig = (key: string, ctx: Record<string, number | undefined>) => {
  const p = new URLSearchParams({ key });
  for (const [k, v] of Object.entries(ctx)) if (v != null) p.set(k, String(v));
  return apiRequest<Resolved>(`/admin/mp/config/resolve?${p}`);
};
