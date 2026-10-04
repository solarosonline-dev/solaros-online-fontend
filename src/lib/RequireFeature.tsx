import { Navigate, Outlet } from "react-router-dom";
import type { Feature } from "../api/auth";
import { useAuth } from "./AuthContext";
import { hasFeature } from "./roles";

// Route guard for a product module (CRM / DESIGN) -- nested inside
// RequireEntityAdmin in App.tsx. Without the feature, falls back to /app,
// where HomeRedirect picks a landing page the entity does have.
export default function RequireFeature({ feature }: { feature: Feature }) {
  const { user } = useAuth();
  if (!hasFeature(user, feature)) return <Navigate to="/app" replace />;
  return <Outlet />;
}
