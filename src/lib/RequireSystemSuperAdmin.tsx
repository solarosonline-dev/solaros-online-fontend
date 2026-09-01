import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isSystemSuperAdmin } from "./roles";

// Nested inside RequireSystemAdmin in App.tsx, not standalone -- so a plain
// SYSTEM_ADMIN who navigates straight to /app/admin/email redirects to
// /app/admin/dashboard (a sensible in-app landing for a system-scope actor)
// rather than all the way out to /app, and the existing RequireSystemAdmin
// boundary governing every other /app/admin/* route stays untouched.
export default function RequireSystemSuperAdmin() {
  const { user } = useAuth();
  if (!user || !isSystemSuperAdmin(user.roles)) return <Navigate to="/app/admin/dashboard" replace />;
  return <Outlet />;
}
