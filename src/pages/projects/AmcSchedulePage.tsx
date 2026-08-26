import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import {
  listAmcSchedule,
  generateAmcSchedule,
  updateAmcScheduleItemStatus,
  shareAmcSchedule,
  type AmcScheduleItem,
} from "../../api/amcSchedule";
import { amcFrequencyLabel } from "../../api/amcPlans";
import { ApiError } from "../../api/client";
import "./ProjectsPage.css";

export default function AmcSchedulePage() {
  const { user } = useAuth();
  const entityId = user!.entity_id!;
  const { projectId } = useParams();
  const pid = Number(projectId);

  const [items, setItems] = useState<AmcScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    listAmcSchedule(entityId, pid)
      .then((res) => setItems(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load AMC schedule"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, pid]);

  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = `${item.inclusion_text}|${item.frequency}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([key, count]) => {
      const [text, frequency] = key.split("|");
      const label = amcFrequencyLabel(frequency as AmcScheduleItem["frequency"]);
      return `${count} × ${text}${label ? ` (${label})` : ""}`;
    });
  }, [items]);

  async function handleGenerate(regenerate: boolean) {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await generateAmcSchedule(entityId, pid, regenerate ? { regenerate: true } : {});
      setItems(res.items);
      setShareUrl(null);
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : "Could not generate the AMC schedule");
    } finally {
      setGenerating(false);
    }
  }

  async function handleMarkCompleted(scheduleId: number) {
    setUpdatingId(scheduleId);
    try {
      const updated = await updateAmcScheduleItemStatus(entityId, scheduleId, "COMPLETED");
      setItems((prev) => prev.map((i) => (i.schedule_id === scheduleId ? updated : i)));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not update this item");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleShare() {
    setSharing(true);
    setShareError(null);
    try {
      const res = await shareAmcSchedule(entityId, pid);
      setShareUrl(res.share_url);
    } catch (err) {
      setShareError(err instanceof ApiError ? err.message : "Could not create a share link");
    } finally {
      setSharing(false);
    }
  }

  if (loading) return <div className="projects-loading">Loading…</div>;

  return (
    <div className="projects-page">
      <Link to={`/app/projects/${pid}`} className="project-detail-back">
        ← Back to project
      </Link>

      <div className="project-detail-header">
        <h1 style={{ margin: 0 }}>AMC schedule</h1>
        <div className="project-detail-actions">
          {items.length > 0 && (
            <button className="projects-btn" disabled={generating} onClick={() => handleGenerate(true)}>
              {generating ? "Regenerating…" : "Regenerate"}
            </button>
          )}
          {items.length > 0 && (
            <button className="projects-btn primary" disabled={sharing} onClick={handleShare}>
              {sharing ? "Creating link…" : "Share"}
            </button>
          )}
        </div>
      </div>

      {loadError && <p className="projects-status error">{loadError}</p>}
      {generateError && <p className="projects-status error">{generateError}</p>}
      {shareError && <p className="projects-status error">{shareError}</p>}
      {shareUrl && (
        <p className="projects-status success">
          Share link:{" "}
          <a href={shareUrl} target="_blank" rel="noreferrer">
            {shareUrl}
          </a>
        </p>
      )}

      {items.length === 0 ? (
        <div className="projects-empty">
          <p>No AMC schedule generated yet for this project.</p>
          <button className="projects-btn primary" disabled={generating} onClick={() => handleGenerate(false)}>
            {generating ? "Generating…" : "Generate AMC schedule"}
          </button>
        </div>
      ) : (
        <>
          {summary.length > 0 && (
            <p className="projects-section-label">{summary.join(" · ")}</p>
          )}
          <div className="projects-table-wrap">
            <table className="projects-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Frequency</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.schedule_id}>
                    <td>{new Date(item.schedule_date).toLocaleDateString()}</td>
                    <td>{item.inclusion_text}</td>
                    <td>{amcFrequencyLabel(item.frequency)}</td>
                    <td>
                      <span
                        className={item.status === "COMPLETED" ? "project-status-badge completed" : "project-status-badge"}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td>
                      {item.status === "PENDING" && (
                        <button
                          className="projects-btn"
                          disabled={updatingId === item.schedule_id}
                          onClick={() => handleMarkCompleted(item.schedule_id)}
                        >
                          {updatingId === item.schedule_id ? "Saving…" : "Mark completed"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
