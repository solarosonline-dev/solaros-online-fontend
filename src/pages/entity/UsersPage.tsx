import { useAuth } from "../../lib/AuthContext";
import UsersTab from "./tabs/UsersTab";
import "./EntityManagementPage.css";

export default function UsersPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;

  return (
    <div className="entity-mgmt">
      <h1>Users</h1>
      <div className="entity-panel">
        <UsersTab entityId={entityId} />
      </div>
    </div>
  );
}
