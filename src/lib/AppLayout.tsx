import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { isSystemAdmin } from "./roles";
import "./AppLayout.css";

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  function handleSignOut() {
    signOut();
    navigate("/login");
  }

  const systemAdmin = user ? isSystemAdmin(user.roles) : false;

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-logo">
          Solar<em>OS</em>
        </div>
        <nav className="app-nav">
          {systemAdmin && <NavLink to="/app/admin/entities">Entities</NavLink>}
          {!systemAdmin && user?.entity_id && <NavLink to="/app/leads">Leads</NavLink>}
          {!systemAdmin && user?.entity_id && <NavLink to="/app/quotes">Quotes</NavLink>}
          {!systemAdmin && user?.entity_id && <NavLink to="/app/amc-plans">AMC Plans</NavLink>}
          {!systemAdmin && user?.entity_id && <NavLink to="/app/entity">Entity Settings</NavLink>}
          {!systemAdmin && user?.entity_id && <NavLink to="/app/users">Users</NavLink>}
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <span className="app-topbar-user">{user?.full_name}</span>
          <button className="app-topbar-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
