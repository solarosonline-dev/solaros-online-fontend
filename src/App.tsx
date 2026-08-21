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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/activate" element={<ActivatePage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/app" element={<HomeRedirect />} />
              <Route path="/app/entity" element={<EntityManagementPage />} />
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
