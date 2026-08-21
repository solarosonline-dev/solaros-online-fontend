import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { listLeads, type Lead } from "../../api/leads";
import { listAgreements, type AgreementListItem } from "../../api/agreements";
import { ApiError } from "../../api/client";
import "../quotes/QuotesPage.css";

type AgreementRow = AgreementListItem & { leadId: number; leadName: string; leadMobile: string };

export default function AgreementsPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const navigate = useNavigate();

  const [eligibleLeads, setEligibleLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");

  const [agreementRows, setAgreementRows] = useState<AgreementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);

    listLeads(entityId, { status: "QUOTE_ACCEPTED" })
      .then((res) => setEligibleLeads(res.items))
      .catch(() => {});

    listLeads(entityId)
      .then(async (res) => {
        const leadsWithAgreements = res.items.filter((l) => l.status !== "NEW" && l.status !== "QUOTE_GENERATED");
        const rows = await Promise.all(
          leadsWithAgreements.map(async (lead) => {
            const agreementsRes = await listAgreements(entityId, lead.lead_id);
            return agreementsRes.items.map((a) => ({
              ...a,
              leadId: lead.lead_id,
              leadName: lead.name,
              leadMobile: lead.mobile,
            }));
          }),
        );
        setAgreementRows(rows.flat());
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load agreements"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId]);

  function handleGenerate() {
    if (!selectedLeadId) return;
    navigate(`/app/leads/${selectedLeadId}/agreement`);
  }

  return (
    <div className="quotes-page">
      <h1>Agreements</h1>

      <p className="quotes-section-label">Generate a new agreement</p>
      <div className="quotes-new-panel">
        {eligibleLeads.length === 0 ? (
          <span style={{ fontSize: 14, color: "var(--app-text-muted)" }}>
            No leads ready yet — agreements can only be generated once a lead's quote has been accepted.
          </span>
        ) : (
          <>
            <select value={selectedLeadId} onChange={(e) => setSelectedLeadId(e.target.value)}>
              <option value="">Select a lead…</option>
              {eligibleLeads.map((l) => (
                <option key={l.lead_id} value={l.lead_id}>
                  {l.name} ({l.mobile})
                </option>
              ))}
            </select>
            <button className="quotes-btn primary" disabled={!selectedLeadId} onClick={handleGenerate}>
              Generate agreement
            </button>
          </>
        )}
      </div>

      <p className="quotes-section-label">All agreements</p>
      <div className="quotes-table-wrap">
        {loading ? (
          <div className="quotes-loading">Loading…</div>
        ) : loadError ? (
          <div className="quotes-loading">{loadError}</div>
        ) : agreementRows.length === 0 ? (
          <div className="quotes-empty">No agreements yet.</div>
        ) : (
          <table className="quotes-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Mobile</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {agreementRows.map((row) => (
                <tr key={row.agreement_id} onClick={() => navigate(`/app/leads/${row.leadId}/agreement`)}>
                  <td>{row.leadName}</td>
                  <td>{row.leadMobile}</td>
                  <td>
                    <span className="quotes-status-badge">{row.status}</span>
                  </td>
                  <td>{new Date(row.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
