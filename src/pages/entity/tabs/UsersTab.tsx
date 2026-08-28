import { useEffect, useState } from "react";
import {
  listEntityUsers,
  inviteEntityUser,
  removeEntityUser,
  type EntityUser,
} from "../../../api/entityUsers";
import { ApiError } from "../../../api/client";

const ROLES = ["ENTITY_ADMIN", "ENTITY_SERVICE_MANAGER", "WORKER", "TECHNICIAN"];

type Props = {
  entityId: number;
};

export default function UsersTab({ entityId }: Props) {
  const [users, setUsers] = useState<EntityUser[]>([]);
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
    listEntityUsers(entityId)
      .then((res) => setUsers(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load users"))
      .finally(() => setLoading(false));
  }

  useEffect(loadUsers, [entityId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviting(true);
    try {
      await inviteEntityUser(entityId, { full_name: fullName, email, phone, role });
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
      await removeEntityUser(entityId, userId);
      setUsers((prev) => prev.filter((u) => u.user_id !== userId));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not remove user";
      setRowErrors((prev) => ({ ...prev, [userId]: message }));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div>
      <form className="entity-invite-form" onSubmit={handleInvite}>
        <div className="entity-field">
          <label htmlFor="inviteFullName">Full name</label>
          <input id="inviteFullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="entity-field">
          <label htmlFor="inviteEmail">Email</label>
          <input id="inviteEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="entity-field">
          <label htmlFor="invitePhone">Phone</label>
          <input id="invitePhone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div className="entity-field">
          <label htmlFor="inviteRole">Role</label>
          <select id="inviteRole" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="entity-btn primary" disabled={inviting}>
          {inviting ? "Inviting…" : "Invite"}
        </button>
      </form>
      {inviteError && <p className="entity-status error">{inviteError}</p>}

      {loading ? (
        <div className="entity-loading">Loading…</div>
      ) : loadError ? (
        <p className="entity-status error">{loadError}</p>
      ) : users.length === 0 ? (
        <div className="entity-loading">No users yet.</div>
      ) : (
        <table className="entity-users-table">
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
                <td data-label="Name">{u.full_name}</td>
                <td data-label="Email">{u.email}</td>
                <td data-label="Role">
                  {u.roles.map((r) => (
                    <span className="entity-role-badge" key={r}>
                      {r}
                    </span>
                  ))}
                </td>
                <td data-label="State">{u.state}</td>
                <td>
                  <button
                    type="button"
                    className="entity-btn"
                    disabled={removingId === u.user_id}
                    onClick={() => handleRemove(u.user_id)}
                  >
                    {removingId === u.user_id ? "…" : "Remove"}
                  </button>
                  {rowErrors[u.user_id] && <div className="entity-status error">{rowErrors[u.user_id]}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
