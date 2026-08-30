import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import ProtectedRoute from "./lib/ProtectedRoute";
import RequireSystemAdmin from "./lib/RequireSystemAdmin";
import RequireEntityAdmin from "./lib/RequireEntityAdmin";
import AppLayout from "./lib/AppLayout";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import ActivatePage from "./pages/auth/ActivatePage";
import LandingPage from "./pages/public/LandingPage";
import HomeRedirect from "./pages/HomeRedirect";
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/activate" element={<ActivatePage />} />
          <Route path="/q/:token" element={<PublicQuotePage />} />
          <Route path="/a/:token" element={<PublicAgreementPage />} />
          <Route path="/amc-schedule/:token" element={<PublicAmcSchedulePage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/app" element={<HomeRedirect />} />
              <Route path="/app/my-work-orders" element={<MyWorkOrdersPage />} />
              <Route path="/app/work-orders/:workOrderId" element={<WorkOrderDetailPage />} />
              <Route element={<RequireEntityAdmin />}>
                <Route path="/app/dashboard" element={<EntityDashboardPage />} />
                <Route path="/app/entity" element={<EntityManagementPage />} />
                <Route path="/app/users" element={<UsersPage />} />
                <Route path="/app/leads" element={<LeadsPage />} />
                <Route path="/app/leads/new" element={<AddLeadPage />} />
                <Route path="/app/leads/:leadId" element={<LeadDetailPage />} />
                <Route path="/app/leads/:leadId/quote" element={<QuoteBuilderPage />} />
                <Route path="/app/leads/:leadId/agreement" element={<AgreementBuilderPage />} />
                <Route path="/app/projects" element={<ProjectsPage />} />
                <Route path="/app/projects/:projectId" element={<ProjectDetailPage />} />
              </Route>
              <Route element={<RequireSystemAdmin />}>
                <Route path="/app/admin/entities" element={<EntitiesPage />} />
                <Route path="/app/admin/users" element={<AdminUsersPage />} />
                <Route path="/app/admin/dashboard" element={<AdminDashboardPage />} />
                <Route path="/app/admin/entities/:entityId/metrics" element={<EntityMetricsDrilldownPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
