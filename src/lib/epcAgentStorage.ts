export interface AgentCommission {
  agentId: number;
  type: "PERCENT" | "FIXED";
  value: number;
}

export interface PaymentRequest {
  id: string;
  agentId: number;
  agentName: string;
  amount: number;
  requestedAt: string;
  status: "PENDING" | "PAID";
  paidAt?: string;
}

export interface EpcAgentSettings {
  enabled: boolean;
  onlyWorkspace: boolean;
}

const DEFAULT_STATES = ["NEW", "CONTACTED", "MEETING_SCHEDULED", "PROPOSAL_SENT", "ORDER_PLACED", "COMPLETED"];

const STORAGE_KEYS = {
  SETTINGS: "epc_agents_settings",
  STATES: "epc_agents_states",
  COMMISSIONS: "epc_agents_commissions",
  ASSIGNMENTS: "epc_agents_assignments",
  CUSTOM_STATES: "epc_agents_custom_states",
  DEAL_VALUES: "epc_agents_deal_values",
  PAYMENT_REQUESTS: "epc_agents_payment_requests",
};

// One-time cleanup: earlier builds seeded demo agents/leads/payouts into these
// keys (lead ids 901-907, agents 9901-9903). The backend is the source of truth
// now, so drop them -- a real lead that happened to share an id would otherwise
// inherit a demo stage or deal value.
try {
  if (localStorage.getItem("epc_agents_demo_cleared") !== "1") {
    for (const key of [
      STORAGE_KEYS.COMMISSIONS,
      STORAGE_KEYS.ASSIGNMENTS,
      STORAGE_KEYS.CUSTOM_STATES,
      STORAGE_KEYS.DEAL_VALUES,
      STORAGE_KEYS.PAYMENT_REQUESTS,
    ]) {
      localStorage.removeItem(key);
    }
    localStorage.setItem("epc_agents_demo_cleared", "1");
  }
} catch {
  // storage unavailable (private mode) -- nothing to clean
}

export function getEpcAgentSettings(): EpcAgentSettings {
  const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  if (!data) return { enabled: true, onlyWorkspace: false }; // Auto-enable module for testing, but coexistence mode default
  return JSON.parse(data);
}

export function saveEpcAgentSettings(settings: EpcAgentSettings) {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

export function getLeadStates(): string[] {
  const data = localStorage.getItem(STORAGE_KEYS.STATES);
  if (!data) return DEFAULT_STATES;
  return JSON.parse(data);
}

export function saveLeadStates(states: string[]) {
  localStorage.setItem(STORAGE_KEYS.STATES, JSON.stringify(states));
}

export function getAgentCommissions(): AgentCommission[] {
  const data = localStorage.getItem(STORAGE_KEYS.COMMISSIONS);
  return data ? JSON.parse(data) : [];
}

export function saveAgentCommissions(commissions: AgentCommission[]) {
  localStorage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify(commissions));
}

export function getLeadAssignments(): Record<number, number> {
  const data = localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS);
  return data ? JSON.parse(data) : {};
}

export function saveLeadAssignments(assignments: Record<number, number>) {
  localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
}

/** A lead's "assigned agent" is whoever added it (not editable). The backend
 * is the source of truth; mirror it into the local assignment map that the
 * commission/dashboard maths reads. Leads with no recorded creator (entered
 * by an admin, or before the field existed) keep whatever they had. */
