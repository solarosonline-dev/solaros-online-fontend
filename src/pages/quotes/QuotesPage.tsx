import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { listLeads, type Lead } from "../../api/leads";
import { listQuotes, type QuoteListItem } from "../../api/quotes";
import { ApiError } from "../../api/client";
import "./QuotesPage.css";

type QuoteRow = QuoteListItem & { leadId: number; leadName: string; leadMobile: string };

export default function QuotesPage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const navigate = useNavigate();

  const [newLeads, setNewLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");

  const [quoteRows, setQuoteRows] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);

    listLeads(entityId, { status: "NEW" })
      .then((res) => setNewLeads(res.items))
      .catch(() => {});

    listLeads(entityId)
      .then(async (res) => {
        const leadsWithQuotes = res.items.filter((l) => l.status !== "NEW");
        const rows = await Promise.all(
          leadsWithQuotes.map(async (lead) => {
            const quotesRes = await listQuotes(entityId, lead.lead_id);
            return quotesRes.items.map((q) => ({
              ...q,
              leadId: lead.lead_id,
              leadName: lead.name,
              leadMobile: lead.mobile,
            }));
          }),
        );
        setQuoteRows(rows.flat());
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load quotes"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId]);

  function handleGenerate() {
    if (!selectedLeadId) return;
    navigate(`/app/leads/${selectedLeadId}/quote`);
  }

  return (
    <div className="quotes-page">
      <h1>Quotes</h1>

      <p className="quotes-section-label">Generate a new quote</p>
      <div className="quotes-new-panel">
        {newLeads.length === 0 ? (
          <span style={{ fontSize: 14, color: "var(--app-text-muted)" }}>
            No new leads available — quotes can only be generated for leads that don't have one yet.
          </span>
        ) : (
          <>
            <select value={selectedLeadId} onChange={(e) => setSelectedLeadId(e.target.value)}>
              <option value="">Select a lead…</option>
              {newLeads.map((l) => (
                <option key={l.lead_id} value={l.lead_id}>
                  {l.name} ({l.mobile})
                </option>
              ))}
            </select>
            <button className="quotes-btn primary" disabled={!selectedLeadId} onClick={handleGenerate}>
              Generate quote
            </button>
          </>
        )}
      </div>

      <p className="quotes-section-label">All quotes</p>
      <div className="quotes-table-wrap">
        {loading ? (
          <div className="quotes-loading">Loading…</div>
        ) : loadError ? (
          <div className="quotes-loading">{loadError}</div>
        ) : quoteRows.length === 0 ? (
          <div className="quotes-empty">No quotes yet.</div>
        ) : (
          <table className="quotes-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Mobile</th>
                <th>Total amount</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {quoteRows.map((row) => (
                <tr key={row.quote_id} onClick={() => navigate(`/app/leads/${row.leadId}/quote`)}>
                  <td data-label="Lead">{row.leadName}</td>
                  <td data-label="Mobile">{row.leadMobile}</td>
                  <td data-label="Total amount">₹{Number(row.total_amount).toLocaleString("en-IN")}</td>
                  <td data-label="Status">
                    <span className="quotes-status-badge">{row.status}</span>
                  </td>
                  <td data-label="Created">{new Date(row.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
