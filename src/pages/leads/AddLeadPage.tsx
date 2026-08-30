import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import AddLeadForm from "./AddLeadForm";
import "./LeadsPage.css";

export default function AddLeadPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const navigate = useNavigate();

  return (
    <div className="leads-page">
      <Link to="/app/leads" className="lead-detail-back">
        ← Back to leads
      </Link>

      <h1>Add lead</h1>

      <AddLeadForm
        entityId={entityId}
        onCreated={() => navigate("/app/leads")}
        onCancel={() => navigate("/app/leads")}
      />
    </div>
  );
}
