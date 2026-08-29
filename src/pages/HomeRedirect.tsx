import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { isSystemAdmin, isEntityAdmin } from "../lib/roles";

export default function HomeRedirect() {
  const { user } = useAuth();
  if (user && isSystemAdmin(user.roles)) return <Navigate to="/app/admin/entities" replace />;
  if (user?.entity_id && isEntityAdmin(user.roles)) return <Navigate to="/app/leads" replace />;
  if (user?.entity_id) return <Navigate to="/app/my-work-orders" replace />;
  return <h1>Dashboard</h1>;
}
