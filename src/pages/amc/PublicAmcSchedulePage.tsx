import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getPublicAmcSchedule, type AmcScheduleItem, type PublicAmcSchedule } from "../../api/amcSchedule";
import { getPublicEntityBranding, type PublicBranding } from "../../api/entityPreferences";
import { amcFrequencyLabel } from "../../api/amcPlans";
import { ApiError } from "../../api/client";
import "../quotes/PublicQuotePage.css";
import "./PublicAmcSchedulePage.css";

export default function PublicAmcSchedulePage() {
  const { token } = useParams();

  const [data, setData] = useState<PublicAmcSchedule | null>(null);
  const [branding, setBranding] = useState<PublicBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getPublicAmcSchedule(token)
      .then(async (res) => {
        setData(res);
        try {
          setBranding(await getPublicEntityBranding(res.entity_id));
        } catch {
          // Branding is cosmetic — a fetch failure here shouldn't block the schedule itself.
        }
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load this AMC schedule"))
      .finally(() => setLoading(false));
  }, [token]);

  const summary = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const item of data.items) {
      const key = `${item.inclusion_text}|${item.frequency}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([key, count]) => {
      const [text, frequency] = key.split("|");
      const label = amcFrequencyLabel(frequency as AmcScheduleItem["frequency"]);
      return `${count} × ${text}${label ? ` (${label})` : ""}`;
    });
  }, [data]);

  if (loading) {
    return (
      <div className="public-quote-shell">
        <div className="public-quote-status">Loading your AMC schedule…</div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="public-quote-shell">
        <div className="public-quote-status">{loadError ?? "This AMC schedule link is invalid or has expired."}</div>
      </div>
    );
  }

  const entityName = branding?.entity_name ?? data.entity_name;

  return (
    <div className="public-quote-shell">
      <div className="public-quote-wrap">
        <div className="amc-schedule-card">
          <div className="amc-schedule-header">
            <div>
              <h1>{entityName}</h1>
              <p>AMC schedule for {data.customer_name}</p>
            </div>
            <button className="amc-schedule-print-btn no-print" onClick={() => window.print()}>
              Print / save as PDF
            </button>
          </div>

          <div className="amc-schedule-meta">
            <div>
              <span className="label">AMC plan</span>
              <span>{data.amc_plan_name || "—"}</span>
            </div>
            <div>
              <span className="label">Duration</span>
              <span>{data.amc_duration_years != null ? `${data.amc_duration_years} year(s)` : "—"}</span>
            </div>
            <div>
              <span className="label">Total visits</span>
              <span>{data.items.length}</span>
            </div>
          </div>

          {summary.length > 0 && <p className="amc-schedule-summary">{summary.join(" · ")}</p>}

          <table className="public-quote-table">
            <thead>
              <tr>
                <td>Date</td>
                <td>Item</td>
                <td>Frequency</td>
                <td>Status</td>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.schedule_id}>
                  <td>{new Date(item.schedule_date).toLocaleDateString()}</td>
                  <td>{item.inclusion_text}</td>
                  <td>{amcFrequencyLabel(item.frequency)}</td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
