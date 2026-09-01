import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getEmailCampaign, type EmailCampaignDetail } from "../../api/adminEmail";
import { ApiError } from "../../api/client";
import "./EmailPage.css";

// Own route (shareable URL, room for a full up-to-200-row result table) --
// linked from EmailCampaignHistoryPanel.tsx.
export default function EmailCampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaign, setCampaign] = useState<EmailCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) return;
    setLoading(true);
    setLoadError(null);
    getEmailCampaign(Number(campaignId))
      .then(setCampaign)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load campaign"))
      .finally(() => setLoading(false));
  }, [campaignId]);

  return (
    <div className="email-page">
      <Link to="/app/admin/email?tab=history">← Back to history</Link>
      <h1 style={{ marginTop: 12 }}>Campaign detail</h1>

      {loading ? (
        <div className="entities-loading">Loading…</div>
      ) : loadError || !campaign ? (
        <div className="entities-loading">{loadError ?? "Not found."}</div>
      ) : (
        <div className="email-panel">
          <p>
            <strong>Subject:</strong> {campaign.subject}
          </p>
          <p>
            <strong>From:</strong> {campaign.from_email}
          </p>
          <p>
            <strong>Sent at:</strong> {new Date(campaign.created_at).toLocaleString()}
          </p>

          <div className="email-summary-banner">
            <span>
              <strong>{campaign.sent_count}</strong> sent
            </span>
            <span>
              <strong>{campaign.failed_count}</strong> failed
            </span>
            <span>
              <strong>{campaign.recipient_count}</strong> total
            </span>
          </div>

          <div className="email-recipients-table-wrap">
            <table className="email-recipients-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {campaign.results.map((r, i) => (
                  <tr key={i}>
                    <td>{r.email}</td>
                    <td>{r.name ?? "—"}</td>
                    <td>
                      <span className={`email-status-badge status-${r.status}`}>{r.status}</span>
                    </td>
                    <td>
                      {r.error && <div className="email-recipient-error">{r.error}</div>}
                      {r.warnings.length > 0 && <div className="email-hint">{r.warnings.join("; ")}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
