import { apiRequest } from "./client";
import { isAgent, isEntityAdmin } from "../lib/roles";
import {
  saveLeadStates,
  mirrorServerCommissions,
  mirrorServerPayouts,
  type PaymentRequest,
} from "../lib/epcAgentStorage";

export type CommissionRule = { agent_user_id: number; type: "PERCENT" | "FIXED"; value: string };

export type CommissionSummary = {
  agent_user_id: number;
  agent_name: string | null;
  rule: CommissionRule | null;
  earned: string;
  paid: string;
  pending: string;
  owed: string;
};

export type PayoutRequestItem = {
  request_id: number;
  agent_user_id: number;
  agent_name: string | null;
  amount: string;
  status: "PENDING" | "PAID";
  requested_at: string;
  paid_at: string | null;
};

export const SERVER_PAYOUT_PREFIX = "srv_";

// --- Agent (self) ---
export const getAgentConfigSelf = (e: number) => apiRequest<{ stages: string[] }>(`/entities/${e}/agent/config`);
export const getAgentCommissionSelf = (e: number) => apiRequest<CommissionSummary>(`/entities/${e}/agent/commission`);
export const listPayoutRequestsSelf = (e: number) =>
  apiRequest<{ items: PayoutRequestItem[] }>(`/entities/${e}/agent/payout-requests`);
export const requestPayout = (e: number, amount: number) =>
  apiRequest<PayoutRequestItem>(`/entities/${e}/agent/payout-requests`, { method: "POST", body: { amount } });

// --- Entity admin ---
export const getAgentConfigAdmin = (e: number) => apiRequest<{ stages: string[] }>(`/entities/${e}/agents/config`);
export const putAgentConfig = (e: number, stages: string[]) =>
  apiRequest<{ stages: string[] }>(`/entities/${e}/agents/config`, { method: "PUT", body: { stages } });
export const getCommissionSummaryAdmin = (e: number) =>
  apiRequest<{ items: CommissionSummary[] }>(`/entities/${e}/agents/commission-summary`);
export const putCommissionRule = (e: number, agentUserId: number, rule: { type: string; value: number }) =>
  apiRequest<CommissionRule>(`/entities/${e}/agents/commissions/${agentUserId}`, { method: "PUT", body: rule });
export const listPayoutRequestsAdmin = (e: number) =>
  apiRequest<{ items: PayoutRequestItem[] }>(`/entities/${e}/agents/payout-requests`);
export const payPayoutRequest = (e: number, requestId: number) =>
  apiRequest<PayoutRequestItem>(`/entities/${e}/agents/payout-requests/${requestId}/pay`, { method: "POST" });

function toLocalPayout(p: PayoutRequestItem, fallbackName: string): PaymentRequest {
  return {
    id: `${SERVER_PAYOUT_PREFIX}${p.request_id}`,
    agentId: p.agent_user_id,
    agentName: p.agent_name ?? fallbackName,
    amount: Number(p.amount),
    requestedAt: p.requested_at,
    status: p.status,
    paidAt: p.paid_at ?? undefined,
  };
}

/** Pull the entity's agent config (stages), commission rules and payout
 * requests from the backend -- the source of truth, so an agent sees what the
 * admin configured -- and mirror them into the local maps the dashboards
 * compute from. Safe to call from any agent-workspace page; failures leave the
 * local data untouched. */
export async function syncAgentWorkspace(user: {
  entity_id: number | null;
  user_id: number;
  full_name: string;
  roles: string[];
}): Promise<void> {
  const e = user.entity_id;
  if (!e) return;
  try {
    if (isAgent(user.roles) && !isEntityAdmin(user.roles)) {
      const [config, commission, payouts] = await Promise.all([
        getAgentConfigSelf(e),
        getAgentCommissionSelf(e),
        listPayoutRequestsSelf(e),
      ]);
      saveLeadStates(config.stages);
      mirrorServerCommissions(
        commission.rule ? [{ agentId: user.user_id, type: commission.rule.type, value: Number(commission.rule.value) }] : [],
      );
      mirrorServerPayouts(payouts.items.map((p) => toLocalPayout(p, user.full_name)));
    } else if (isEntityAdmin(user.roles)) {
      const [config, summary, payouts] = await Promise.all([
        getAgentConfigAdmin(e),
        getCommissionSummaryAdmin(e),
        listPayoutRequestsAdmin(e),
      ]);
      saveLeadStates(config.stages);
      mirrorServerCommissions(
        summary.items
          .filter((s) => s.rule)
          .map((s) => ({ agentId: s.agent_user_id, type: s.rule!.type, value: Number(s.rule!.value) })),
      );
      mirrorServerPayouts(payouts.items.map((p) => toLocalPayout(p, "Agent")));
    }
  } catch {
    // Not an AGENTS entity, offline, ... -- keep whatever is stored locally.
  }
}
