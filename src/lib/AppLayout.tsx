import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isSystemAdmin, isEntityAdmin } from "./roles";
import "./AppLayout.css";

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleSignOut() {
    signOut();
    navigate("/login");
  }

  // Close the mobile nav panel whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Close the mobile nav panel on Escape (mirrors Modal.tsx behavior).
  useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  const systemAdmin = user ? isSystemAdmin(user.roles) : false;
  const entityAdmin = user ? isEntityAdmin(user.roles) : false;

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-logo">
          Solar<em>OS</em>
        </div>
        <button
          type="button"
          className="app-topbar-menu-btn"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className={`app-mobile-panel ${menuOpen ? "open" : ""}`}>
          <nav className="app-nav">
            {systemAdmin && <NavLink to="/app/admin/dashboard">Dashboard</NavLink>}
            {systemAdmin && <NavLink to="/app/admin/entities">Entities</NavLink>}
            {systemAdmin && <NavLink to="/app/admin/users">System Admins</NavLink>}
            {!systemAdmin && entityAdmin && <NavLink to="/app/dashboard">Dashboard</NavLink>}
            {!systemAdmin && entityAdmin && <NavLink to="/app/leads">Leads</NavLink>}
            {!systemAdmin && entityAdmin && <NavLink to="/app/projects">Projects</NavLink>}
            {!systemAdmin && !entityAdmin && user?.entity_id && (
              <NavLink to="/app/my-work-orders">My Work Orders</NavLink>
            )}
          </nav>
          {!systemAdmin && entityAdmin && (
            <nav className="app-nav app-nav-settings">
              <NavLink to="/app/entity">Entity Settings</NavLink>
              <NavLink to="/app/users">Users</NavLink>
            </nav>
          )}
          <div className="app-topbar-right">
            <span className="app-topbar-user">{user?.full_name}</span>
            <button className="app-topbar-signout" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
