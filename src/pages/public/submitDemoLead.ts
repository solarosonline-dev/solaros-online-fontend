export type DemoLeadData = {
  name: string;
  email: string;
  company: string;
  type: string;
  teamsize: string;
  projects: string;
  notes?: string;
};

/**
 * TODO: no public "book a demo" endpoint exists on the new backend yet
 * (this is a SolarOS-prospect lead, distinct from an entity's own
 * Lead resource under /entities/{entityId}/leads). Persists locally
 * for now so the form is usable; wire to a real endpoint once one
 * exists.
 */
export async function submitDemoLead(data: DemoLeadData): Promise<void> {
  const key = "solaros_demo_leads";
  const arr = JSON.parse(localStorage.getItem(key) ?? "[]");
  arr.push({ ...data, _submitted_at: new Date().toISOString() });
  localStorage.setItem(key, JSON.stringify(arr));
  await new Promise((resolve) => setTimeout(resolve, 300));
}
