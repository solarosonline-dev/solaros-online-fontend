import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "../../lib/AuthContext";
import {
  listEntityUsers,
  inviteEntityUser,
  removeEntityUser,
  type EntityUser,
} from "../../api/entityUsers";
import { updateEntityPreferences, getEntityPreferences, type RoleLabels } from "../../api/entityPreferences";
import { ApiError } from "../../api/client";
import ConfirmDialog from "../../components/ConfirmDialog";
import "./MobileUsersPage.css";

const ROLES = ["ENTITY_ADMIN", "SALES_MANAGER", "SALES_REP", "ENTITY_SERVICE_MANAGER", "ENTITY_AGENT", "WORKER", "TECHNICIAN"];

export default function MobileUsersPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;

  const [users, setUsers] = useState<EntityUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roleLabels, setRoleLabels] = useState<RoleLabels>({});

  // Invite Form Modal state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [labelDraft, setLabelDraft] = useState("");
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [savingLabel, setSavingLabel] = useState(false);

  const [removingId, setRemovingId] = useState<number | null>(null);
  const [pendingRemove, setPendingRemove] = useState<EntityUser | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  const labelFocused = useRef(false);

  // Click outside handler to close the custom dropdown menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync the display label whenever role or roleLabels change
  useEffect(() => {
    if (labelFocused.current) return;
    setLabelDraft(roleLabels[role] ?? role);
  }, [role, roleLabels]);

  function loadData() {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      listEntityUsers(entityId),
      getEntityPreferences(entityId),
    ])
      .then(([usersRes, prefsRes]) => {
        setUsers(usersRes.items);
        setRoleLabels(prefsRes.role_labels);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Failed to load team users");
      })
      .finally(() => setLoading(false));
  }

  useEffect(loadData, [entityId]);

  async function handleSaveLabel() {
    const trimmed = labelDraft.trim();
    const current = roleLabels[role] ?? role;
    if (!trimmed || trimmed === current) {
      setLabelDraft(current);
      return;
    }
    setSavingLabel(true);
    try {
      const updated = await updateEntityPreferences(entityId, { role_labels: { [role]: trimmed } });
      setRoleLabels(updated.role_labels);
    } catch (err) {
      // Fallback silently or show alert
      setLabelDraft(current);
    } finally {
      setSavingLabel(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviting(true);

    try {
      // Save display label first if customized
      await handleSaveLabel();

      await inviteEntityUser(entityId, { full_name: fullName.trim(), email: email.trim(), phone: phone.trim(), role });
      setFullName("");
      setEmail("");
      setPhone("");
      setRole(ROLES[0]);
      setIsInviteOpen(false);
      loadData();
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
    <div className="mobile-users-page">
      <div className="mobile-users-header">
        <h1>Team Users</h1>
        <button
          type="button"
          className="mobile-btn-add-primary"
          onClick={() => setIsInviteOpen(true)}
        >
          ➕ Add User
        </button>
      </div>

      <p className="mobile-users-sub">Manage roles, coordinates, and system sign-off levels.</p>

      {/* User Card Listing */}
      <div className="mobile-users-list">
        {loading ? (
          <div className="mobile-users-state">
            <div className="mobile-users-spinner" />
            <p>Loading roster...</p>
          </div>
        ) : loadError ? (
          <div className="mobile-users-state error">
            <p>{loadError}</p>
            <button onClick={loadData} className="mobile-users-retry">Retry</button>
          </div>
        ) : users.length === 0 ? (
          <div className="mobile-users-state empty">
            <p>No team members found.</p>
          </div>
        ) : (
          users.map((u) => (
            <div key={u.user_id} className="mobile-user-card">
              <button
                type="button"
                className="user-card-delete-icon"
                aria-label="Remove user"
                disabled={removingId === u.user_id}
                onClick={() => setPendingRemove(u)}
              >
                {removingId === u.user_id ? "…" : "🗑️"}
              </button>
              <div className="mobile-user-card-main">
                <div className="mobile-user-info">
                  <h3>{u.full_name}</h3>
                  <p>📧 {u.email}</p>
                  <p>📱 {u.phone || "—"}</p>
                  <p className="user-state-badge">🌐 Status: {u.state}</p>
                </div>
                
                {/* Badges block */}
                <div className="mobile-user-badges">
                  {u.roles.map((r) => (
                    <span key={r} className="mobile-user-badge">
                      {roleLabels[r] ?? r}
                    </span>
                  ))}
                </div>
              </div>

              {rowErrors[u.user_id] && (
                <div className="mobile-user-row-error">⚠️ {rowErrors[u.user_id]}</div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Invite overlay modal */}
      {isInviteOpen && (
        <div className="mobile-user-modal-overlay" onClick={() => setIsInviteOpen(false)}>
          <div className="mobile-user-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-user-modal-handle" onClick={() => setIsInviteOpen(false)} />
            
            <div className="mobile-user-modal-header">
              <h3>Invite Team Member</h3>
              <p>Add full coordinates and assign structural sign-off roles.</p>
            </div>

            <form onSubmit={handleInvite} className="mobile-user-invite-form">
              <div className="mobile-form-field">
                <label>Full Name *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. David Miller"
                  required
                />
              </div>

              <div className="mobile-form-field">
                <label>Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. david@solaros.online"
                  required
                />
              </div>

              <div className="mobile-form-field">
                <label>Phone Number *</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  required
                />
              </div>

              <div className="mobile-form-row">
                <div className="mobile-form-field" style={{ flex: 1.2 }} ref={dropdownRef}>
                  <label>Role Category</label>
                  <div className="custom-dropdown-container">
                    <button
                      type="button"
                      className="custom-dropdown-toggle"
                      onClick={() => setIsDropdownOpen((prev) => !prev)}
                    >
                      <span>{role.replace("ENTITY_", "").replace("_", " ")}</span>
                      <span className="dropdown-arrow-indicator">▼</span>
                    </button>
                    {isDropdownOpen && (
                      <div className="custom-dropdown-menu">
                        {ROLES.map((r) => (
                          <div
                            key={r}
                            className={`custom-dropdown-item ${role === r ? "selected" : ""}`}
                            onClick={() => {
                              setRole(r);
                              setIsDropdownOpen(false);
                            }}
                          >
                            {r.replace("ENTITY_", "").replace("_", " ")}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mobile-form-field" style={{ flex: 1 }}>
                  <label>Custom Label</label>
                  <input
                    type="text"
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    placeholder="e.g. Field Surveyor"
                    disabled={savingLabel}
                  />
                </div>
              </div>

              {inviteError && (
                <div className="mobile-user-submit-error">⚠️ {inviteError}</div>
              )}

              <div className="mobile-user-modal-actions">
                <button
                  type="submit"
                  className="mobile-user-submit-btn"
                  disabled={inviting}
                >
                  {inviting ? "Inviting User..." : "🚀 Invite Member"}
                </button>
                <button
                  type="button"
                  className="mobile-user-cancel-btn"
                  onClick={() => setIsInviteOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm user removal dialog */}
      <ConfirmDialog
        open={pendingRemove != null}
        title="Remove team member?"
        message={`Are you sure you want to permanently remove ${pendingRemove?.full_name} from your organization? All future work orders and assignments must be re-routed.`}
        confirmLabel="Remove User"
        confirming={removingId === pendingRemove?.user_id}
        confirmingLabel="Removing..."
        onConfirm={() => pendingRemove && handleRemove(pendingRemove.user_id)}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}
