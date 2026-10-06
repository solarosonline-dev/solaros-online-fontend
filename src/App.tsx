import { createBrowserRouter, createRoutesFromElements, RouterProvider, Route } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import ProtectedRoute from "./lib/ProtectedRoute";
import RequireSystemAdmin from "./lib/RequireSystemAdmin";
import RequireSystemSuperAdmin from "./lib/RequireSystemSuperAdmin";
import RequireEntityAdmin from "./lib/RequireEntityAdmin";
import RequireFeature from "./lib/RequireFeature";
import AppLayout from "./lib/AppLayout";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import ActivatePage from "./pages/auth/ActivatePage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import TrialExpiredPage from "./pages/TrialExpiredPage";
import LandingPage from "./pages/public/LandingPage";
import HomeRedirect from "./pages/HomeRedirect";
import VendorKycPage from "./pages/vendor/VendorKycPage";
import KycReviewPage from "./pages/admin/KycReviewPage";
import ListingsPage from "./pages/vendor/ListingsPage";
import BulkUploadPage from "./pages/vendor/BulkUploadPage";
import ProposeProductPage from "./pages/vendor/ProposeProductPage";
import CatalogAdminPage from "./pages/admin/marketplace/CatalogAdminPage";
import MarketsAdminPage from "./pages/admin/marketplace/MarketsAdminPage";
import ConfigAdminPage from "./pages/admin/marketplace/ConfigAdminPage";
import EntitiesPage from "./pages/admin/EntitiesPage";
import EntityManagementPage from "./pages/entity/EntityManagementPage";
import UsersPage from "./pages/entity/UsersPage";
import LeadsPage from "./pages/leads/LeadsPage";
import AddLeadPage from "./pages/leads/AddLeadPage";
import LeadDetailPage from "./pages/leads/LeadDetailPage";
import QuoteBuilderPage from "./pages/quotes/QuoteBuilderPage";
import PublicQuotePage from "./pages/quotes/PublicQuotePage";
import AgreementBuilderPage from "./pages/agreements/AgreementBuilderPage";
import PublicAgreementPage from "./pages/agreements/PublicAgreementPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import ProjectsPage from "./pages/projects/ProjectsPage";
import ProjectDetailPage from "./pages/projects/ProjectDetailPage";
import WorkOrderDetailPage from "./pages/projects/WorkOrderDetailPage";
import PublicAmcSchedulePage from "./pages/amc/PublicAmcSchedulePage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import EntityMetricsDrilldownPage from "./pages/admin/EntityMetricsDrilldownPage";
import EntityDashboardPage from "./pages/admin/EntityDashboardPage";
import MyWorkOrdersPage from "./pages/workorders/MyWorkOrdersPage";
import EmailPage from "./pages/admin/EmailPage";
import EmailCampaignDetailPage from "./pages/admin/EmailCampaignDetailPage";
import PlantDesignListPage from "./pages/plant-design/PlantDesignListPage";
import PlantDesignEditorPage from "./pages/plant-design/PlantDesignEditorPage";

// A data router (createBrowserRouter) rather than <BrowserRouter>, so
// pages can use useBlocker - the plant-design editor relies on it to ask
// before in-app navigation (sidebar links, Back, redirects) throws away
// unsaved changes. Same route tree as before, just built with
// createRoutesFromElements. Created once at module scope, as the API
// expects.
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
        <Route element={<AppLayout />}>
          <Route path="/app" element={<HomeRedirect />} />
          {/* Product-module gates (see RequireFeature.tsx / the backend's
              require_feature): CRM is everything but plant design, DESIGN is
              plant design only. Entity Settings and Users are core. */}
          <Route element={<RequireFeature feature="CRM" />}>
            <Route path="/app/my-work-orders" element={<MyWorkOrdersPage />} />
            <Route path="/app/work-orders/:workOrderId" element={<WorkOrderDetailPage />} />
          </Route>
          <Route element={<RequireEntityAdmin />}>
            <Route path="/app/entity" element={<EntityManagementPage />} />
            <Route path="/app/users" element={<UsersPage />} />
            <Route element={<RequireFeature feature="CRM" />}>
              <Route path="/app/dashboard" element={<EntityDashboardPage />} />
              <Route path="/app/leads" element={<LeadsPage />} />
              <Route path="/app/leads/new" element={<AddLeadPage />} />
              <Route path="/app/leads/:leadId" element={<LeadDetailPage />} />
              <Route path="/app/leads/:leadId/quote" element={<QuoteBuilderPage />} />
              <Route path="/app/leads/:leadId/agreement" element={<AgreementBuilderPage />} />
              <Route path="/app/projects" element={<ProjectsPage />} />
              <Route path="/app/projects/:projectId" element={<ProjectDetailPage />} />
            </Route>
            <Route element={<RequireFeature feature="MARKETPLACE_SELL" />}>
              <Route path="/app/vendor/kyc" element={<VendorKycPage />} />
              <Route path="/app/vendor/listings" element={<ListingsPage />} />
              <Route path="/app/vendor/bulk" element={<BulkUploadPage />} />
              <Route path="/app/vendor/products" element={<ProposeProductPage />} />
            </Route>
            <Route element={<RequireFeature feature="DESIGN" />}>
              <Route path="/app/plant-design" element={<PlantDesignListPage />} />
              <Route path="/app/plant-design/new" element={<PlantDesignEditorPage />} />
              <Route path="/app/plant-design/:plantDesignId" element={<PlantDesignEditorPage />} />
            </Route>
          </Route>
          <Route element={<RequireSystemAdmin />}>
            <Route path="/app/admin/entities" element={<EntitiesPage />} />
            <Route path="/app/admin/users" element={<AdminUsersPage />} />
            <Route path="/app/admin/kyc" element={<KycReviewPage />} />
            <Route path="/app/admin/marketplace/catalog" element={<CatalogAdminPage />} />
            <Route path="/app/admin/marketplace/markets" element={<MarketsAdminPage />} />
            <Route path="/app/admin/marketplace/config" element={<ConfigAdminPage />} />
            <Route path="/app/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/app/admin/entities/:entityId/metrics" element={<EntityMetricsDrilldownPage />} />
            {/* SYSTEM_SUPER_ADMIN only -- stricter than the rest of this
                block, which also admits SYSTEM_ADMIN. See
                RequireSystemSuperAdmin.tsx. */}
            <Route element={<RequireSystemSuperAdmin />}>
              <Route path="/app/admin/email" element={<EmailPage />} />
              <Route path="/app/admin/email/campaigns/:campaignId" element={<EmailCampaignDetailPage />} />
            </Route>
          </Route>
        </Route>
      </Route>
    </>
  )
);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
