import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isSystemAdmin, isEntityAdmin, isSystemSuperAdmin } from "./roles";
import { TourProvider, useTour } from "./TourContext";
import OnboardingTour, { type OnboardingRole } from "./OnboardingTour";
import { sweepExpiredDrafts } from "./drafts";
import "./AppLayout.css";

function onboardingTourSeenKey(userId: number) {
  return `onboarding_tour_seen_${userId}`;
}

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

  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  // One-time cleanup of expired local draft-autosave entries (Lead/Quote/
  // Agreement forms) per app session -- see lib/drafts.ts.
  useEffect(() => {
    sweepExpiredDrafts();
  }, []);

  // Auto-show the guided tour the first time this user reaches the app --
  // "seen" is tracked per user id in localStorage (simplest option, no
  // backend change; the tradeoff is it resets on a different browser/
  // device). Runs once `user` first resolves, not on every render.
  useEffect(() => {
    if (!user) return;
    if (!localStorage.getItem(onboardingTourSeenKey(user.user_id))) {
      setOnboardingStep(0);
      setOnboardingOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id]);

  function closeOnboardingTour() {
    setOnboardingOpen(false);
    if (user) localStorage.setItem(onboardingTourSeenKey(user.user_id), "1");
  }

  function replayOnboardingTour() {
    setOnboardingStep(0);
    setOnboardingOpen(true);
  }

  function handleOnboardingNavigate(path: string) {
    closeOnboardingTour();
    navigate(path);
  }

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
  // Nav visibility only -- the backend (require_system_super_admin) is the
  // real gate. Stricter than systemAdmin: SYSTEM_ADMIN must not see this
  // link, only SYSTEM_SUPER_ADMIN.
  const superAdmin = user ? isSystemSuperAdmin(user.roles) : false;
  const onboardingRole: OnboardingRole = systemAdmin ? "system_admin" : entityAdmin ? "entity_admin" : "worker";

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
            {superAdmin && <NavLink to="/app/admin/email">Email</NavLink>}
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
            <button type="button" className="app-topbar-tour-link" onClick={replayOnboardingTour}>
              Take the tour
            </button>
            <button className="app-topbar-signout" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
      {user && (
        <OnboardingTour
          open={onboardingOpen}
          step={onboardingStep}
          role={onboardingRole}
          onStepChange={setOnboardingStep}
          onClose={closeOnboardingTour}
          onNavigate={handleOnboardingNavigate}
        />
      )}
    </div>
  );
}