export function syncAssignmentsFromLeads(
  leads: {
    lead_id: number;
    created_by_user_id?: number | null;
    agent_stage?: string;
    deal_value?: string | number | null;
  }[],
) {
  const current = getLeadAssignments();
  let changed = false;
  for (const l of leads) {
    if (l.created_by_user_id != null && current[l.lead_id] !== l.created_by_user_id) {
      current[l.lead_id] = l.created_by_user_id;
      changed = true;
    }
  }
  if (changed) saveLeadAssignments(current);

  // Stage + deal value live on the backend too (so agents see what admins set);
  // mirror them into the local maps the dashboards read.
  const states = getLeadCustomStates();
  const values = getLeadDealValues();
  for (const l of leads) {
    if (l.agent_stage === undefined) continue;
    states[l.lead_id] = l.agent_stage;
    if (l.deal_value != null) values[l.lead_id] = Number(l.deal_value);
    else delete values[l.lead_id];
  }
  saveLeadCustomStates(states);
  saveLeadDealValues(values);
}

export function getLeadCustomStates(): Record<number, string> {
  const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_STATES);
  return data ? JSON.parse(data) : {};
}

export function saveLeadCustomStates(states: Record<number, string>) {
  localStorage.setItem(STORAGE_KEYS.CUSTOM_STATES, JSON.stringify(states));
}

export function getLeadDealValues(): Record<number, number> {
  const data = localStorage.getItem(STORAGE_KEYS.DEAL_VALUES);
  return data ? JSON.parse(data) : {};
}

export function saveLeadDealValues(values: Record<number, number>) {
  localStorage.setItem(STORAGE_KEYS.DEAL_VALUES, JSON.stringify(values));
}

export function getPaymentRequests(): PaymentRequest[] {
  const data = localStorage.getItem(STORAGE_KEYS.PAYMENT_REQUESTS);
  return data ? JSON.parse(data) : [];
}

export function savePaymentRequests(requests: PaymentRequest[]) {
  localStorage.setItem(STORAGE_KEYS.PAYMENT_REQUESTS, JSON.stringify(requests));
}

// Calculations Helpers
export function getEarnedCommission(
  agentId: number,
  allLeads: { lead_id: number }[],
  commissions: AgentCommission[],
  leadStates: string[],
  leadCustomStates: Record<number, string>,
  leadDealValues: Record<number, number>
): number {
  const config = commissions.find((c) => c.agentId === agentId);
  if (!config) return 0;

  const assignments = getLeadAssignments();
  let total = 0;

  // Realized revenue states (typically the last 2 states like ORDER_PLACED or COMPLETED)
  const revenueStates = leadStates.slice(-2);

  allLeads.forEach((l) => {
    const assigned = assignments[l.lead_id];
    if (assigned !== agentId) return;

    const state = leadCustomStates[l.lead_id] || "NEW";
    if (!revenueStates.includes(state)) return;

    const dealValue = leadDealValues[l.lead_id] || 0;
    if (config.type === "PERCENT") {
      total += dealValue * (config.value / 100);
    } else {
      total += config.value;
    }
  });

  return total;
}

export function getPaidCommission(agentId: number, requests: PaymentRequest[]): number {
  return requests
    .filter((r) => r.agentId === agentId && r.status === "PAID")
    .reduce((sum, r) => sum + r.amount, 0);
}

export function addPaymentRequest(agentId: number, agentName: string, amount: number) {
  const requests = getPaymentRequests();
  const newRequest: PaymentRequest = {
    id: `req_${Date.now()}`,
    agentId,
    agentName,
    amount,
    requestedAt: new Date().toISOString(),
    status: "PENDING",
  };
  requests.unshift(newRequest);
  savePaymentRequests(requests);
  return newRequest;
}

export function approvePaymentRequest(id: string) {
  const requests = getPaymentRequests();
  const req = requests.find((r) => r.id === id);
  if (req) {
    req.status = "PAID";
    req.paidAt = new Date().toISOString();
    savePaymentRequests(requests);
  }
}

/** Replace the local commission rules with the backend's. */
export function mirrorServerCommissions(serverRules: AgentCommission[]) {
  saveAgentCommissions(serverRules);
}

/** Replace the local payout requests (ids "srv_<n>") with the backend's. */
export function mirrorServerPayouts(serverRequests: PaymentRequest[]) {
  savePaymentRequests(serverRequests);
}
