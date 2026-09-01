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
