import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { canWorkLeads } from "./roles";

// Leads, quote and agreement pages: entity admins plus sales managers/reps
// (a rep only ever receives their own assigned leads from the backend).
export default function RequireLeadStaff() {
  const { user } = useAuth();
  if (!user || !canWorkLeads(user.roles)) return <Navigate to="/app" replace />;
  return <Outlet />;
}
