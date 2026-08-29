import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isSystemAdmin, isEntityAdmin } from "./roles";
import { TourProvider, useTour } from "./TourContext";
import "./AppLayout.css";

export default function AppLayout() {
  // TourProvider has to be an ancestor of both this component (which reads
  // needsAmcSetup to highlight the nav link below) and whatever page renders
  // inside <Outlet/> (which sets it, e.g. QuoteBuilderPage) -- see
  // TourContext.tsx. Splitting into an inner component lets this outer one
  // provide the context while the inner one consumes it via useTour().
  return (
    <TourProvider>
      <AppLayoutInner />
    </TourProvider>
  );
}

function AppLayoutInner() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { needsAmcSetup } = useTour();

  function handleSignOut() {
    signOut();
    navigate("/login");
  }

  // Close the mobile nav panel whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // React Router doesn't reset scroll position on client-side navigation --
  // if a user scrolled down a long page (e.g. a lead's detail view) and then
  // navigates to another page (e.g. Quote Builder), the browser keeps that
  // same scroll offset, so the new page renders already scrolled past its
  // own top -- hiding the topbar above the fold until the user manually
  // scrolls up. Force every route change back to the top so the topbar (and
  // the new page's own header/content) is visible immediately on landing.
  useEffect(() => {
    window.scrollTo(0, 0);
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

  // Only pulse the nav link while the user hasn't already arrived at Entity
  // Settings -- once there, the AMC Plans tab itself takes over the
  // highlighting (see EntityManagementPage.tsx), so a highlighted nav link
  // on top of that would be redundant/distracting.
  const highlightEntitySettings = needsAmcSetup && location.pathname !== "/app/entity";

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
              <span className={highlightEntitySettings ? "app-nav-tour-target" : undefined}>
                <NavLink
                  to={highlightEntitySettings ? "/app/entity?tab=amc&tour=1" : "/app/entity"}
                  className={highlightEntitySettings ? "app-nav-highlight" : undefined}
                >
                  Entity Settings
                </NavLink>
                {highlightEntitySettings && (
                  <span className="app-nav-tour-tip" role="status">
                    No AMC plans are set up yet — define one here before generating a quote.
                  </span>
                )}
              </span>
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
