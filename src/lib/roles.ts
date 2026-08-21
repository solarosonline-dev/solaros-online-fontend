export const SYSTEM_ROLES = ["SYSTEM_SUPER_ADMIN", "SYSTEM_ADMIN"];

export function isSystemAdmin(roles: string[]): boolean {
  return roles.some((r) => SYSTEM_ROLES.includes(r));
}
