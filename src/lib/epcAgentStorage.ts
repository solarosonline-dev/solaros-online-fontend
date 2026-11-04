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

export interface MockAgent {
  user_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  roles: string[];
}

export interface MockLead {
  lead_id: number;
  name: string;
  mobile: string;
  created_at: string;
}

// Hardcoded mock agents to guarantee beautiful charts even if DB has no agents registered yet
export const MOCK_AGENTS: MockAgent[] = [
  {
    user_id: 9901,
    full_name: "Aarav Sharma",
    email: "aarav.sharma@solaros.online",
    phone: "+91 98765 43210",
    roles: ["ENTITY_AGENT"],
  },
  {
    user_id: 9902,
    full_name: "Ishaan Patel",
    email: "ishaan.patel@solaros.online",
    phone: "+91 87654 32109",
    roles: ["ENTITY_AGENT"],
  },
  {
    user_id: 9903,
    full_name: "Ananya Iyer",
    email: "ananya.iyer@solaros.online",
    phone: "+91 76543 21098",
    roles: ["ENTITY_AGENT"],
  },
];

// Hardcoded mock leads to populate dashboards with rich historical data
export const MOCK_LEADS: MockLead[] = [
  { lead_id: 901, name: "Vikas Gupta", mobile: "9812345678", created_at: "2026-11-01T10:00:00Z" },
  { lead_id: 902, name: "Priya Nair", mobile: "9823456789", created_at: "2026-11-02T11:15:00Z" },
  { lead_id: 903, name: "Amit Verma", mobile: "9834567890", created_at: "2026-11-02T14:30:00Z" },
  { lead_id: 904, name: "Riya Sen", mobile: "9845678901", created_at: "2026-11-03T09:00:00Z" },
  { lead_id: 905, name: "Suresh Prabhu", mobile: "9856789012", created_at: "2026-11-03T16:45:00Z" },
  { lead_id: 906, name: "Meera Deshmukh", mobile: "9867890123", created_at: "2026-11-04T12:00:00Z" },
  { lead_id: 907, name: "Rajesh Khanna", mobile: "9878901234", created_at: "2026-11-04T15:10:00Z" },
];

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
  if (!data) {
    // Seed default commission rules
    const seed: AgentCommission[] = [
      { agentId: 9901, type: "PERCENT", value: 5 }, // 5% commission
      { agentId: 9902, type: "FIXED", value: 12000 }, // Flat 12,000 INR
      { agentId: 9903, type: "PERCENT", value: 8 }, // 8% commission
    ];
    localStorage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify(seed));
    return seed;
  }
  return JSON.parse(data);
}

export function saveAgentCommissions(commissions: AgentCommission[]) {
  localStorage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify(commissions));
}

export function getLeadAssignments(): Record<number, number> {
  const data = localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS);
  if (!data) {
    // Seed default assignments for mock leads
    const seed: Record<number, number> = {
      901: 9901,
      902: 9901,
      903: 9902,
      904: 9902,
      905: 9903,
      906: 9903,
      907: 9901,
    };
    localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(seed));
    return seed;
  }
  return JSON.parse(data);
}

export function saveLeadAssignments(assignments: Record<number, number>) {
  localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
}

export function getLeadCustomStates(): Record<number, string> {
  const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_STATES);
  if (!data) {
    // Seed states for mock leads
    const seed: Record<number, string> = {
      901: "COMPLETED",
      902: "PROPOSAL_SENT",
      903: "ORDER_PLACED",
      904: "CONTACTED",
      905: "COMPLETED",
      906: "MEETING_SCHEDULED",
      907: "ORDER_PLACED",
    };
    localStorage.setItem(STORAGE_KEYS.CUSTOM_STATES, JSON.stringify(seed));
    return seed;
  }
  return JSON.parse(data);
}

export function saveLeadCustomStates(states: Record<number, string>) {
  localStorage.setItem(STORAGE_KEYS.CUSTOM_STATES, JSON.stringify(states));
}

export function getLeadDealValues(): Record<number, number> {
  const data = localStorage.getItem(STORAGE_KEYS.DEAL_VALUES);
  if (!data) {
    // Seed deal values for revenue-generating states
    const seed: Record<number, number> = {
      901: 450000, // aarav sharma -> completed -> ₹22,500 earned
      903: 380000, // ishaan patel -> order placed -> ₹12,000 earned (fixed)
      905: 620000, // ananya iyer -> completed -> ₹49,600 earned
      907: 500000, // aarav sharma -> order placed -> ₹25,000 earned
    };
    localStorage.setItem(STORAGE_KEYS.DEAL_VALUES, JSON.stringify(seed));
    return seed;
  }
  return JSON.parse(data);
}

export function saveLeadDealValues(values: Record<number, number>) {
  localStorage.setItem(STORAGE_KEYS.DEAL_VALUES, JSON.stringify(values));
}

export function getPaymentRequests(): PaymentRequest[] {
  const data = localStorage.getItem(STORAGE_KEYS.PAYMENT_REQUESTS);
  if (!data) {
    // Seed payment requests
    const seed: PaymentRequest[] = [
      {
        id: "req_1",
        agentId: 9901,
        agentName: "Aarav Sharma",
        amount: 20000,
        requestedAt: "2026-11-03T10:00:00Z",
        status: "PAID",
        paidAt: "2026-11-04T09:30:00Z",
      },
      {
        id: "req_2",
        agentId: 9901,
        agentName: "Aarav Sharma",
        amount: 15000,
        requestedAt: "2026-11-04T11:00:00Z",
        status: "PENDING",
      },
      {
        id: "req_3",
        agentId: 9903,
        agentName: "Ananya Iyer",
        amount: 30000,
        requestedAt: "2026-11-02T14:00:00Z",
        status: "PAID",
        paidAt: "2026-11-03T16:00:00Z",
      },
    ];
    localStorage.setItem(STORAGE_KEYS.PAYMENT_REQUESTS, JSON.stringify(seed));
    return seed;
  }
  return JSON.parse(data);
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
