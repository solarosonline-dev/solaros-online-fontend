import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { isSystemAdmin, isEntityAdmin, hasFeature } from "../lib/roles";

export default function HomeRedirect() {
  const { user } = useAuth();
  if (user && isSystemAdmin(user.roles)) return <Navigate to="/app/admin/entities" replace />;
  if (user?.entity_id && isEntityAdmin(user.roles)) {
    if (hasFeature(user, "CRM")) return <Navigate to="/app/leads" replace />;
    if (hasFeature(user, "DESIGN")) return <Navigate to="/app/plant-design" replace />;
    if (hasFeature(user, "MARKETPLACE_SELL")) return <Navigate to="/app/vendor/kyc" replace />;
    return <Navigate to="/app/entity" replace />;
  }
  // Field roles (WORKER/TECHNICIAN) only ever work inside CRM work orders.
  if (user?.entity_id && hasFeature(user, "CRM")) return <Navigate to="/app/my-work-orders" replace />;
  if (user?.entity_id) return <p>Your organisation doesn't have any modules enabled for your role. Contact your admin.</p>;
  return <h1>Dashboard</h1>;
}
