import React, { Suspense } from "react";
import { createBrowserRouter, createRoutesFromElements, RouterProvider, Route } from "react-router-dom";
import { AuthProvider } from "../lib/AuthContext";
import ProtectedRoute from "../lib/ProtectedRoute";
import RequireFeature from "../lib/RequireFeature";
import RequireEntityAdmin from "../lib/RequireEntityAdmin";

// Public Pages (Shared)
import LoginPage from "../pages/auth/LoginPage";
import RegisterPage from "../pages/auth/RegisterPage";
import ActivatePage from "../pages/auth/ActivatePage";
import ForgotPasswordPage from "../pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "../pages/auth/ResetPasswordPage";
import TrialExpiredPage from "../pages/TrialExpiredPage";
import LandingPage from "../pages/public/LandingPage";
import PublicQuotePage from "../pages/quotes/PublicQuotePage";
import PublicAgreementPage from "../pages/agreements/PublicAgreementPage";
import PublicAmcSchedulePage from "../pages/amc/PublicAmcSchedulePage";
import HomeRedirect from "../pages/HomeRedirect";

// Shared settings and project components that will be responsive via mobile CSS
import EntityManagementPage from "../pages/entity/EntityManagementPage";
import QuoteBuilderPage from "../pages/quotes/QuoteBuilderPage";
import AgreementBuilderPage from "../pages/agreements/AgreementBuilderPage";
import ProjectsPage from "../pages/projects/ProjectsPage";
import ProjectDetailPage from "../pages/projects/ProjectDetailPage";

// Mobile-Specific Components (Lazy loaded)
import MobileLayout from "./layout/MobileLayout";

const MobileDashboardPage = React.lazy(() => import("./pages/MobileDashboardPage"));
const MobileLeadsPage = React.lazy(() => import("./pages/MobileLeadsPage"));
const MobileAddLeadPage = React.lazy(() => import("./pages/MobileAddLeadPage"));
const MobileLeadDetailPage = React.lazy(() => import("./pages/MobileLeadDetailPage"));
const MobileWorkOrdersPage = React.lazy(() => import("./pages/MobileWorkOrdersPage"));
const MobileWorkOrderDetailPage = React.lazy(() => import("./pages/MobileWorkOrderDetailPage"));
const MobileUsersPage = React.lazy(() => import("./pages/MobileUsersPage"));

const MobileAdminFallback = () => (
  <div style={{ padding: "40px 20px", textAlign: "center", fontFamily: "var(--app-font, sans-serif)", color: "var(--app-text)" }}>
    <div style={{ fontSize: "48px", marginBottom: "20px" }}>🖥️</div>
    <h3 style={{ marginBottom: "10px" }}>Desktop Optimized</h3>
    <p style={{ color: "var(--app-text-muted)", fontSize: "14px", lineHeight: "1.5" }}>
      The SolarOS Administrator Panels are optimized for desktop use. Please log in on a larger screen to access system settings.
    </p>
  </div>
);

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/activate" element={<ActivatePage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/trial-expired" element={<TrialExpiredPage />} />
      <Route path="/q/:token" element={<PublicQuotePage />} />
      <Route path="/a/:token" element={<PublicAgreementPage />} />
      <Route path="/amc-schedule/:token" element={<PublicAmcSchedulePage />} />
      
      <Route element={<ProtectedRoute />}>
        <Route element={<MobileLayout />}>
          <Route path="/app" element={<HomeRedirect />} />
          
          {/* CRM module gates */}
          <Route element={<RequireFeature feature="CRM" />}>
            <Route
              path="/app/my-work-orders"
              element={
                <Suspense fallback={<div>Loading work orders...</div>}>
                  <MobileWorkOrdersPage />
                </Suspense>
              }
            />
            <Route
              path="/app/work-orders/:workOrderId"
              element={
                <Suspense fallback={<div>Loading details...</div>}>
                  <MobileWorkOrderDetailPage />
                </Suspense>
              }
            />
          </Route>
          
          {/* Leads creation and detail */}
          <Route element={<RequireFeature feature={["CRM", "AGENTS"]} />}>
            <Route
              path="/app/leads/new"
              element={
                <Suspense fallback={<div>Loading form...</div>}>
                  <MobileAddLeadPage />
                </Suspense>
              }
            />
            <Route
              path="/app/leads/:leadId"
              element={
                <Suspense fallback={<div>Loading lead...</div>}>
                  <MobileLeadDetailPage />
                </Suspense>
              }
            />
          </Route>
          
          <Route element={<RequireEntityAdmin />}>
            <Route path="/app/entity" element={<EntityManagementPage />} />
            <Route
              path="/app/users"
              element={
                <Suspense fallback={<div>Loading roster...</div>}>
                  <MobileUsersPage />
                </Suspense>
              }
            />
            
            <Route element={<RequireFeature feature="CRM" />}>
              <Route
                path="/app/dashboard"
                element={
                  <Suspense fallback={<div>Loading dashboard...</div>}>
                    <MobileDashboardPage />
                  </Suspense>
                }
              />
              <Route
                path="/app/leads"
                element={
                  <Suspense fallback={<div>Loading leads...</div>}>
                    <MobileLeadsPage />
                  </Suspense>
                }
              />
              {/* Mobile active builders and projects */}
              <Route path="/app/leads/:leadId/quote" element={<QuoteBuilderPage />} />
              <Route path="/app/leads/:leadId/agreement" element={<AgreementBuilderPage />} />
              <Route path="/app/projects" element={<ProjectsPage />} />
              <Route path="/app/projects/:projectId" element={<ProjectDetailPage />} />
              <Route path="/app/govt-demo" element={<MobileAdminFallback />} />
            </Route>
            
            <Route element={<RequireFeature feature="DESIGN" />}>
              <Route path="/app/plant-design" element={<MobileAdminFallback />} />
              <Route path="/app/plant-design/new" element={<MobileAdminFallback />} />
              <Route path="/app/plant-design/:plantDesignId" element={<MobileAdminFallback />} />
            </Route>
          </Route>
          
          {/* System Admin Routes Fallback on Mobile */}
          <Route path="/app/admin/*" element={<MobileAdminFallback />} />
        </Route>
      </Route>
    </>
  )
);

export default function MobileApp() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
