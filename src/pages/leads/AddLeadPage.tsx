import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { isAgent, hasFeature } from "../../lib/roles";
import { getEpcAgentSettings } from "../../lib/epcAgentStorage";
import AddLeadForm from "./AddLeadForm";
import "./LeadsPage.css";

export default function AddLeadPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const navigate = useNavigate();

  const isAgentUser = user ? isAgent(user.roles) : false;
  const hasAgentsFeature = user ? hasFeature(user, "AGENTS") : false;
  const agentSettings = hasAgentsFeature ? getEpcAgentSettings() : { enabled: false, onlyWorkspace: false };

  let targetPath = "/app/leads";
  if (isAgentUser) {
    targetPath = "/app/agent/leads";
  } else if (hasAgentsFeature && (!hasFeature(user, "CRM") || (agentSettings.enabled && agentSettings.onlyWorkspace))) {
    targetPath = "/app/epc/leads";
  }

  return (
    <div className="leads-page">
      <Link to={targetPath} className="lead-detail-back">
        ← Back to leads
      </Link>

      <h1>Add lead</h1>

      <AddLeadForm
        entityId={entityId}
        onCreated={() => navigate(targetPath)}
        onCancel={() => navigate(targetPath)}
      />
    </div>
  );
}
