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
      <header className="app-topbar">
        <div className="app-topbar-logo">
          Solar<em>OS</em>
        </div>
        <nav className="app-nav">
          {systemAdmin && <NavLink to="/app/admin/entities">Entities</NavLink>}
          {systemAdmin && <NavLink to="/app/admin/users">System Admins</NavLink>}
          {!systemAdmin && user?.entity_id && <NavLink to="/app/leads">Leads</NavLink>}
          {!systemAdmin && user?.entity_id && <NavLink to="/app/quotes">Quotes</NavLink>}
          {!systemAdmin && user?.entity_id && <NavLink to="/app/agreements">Agreements</NavLink>}
          {!systemAdmin && user?.entity_id && <NavLink to="/app/projects">Projects</NavLink>}
        </nav>
        {!systemAdmin && user?.entity_id && (
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
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
