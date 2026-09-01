import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listEmailCampaigns, type EmailCampaignListItem } from "../../api/adminEmail";
import { ApiError } from "../../api/client";
import Pagination from "../../lib/Pagination";
import "./EmailPage.css";

const PAGE_SIZE = 20;

export default function EmailCampaignHistoryPanel() {
  const [items, setItems] = useState<EmailCampaignListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    listEmailCampaigns({ page, page_size: PAGE_SIZE })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load campaigns"))
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) return <div className="entities-loading">Loading…</div>;
  if (loadError) return <div className="entities-loading">{loadError}</div>;
  if (items.length === 0) return <div className="entities-empty">No campaigns sent yet.</div>;

  return (
    <div>
      <div className="entities-table-wrap">
        <table className="entities-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>From</th>
              <th>Sent</th>
              <th>Failed</th>
              <th>Total</th>
              <th>Sent at</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.campaign_id}>
                <td>{c.subject}</td>
                <td>{c.from_email}</td>
                <td>{c.sent_count}</td>
                <td>{c.failed_count}</td>
                <td>{c.recipient_count}</td>
                <td>{new Date(c.created_at).toLocaleString()}</td>
                <td>
                  <Link className="entities-action-btn" to={`/app/admin/email/campaigns/${c.campaign_id}`}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}
