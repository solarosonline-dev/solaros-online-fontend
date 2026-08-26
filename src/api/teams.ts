import { apiRequest } from "./client";

export type TeamLeadInfo = {
  user_id: number;
  full_name: string;
};

export type TeamListItem = {
  team_id: number;
  name: string;
  active: boolean;
  member_count: number;
  lead: TeamLeadInfo | null;
};

export type TeamListResponse = {
  items: TeamListItem[];
  page: number;
  page_size: number;
  total: number;
};

export function listTeams(entityId: number, params: { active?: boolean } = {}) {
  const qs = new URLSearchParams();
  if (params.active !== undefined) qs.set("active", String(params.active));
  const query = qs.toString();
  return apiRequest<TeamListResponse>(`/entities/${entityId}/teams${query ? `?${query}` : ""}`);
}
