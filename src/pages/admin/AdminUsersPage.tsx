import { useEffect, useState, type FormEvent } from "react";
import { listAdminUsers, inviteAdminUser, removeAdminUser, type AdminUser } from "../../api/adminUsers";
import { ApiError } from "../../api/client";
import "./EntitiesPage.css";
import "./AdminUsersPage.css";

const ROLES = ["SYSTEM_ADMIN", "SYSTEM_SUPER_ADMIN"];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  function loadUsers() {
    setLoading(true);
    setLoadError(null);
    listAdminUsers()
      .then((res) => setUsers(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load users"))
      .finally(() => setLoading(false));
  }

  useEffect(loadUsers, []);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviting(true);
    try {
      await inviteAdminUser({ full_name: fullName, email, phone, role });
      setFullName("");
      setEmail("");
      setPhone("");
      setRole(ROLES[0]);
      loadUsers();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Could not invite user");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId: number) {
    setRemovingId(userId);
    setRowErrors((prev) => ({ ...prev, [userId]: "" }));
    try {
      await removeAdminUser(userId);
      setUsers((prev) => prev.filter((u) => u.user_id !== userId));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not remove user";
      setRowErrors((prev) => ({ ...prev, [userId]: message }));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="admin-users-page">
      <h1>System Admins</h1>

      <form className="admin-users-invite-form" onSubmit={handleInvite}>
        <div className="admin-users-field">
          <label htmlFor="auFullName">Full name</label>
          <input id="auFullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="admin-users-field">
          <label htmlFor="auEmail">Email</label>
          <input id="auEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="admin-users-field">
          <label htmlFor="auPhone">Phone</label>
          <input id="auPhone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div className="admin-users-field">
          <label htmlFor="auRole">Role</label>
          <select id="auRole" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="entities-action-btn primary" disabled={inviting}>
          {inviting ? "Inviting…" : "Invite"}
        </button>
      </form>
      {inviteError && <p className="entities-row-error">{inviteError}</p>}

      <div className="entities-table-wrap">
        {loading ? (
          <div className="entities-loading">Loading…</div>
        ) : loadError ? (
          <div className="entities-loading">{loadError}</div>
        ) : users.length === 0 ? (
          <div className="entities-empty">No system admins yet.</div>
        ) : (
          <table className="entities-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id}>
                  <td>{u.full_name}</td>
                  <td>{u.email}</td>
                  <td>
                    {u.roles.map((r) => (
                      <span className="admin-users-role-badge" key={r}>
                        {r}
                      </span>
                    ))}
                  </td>
                  <td>{u.state}</td>
                  <td>
                    <button
                      className="entities-action-btn"
                      disabled={removingId === u.user_id}
                      onClick={() => handleRemove(u.user_id)}
                    >
                      {removingId === u.user_id ? "…" : "Remove"}
                    </button>
                    {rowErrors[u.user_id] && <div className="entities-row-error">{rowErrors[u.user_id]}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
