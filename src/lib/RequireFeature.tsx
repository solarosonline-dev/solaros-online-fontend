import { Navigate, Outlet } from "react-router-dom";
import type { Feature } from "../api/auth";
import { useAuth } from "./AuthContext";
import { hasFeature } from "./roles";

// Route guard for a product module (CRM / DESIGN) -- nested inside
// RequireEntityAdmin in App.tsx. Without the feature, falls back to /app,
// where HomeRedirect picks a landing page the entity does have.
// `feature` may be a list: the entity needs ANY of them (e.g. lead create/detail
// is shared by CRM entities and agent-only (AGENTS) entities).
export default function RequireFeature({ feature }: { feature: Feature | Feature[] }) {
  const { user } = useAuth();
  const features = Array.isArray(feature) ? feature : [feature];
  if (!features.some((f) => hasFeature(user, f))) return <Navigate to="/app" replace />;
  return <Outlet />;
}
