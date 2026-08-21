import { useEffect, useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { listLeads, type Lead } from "../../api/leads";
import { ApiError } from "../../api/client";
import AddLeadForm from "./AddLeadForm";
import "./LeadsPage.css";

export default function LeadsPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  function load() {
    setLoading(true);
    setLoadError(null);
    listLeads(entityId)
      .then((res) => setLeads(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load leads"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId]);

  function handleCreated() {
    setShowAddForm(false);
    load();
  }

  return (
    <div className="leads-page">
      <h1>
        Leads
        {!showAddForm && (
          <button className="leads-btn primary" onClick={() => setShowAddForm(true)}>
            + Add lead
          </button>
        )}
      </h1>

      {showAddForm && (
        <AddLeadForm entityId={entityId} onCreated={handleCreated} onCancel={() => setShowAddForm(false)} />
      )}

      <div className="leads-table-wrap">
        {loading ? (
          <div className="leads-loading">Loading…</div>
        ) : loadError ? (
          <div className="leads-loading">{loadError}</div>
        ) : leads.length === 0 ? (
          <div className="leads-empty">No leads yet.</div>
        ) : (
          <table className="leads-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.lead_id}>
                  <td>{lead.name}</td>
                  <td>{lead.mobile}</td>
                  <td>
                    <span className="lead-status-badge">{lead.status}</span>
                  </td>
                  <td>{new Date(lead.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
