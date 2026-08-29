import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isEntityAdmin } from "./roles";

export default function RequireEntityAdmin() {
  const { user } = useAuth();
  if (!user || !isEntityAdmin(user.roles)) return <Navigate to="/app" replace />;
  return <Outlet />;
}
