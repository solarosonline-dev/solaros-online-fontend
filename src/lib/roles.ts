export const SYSTEM_ROLES = ["SYSTEM_SUPER_ADMIN", "SYSTEM_ADMIN"];

export function isSystemAdmin(roles: string[]): boolean {
  return roles.some((r) => SYSTEM_ROLES.includes(r));
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
