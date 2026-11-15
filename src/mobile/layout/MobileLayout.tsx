import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { isEntityAdmin, isAgent, isSalesStaff, hasFeature, isSystemAdmin } from "../../lib/roles";
import { getEpcAgentSettings } from "../../lib/epcAgentStorage";
import { TourProvider } from "../../lib/TourContext";
import "./MobileLayout.css";
import "../mobile-system.css";

export default function MobileLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  // The Plant Design editor is a full-screen workspace: no floating tab bar over it.
  const hideTabBar = /^\/app\/plant-design\/.+/.test(location.pathname);

  // Close the slide-up sheet when routing changes
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const handleSignOut = () => {
    signOut();
    navigate("/login");
  };

  const entityAdmin = user ? isEntityAdmin(user.roles) : false;
  const systemAdmin = user ? isSystemAdmin(user.roles) : false;
  const agentUser = user ? isAgent(user.roles) : false;
  const salesStaff = user ? isSalesStaff(user.roles) : false;
  const hasAgentsFeature = user ? hasFeature(user, "AGENTS") : false;
  const agentSettings = hasAgentsFeature ? getEpcAgentSettings() : { enabled: false, onlyWorkspace: false };
  const crm = user ? hasFeature(user, "CRM") : false;
  const agentsOnly = hasAgentsFeature && !crm;
  const showAgentsExclusive = hasAgentsFeature && (agentsOnly || (agentSettings.enabled && agentSettings.onlyWorkspace));
  const showAgentsCoexist = hasAgentsFeature && !agentsOnly && agentSettings.enabled && !agentSettings.onlyWorkspace;

  return (
    <TourProvider>
      <div className="mobile-shell">
      {/* Top sticky header bar */}
      <header className="mobile-header">
        <div className="mobile-header-logo">
          Solar<em>OS</em>
        </div>
        <div className="mobile-header-user">
          {user?.full_name ? user.full_name.split(" ")[0] : "User"}
        </div>
      </header>

      {/* Primary viewport content */}
      <main className="mobile-main">
        <Outlet />
      </main>

      {/* Bottom Navigation Tab Bar */}
      <nav className={`mobile-tab-bar${hideTabBar ? " mobile-tab-bar-hidden" : ""}`}>
        {/* Agent mode */}
        {agentUser && (
          <>
            <NavLink
              to="/app/agent/dashboard"
              className={({ isActive }) => `mobile-tab-item ${isActive ? "active" : ""}`}
            >
              <span className="mobile-tab-icon">📊</span>
              <span className="mobile-tab-label">Dashboard</span>
            </NavLink>
            <NavLink
              to="/app/agent/leads"
              className={({ isActive }) => `mobile-tab-item ${isActive ? "active" : ""}`}
            >
              <span className="mobile-tab-icon">👤</span>
              <span className="mobile-tab-label">Leads</span>
            </NavLink>
            <NavLink
              to="/app/agent/payments"
              className={({ isActive }) => `mobile-tab-item ${isActive ? "active" : ""}`}
            >
              <span className="mobile-tab-icon">💰</span>
              <span className="mobile-tab-label">Commissions</span>
            </NavLink>
          </>
        )}

        {/* EPC Admin in Exclusive Workspace mode */}
        {!systemAdmin && entityAdmin && !agentUser && showAgentsExclusive && (
          <>
            <NavLink
              to="/app/epc/dashboard"
              className={({ isActive }) => `mobile-tab-item ${isActive ? "active" : ""}`}
            >
              <span className="mobile-tab-icon">📊</span>
              <span className="mobile-tab-label">Dashboard</span>
            </NavLink>
            <NavLink
              to="/app/epc/leads"
              className={({ isActive }) => `mobile-tab-item ${isActive ? "active" : ""}`}
            >
              <span className="mobile-tab-icon">👤</span>
              <span className="mobile-tab-label">Leads</span>
            </NavLink>
            <NavLink
              to="/app/epc/payments"
              className={({ isActive }) => `mobile-tab-item ${isActive ? "active" : ""}`}
            >
              <span className="mobile-tab-icon">💰</span>
              <span className="mobile-tab-label">Payments</span>
            </NavLink>
          </>
        )}

        {/* Standard CRM mode / Coexisting mode */}
        {!agentUser && (!entityAdmin || !showAgentsExclusive) && (
          <>
            {entityAdmin && (
              <NavLink
                to="/app/dashboard"
                className={({ isActive }) => `mobile-tab-item ${isActive ? "active" : ""}`}
              >
                <span className="mobile-tab-icon">📊</span>
                <span className="mobile-tab-label">Dashboard</span>
              </NavLink>
            )}
            <NavLink
              to="/app/leads"
              className={({ isActive }) => `mobile-tab-item ${isActive ? "active" : ""}`}
            >
              <span className="mobile-tab-icon">👤</span>
              <span className="mobile-tab-label">Leads</span>
            </NavLink>
            {entityAdmin && (
              <NavLink
                to="/app/projects"
                className={({ isActive }) => `mobile-tab-item ${isActive ? "active" : ""}`}
              >
                <span className="mobile-tab-icon">📋</span>
                <span className="mobile-tab-label">Projects</span>
              </NavLink>
            )}
            {!salesStaff && (
            <NavLink
              to="/app/my-work-orders"
              className={({ isActive }) => `mobile-tab-item ${isActive ? "active" : ""}`}
            >
              <span className="mobile-tab-icon">⚙️</span>
              <span className="mobile-tab-label">My Work</span>
            </NavLink>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`mobile-tab-item mobile-tab-more-btn ${moreOpen ? "active" : ""}`}
        >
          <span className="mobile-tab-icon">⚡</span>
          <span className="mobile-tab-label">More</span>
        </button>
      </nav>

      {/* Tactile Slide-up Bottom Sheet (More Menu) */}
      {moreOpen && (
        <div className="mobile-sheet-overlay" onClick={() => setMoreOpen(false)}>
          <div className="mobile-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-sheet-handle-bar" onClick={() => setMoreOpen(false)} />
            
            <div className="mobile-sheet-header">
              <h3>Options & Utilities</h3>
              <p>{user?.email}</p>
            </div>

            <div className="mobile-sheet-links">
              {entityAdmin && (
                <>
                  <NavLink to="/app/entity" className="mobile-sheet-link-item">
                    <span className="sheet-link-icon">🏢</span>
                    <span className="sheet-link-text">Entity Management Settings</span>
                  </NavLink>
                  <NavLink to="/app/users" className="mobile-sheet-link-item">
                    <span className="sheet-link-icon">👥</span>
                    <span className="sheet-link-text">Manage Team Users</span>
                  </NavLink>
                </>
              )}

              {entityAdmin && user && hasFeature(user, "DESIGN") && (
                <NavLink to="/app/plant-design" className="mobile-sheet-link-item">
                  <span className="sheet-link-icon">☀️</span>
                  <span className="sheet-link-text">Plant Design</span>
                </NavLink>
              )}

              {entityAdmin && showAgentsCoexist && (
                <>
                  <NavLink to="/app/epc/payments" className="mobile-sheet-link-item">
                    <span className="sheet-link-icon">💰</span>
                    <span className="sheet-link-text">Agent Payments</span>
                  </NavLink>
                </>
              )}

              <button
                type="button"
                onClick={handleSignOut}
                className="mobile-sheet-link-item mobile-sheet-signout-btn"
              >
                <span className="sheet-link-icon">🚀</span>
                <span className="sheet-link-text" style={{ color: "var(--app-danger)" }}>
                  Sign Out of Session
                </span>
              </button>
            </div>

            <button
              type="button"
              className="mobile-sheet-close-btn"
              onClick={() => setMoreOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      </div>
    </TourProvider>
  );
}
