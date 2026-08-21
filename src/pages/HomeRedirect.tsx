import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { isSystemAdmin } from "../lib/roles";

export default function HomeRedirect() {
  const { user } = useAuth();
  if (user && isSystemAdmin(user.roles)) return <Navigate to="/app/admin/entities" replace />;
  if (user?.entity_id) return <Navigate to="/app/entity" replace />;
  return <h1>Dashboard</h1>;
}
