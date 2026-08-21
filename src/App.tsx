import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import ProtectedRoute from "./lib/ProtectedRoute";
import LoginPage from "./pages/auth/LoginPage";
import LandingPage from "./pages/public/LandingPage";

function DashboardPlaceholder() {
  return <h1>Dashboard (Phase 2+)</h1>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<DashboardPlaceholder />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
