import type { Feature } from "../api/auth";
import { getEpcAgentSettings } from "./epcAgentStorage";

export const SYSTEM_ROLES = ["SYSTEM_SUPER_ADMIN", "SYSTEM_ADMIN"];

export function isSystemAdmin(roles: string[]): boolean {
  return roles.some((r) => SYSTEM_ROLES.includes(r));
}

// Mirrors the backend's ENTITY_ADMIN_ROLES / is_entity_admin (app/api/deps.py).
// Leads, quotes, agreements, projects, entity users, teams, entity
// details/preferences, and the entity metrics dashboard are all gated to
// these two roles now -- every other ENTITY-scope role (WORKER, TECHNICIAN,
// ENTITY_SERVICE_MANAGER) is field-facing only and gets 403 SCOPE_MISMATCH
// from the backend for those resources.
export const ENTITY_ADMIN_ROLES = ["ENTITY_ADMIN", "ENTITY_SUPER_ADMIN"];

export function isEntityAdmin(roles: string[]): boolean {
  return roles.some((r) => ENTITY_ADMIN_ROLES.includes(r));
}

// Sales staff: a SALES_MANAGER sees every lead and assigns them to reps; a
// SALES_REP sees only the leads assigned to them. Mirrors the backend's
// SALES_STAFF_ROLES / is_lead_manager (app/api/deps.py). Neither gets projects,
// users or entity settings -- only the lead-to-agreement path.
export function isSalesManager(roles: string[]): boolean {
  return roles.includes("SALES_MANAGER");
}

export function isSalesRep(roles: string[]): boolean {
  return roles.includes("SALES_REP");
}

export function isSalesStaff(roles: string[]): boolean {
  return isSalesManager(roles) || isSalesRep(roles);
}

// Who can see all leads and assign them to a sales rep.
export function canManageLeads(roles: string[]): boolean {
  return isEntityAdmin(roles) || isSalesManager(roles);
}

// Admins plus sales staff: the audience of the Leads / quote / agreement pages.
export function canWorkLeads(roles: string[]): boolean {
  return isEntityAdmin(roles) || isSalesStaff(roles);
}

export function isAgent(roles: string[]): boolean {
  return roles.includes("ENTITY_AGENT");
}

// Entity-scoped roles that can view the cross-project "AMC visits due" tab
// and create/assign AMC work orders -- mirrors the backend's
// AMC_MANAGER_ROLES (app/api/deps.py). ENTITY_ADMIN/ENTITY_SUPER_ADMIN can
// already do everything; ENTITY_SERVICE_MANAGER is the dedicated role for
// delegating AMC/service management without full admin rights.
export const AMC_MANAGER_ROLES = ["ENTITY_ADMIN", "ENTITY_SUPER_ADMIN", "ENTITY_SERVICE_MANAGER"];

export function canManageAmc(roles: string[]): boolean {
  return roles.some((r) => AMC_MANAGER_ROLES.includes(r));
}

// Mirrors the backend's require_system_super_admin (app/api/deps.py) --
// deliberately stricter than isSystemAdmin above: the Email module sends
// real mail from connect@solaros.online to an arbitrary external recipient
// list, so it's gated to SYSTEM_SUPER_ADMIN only, not SYSTEM_ADMIN too. This
// is a UX-only check (hiding the nav link / redirecting) -- the backend is
// the real gate either way.
export const SYSTEM_SUPER_ADMIN_ROLES = ["SYSTEM_SUPER_ADMIN"];

export function isSystemSuperAdmin(roles: string[]): boolean {
  return roles.some((r) => SYSTEM_SUPER_ADMIN_ROLES.includes(r));
}

// Whether the user's entity has a product module enabled -- mirrors the
// backend's require_feature (app/api/deps.py), which 403s FEATURE_NOT_ENABLED
// otherwise. UX-only (nav links, route guards, hiding cross-module links);
// the backend is the real gate.
export function hasFeature(user: { features?: Feature[] } | null | undefined, feature: Feature): boolean {
  return !!user?.features?.includes(feature);
}

// The Agent-module experience: agents themselves, and entity admins working in
// the agent workspace (an AGENTS entity without CRM, or one set to "agent
// workspace only"). Both get the lean lead view -- no AI bill parsing, quote
// generation, rejecting, or work orders; those are CRM features.
export function isAgentModuleUser(
  user: { roles: string[]; features?: Feature[] } | null | undefined,
): boolean {
  if (!user) return false;
  if (isAgent(user.roles)) return true;
  if (!isEntityAdmin(user.roles) || !hasFeature(user, "AGENTS")) return false;
  if (!hasFeature(user, "CRM")) return true;
  const settings = getEpcAgentSettings();
  return settings.enabled && settings.onlyWorkspace;
}
