import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isSystemAdmin } from "./roles";

export default function RequireSystemAdmin() {
  const { user } = useAuth();
  if (!user || !isSystemAdmin(user.roles)) return <Navigate to="/app" replace />;
  return <Outlet />;
}
