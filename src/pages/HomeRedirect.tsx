import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { isSystemAdmin, isEntityAdmin, hasFeature, isAgent } from "../lib/roles";
import { getEpcAgentSettings } from "../lib/epcAgentStorage";

export default function HomeRedirect() {
  const { user } = useAuth();
  if (user && isSystemAdmin(user.roles)) return <Navigate to="/app/admin/entities" replace />;
  
  if (user?.entity_id && isAgent(user.roles)) {
    return <Navigate to="/app/agent/dashboard" replace />;
  }

  if (user?.entity_id && isEntityAdmin(user.roles)) {
    if (hasFeature(user, "AGENTS")) {
      const settings = getEpcAgentSettings();
      // No CRM => no /app/leads; the EPC workspace is the only lead view.
      if (!hasFeature(user, "CRM") || (settings.enabled && settings.onlyWorkspace)) {
        return <Navigate to="/app/epc/dashboard" replace />;
      }
    }
    if (hasFeature(user, "CRM")) return <Navigate to="/app/leads" replace />;
    if (hasFeature(user, "DESIGN")) return <Navigate to="/app/plant-design" replace />;
    return <Navigate to="/app/entity" replace />;
  }
  // Field roles (WORKER/TECHNICIAN) only ever work inside CRM work orders.
  if (user?.entity_id && hasFeature(user, "CRM")) return <Navigate to="/app/my-work-orders" replace />;
  if (user?.entity_id) return <p>Your organisation doesn't have any modules enabled for your role. Contact your admin.</p>;
  return <h1>Dashboard</h1>;
}
