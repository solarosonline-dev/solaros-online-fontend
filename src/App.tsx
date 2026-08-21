import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import ProtectedRoute from "./lib/ProtectedRoute";
import RequireSystemAdmin from "./lib/RequireSystemAdmin";
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
import LeadDetailPage from "./pages/leads/LeadDetailPage";
import AmcPlansPage from "./pages/amc/AmcPlansPage";
import QuoteBuilderPage from "./pages/quotes/QuoteBuilderPage";
import PublicQuotePage from "./pages/quotes/PublicQuotePage";
import QuotesPage from "./pages/quotes/QuotesPage";

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
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/app" element={<HomeRedirect />} />
              <Route path="/app/entity" element={<EntityManagementPage />} />
              <Route path="/app/users" element={<UsersPage />} />
              <Route path="/app/leads" element={<LeadsPage />} />
              <Route path="/app/leads/:leadId" element={<LeadDetailPage />} />
              <Route path="/app/leads/:leadId/quote" element={<QuoteBuilderPage />} />
              <Route path="/app/quotes" element={<QuotesPage />} />
              <Route path="/app/amc-plans" element={<AmcPlansPage />} />
              <Route element={<RequireSystemAdmin />}>
                <Route path="/app/admin/entities" element={<EntitiesPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
