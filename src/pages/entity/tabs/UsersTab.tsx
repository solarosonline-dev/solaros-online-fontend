import { useEffect, useRef, useState } from "react";
import {
  listEntityUsers,
  inviteEntityUser,
  removeEntityUser,
  type EntityUser,
} from "../../../api/entityUsers";
import { ApiError } from "../../../api/client";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { updateEntityPreferences, type RoleLabels } from "../../../api/entityPreferences";

const ROLES = ["ENTITY_ADMIN", "ENTITY_SERVICE_MANAGER", "WORKER", "TECHNICIAN"];

type Props = {
  entityId: number;
  // Admin-defined (or default) display label per role, e.g.
  // {"ENTITY_SERVICE_MANAGER": "Field Ops Lead"} -- editable inline, right
  // where a role gets picked, via the always-visible label field next to the
  // Role select below. Falls back to the raw role constant wherever a role
  // is missing from this map (e.g. while it's still loading).
  roleLabels: RoleLabels;
  // Called after a label is renamed here, so the caller (UsersPage) can
  // update its own roleLabels state -- this component doesn't own that
  // state, it's shared with everywhere else a role name is displayed.
  onRoleLabelsChange: (roleLabels: RoleLabels) => void;
};

export default function UsersTab({ entityId, roleLabels, onRoleLabelsChange }: Props) {
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
  const [pendingRemove, setPendingRemove] = useState<EntityUser | null>(null);

  // Always-visible "display label" field next to the Role select in the
  // invite form -- not a separate Entity Settings page, since the only
  // place a role is actually picked/assigned is right here. Saves on blur
  // (or Enter) rather than behind a Rename button/popup.
  const [labelDraft, setLabelDraft] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  // Suppresses the sync-from-roleLabels effect below while the label field
  // is focused, so an in-flight preferences fetch (or another admin's edit)
  // landing mid-keystroke can't clobber what's being typed.
  const labelFocused = useRef(false);

  useEffect(() => {
    if (labelFocused.current) return;
    setLabelDraft(roleLabels[role] ?? role);
  }, [role, roleLabels]);

  async function handleSaveLabel() {
    const trimmed = labelDraft.trim();
    const current = roleLabels[role] ?? role;
    if (!trimmed || trimmed === current) {
      setLabelDraft(current);
      return;
    }
    setSavingLabel(true);
    setLabelError(null);
    try {
      const updated = await updateEntityPreferences(entityId, { role_labels: { [role]: trimmed } });
      onRoleLabelsChange(updated.role_labels);
    } catch (err) {
      setLabelError(err instanceof ApiError ? err.message : "Could not save label");
      setLabelDraft(current);
    } finally {
      setSavingLabel(false);
    }
  }

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
    setPendingRemove(null);
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
        <div className="entity-field entity-role-field">
          <div className="entity-role-row">
            <div className="entity-role-col">
              <label htmlFor="inviteRole" className="entity-role-label-caption">
                Role
              </label>
              <select id="inviteRole" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="entity-role-col">
              <label htmlFor="inviteRoleLabel" className="entity-role-label-caption">
                Display Name
              </label>
              <input
                id="inviteRoleLabel"
                type="text"
                className="entity-role-label-input"
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onFocus={() => {
                  labelFocused.current = true;
                }}
                onBlur={() => {
                  labelFocused.current = false;
                  handleSaveLabel();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Display name"
                disabled={savingLabel}
              />
            </div>
          </div>
          {labelError && <p className="entity-status error">{labelError}</p>}
        </div>
        <button type="submit" className="entity-btn primary" disabled={inviting}>
          {inviting ? "Inviting…" : "Invite"}
        </button>
        {inviteError && <p className="entity-status error entity-invite-error">{inviteError}</p>}
      </form>

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
              <th>Mobile</th>
              <th>Role</th>
              <th>Display Name</th>
              <th>State</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id}>
                <td data-label="Name">{u.full_name}</td>
                <td data-label="Email">{u.email}</td>
                <td data-label="Mobile">{u.phone || "—"}</td>
                <td data-label="Role">
                  {u.roles.map((r) => (
                    <span className="entity-role-badge" key={r}>
                      {r}
                    </span>
                  ))}
                </td>
                <td data-label="Display Name">
                  {u.roles.map((r) => (
                    <span className="entity-role-badge" key={r}>
                      {roleLabels[r] ?? r}
                    </span>
                  ))}
                </td>
                <td data-label="State">{u.state}</td>
                <td>
                  <button
                    type="button"
                    className="entity-btn"
                    disabled={removingId === u.user_id}
                    onClick={() => setPendingRemove(u)}
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

      <ConfirmDialog
        open={pendingRemove != null}
        title="Remove this user?"
        message={`This permanently removes ${pendingRemove?.full_name} from this entity. This can't be undone.`}
        confirmLabel="Remove"
        confirming={removingId === pendingRemove?.user_id}
        confirmingLabel="Removing…"
        onConfirm={() => pendingRemove && handleRemove(pendingRemove.user_id)}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}
