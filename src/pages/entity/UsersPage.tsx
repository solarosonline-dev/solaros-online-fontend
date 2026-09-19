import { useEffect, useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { getEntityPreferences, type RoleLabels } from "../../api/entityPreferences";
import UsersTab from "./tabs/UsersTab";
import "./EntityManagementPage.css";

export default function UsersPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;

  // Friendly role labels for the invite dropdown/badges below -- falls back
  // to the raw role name (via UsersTab's `roleLabels[r] ?? r`) until this
  // loads, and silently stays empty on failure rather than blocking the
  // whole page over a non-critical label lookup.
  const [roleLabels, setRoleLabels] = useState<RoleLabels>({});

  useEffect(() => {
    getEntityPreferences(entityId)
      .then((prefs) => setRoleLabels(prefs.role_labels))
      .catch(() => {});
  }, [entityId]);

  return (
    <div className="entity-mgmt">
      <h1>Users</h1>
      <div className="entity-panel">
        <UsersTab entityId={entityId} roleLabels={roleLabels} onRoleLabelsChange={setRoleLabels} />
      </div>
    </div>
  );
}
