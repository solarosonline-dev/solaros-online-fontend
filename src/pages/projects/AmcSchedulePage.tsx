import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import {
  listAmcSchedule,
  generateAmcSchedule,
  updateAmcScheduleItemStatus,
  generateAmcScheduleWorkOrder,
  shareAmcSchedule,
  type AmcScheduleItem,
} from "../../api/amcSchedule";
import { amcFrequencyLabel } from "../../api/amcPlans";
import { ApiError } from "../../api/client";
import CopyLinkButton from "../../components/CopyLinkButton";
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

  const [generatingWorkOrderId, setGeneratingWorkOrderId] = useState<number | null>(null);
  const [workOrderError, setWorkOrderError] = useState<string | null>(null);

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

  // Mirrors the backend's AMCScheduleRepository.get_next_pending_group:
  // the earliest schedule_date among still-PENDING items, and every item
  // sharing that exact date -- kept in lockstep with the server so the two
  // never disagree about what's currently due for work-order generation.
  const nextDue = useMemo(() => {
    const pending = items.filter((i) => i.status === "PENDING");
    if (pending.length === 0) return [];
    const nextDate = pending.reduce((min, i) => (i.schedule_date < min ? i.schedule_date : min), pending[0].schedule_date);
    return pending.filter((i) => i.schedule_date === nextDate);
  }, [items]);

  async function handleGenerateWorkOrder(scheduleId: number) {
    setGeneratingWorkOrderId(scheduleId);
    setWorkOrderError(null);
    try {
      const res = await generateAmcScheduleWorkOrder(entityId, scheduleId);
      setItems((prev) =>
        prev.map((i) =>
          i.schedule_id === scheduleId
            ? { ...i, work_order_id: res.work_order_id, work_order_status: res.work_order_status }
            : i,
        ),
      );
    } catch (err) {
      setWorkOrderError(err instanceof ApiError ? err.message : "Could not generate a work order for this item");
    } finally {
      setGeneratingWorkOrderId(null);
    }
  }

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
          </a>{" "}
          <CopyLinkButton url={shareUrl} />
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

          {workOrderError && <p className="projects-status error">{workOrderError}</p>}

          <div className="projects-table-wrap">
            <p className="projects-section-label">
              Next due{nextDue.length > 0 ? ` — ${new Date(nextDue[0].schedule_date).toLocaleDateString()}` : ""}
            </p>
            {nextDue.length === 0 ? (
              <p>Nothing pending — every occurrence has been completed.</p>
            ) : (
              <table className="projects-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Frequency</th>
                    <th>Work order</th>
                  </tr>
                </thead>
                <tbody>
                  {nextDue.map((item) => (
                    <tr key={item.schedule_id}>
                      <td data-label="Item">{item.inclusion_text}</td>
                      <td data-label="Frequency">{amcFrequencyLabel(item.frequency)}</td>
                      <td data-label="Work order">
                        {item.work_order_id ? (
                          <Link to={`/app/work-orders/${item.work_order_id}`}>
                            View / assign work order → ({item.work_order_status})
                          </Link>
                        ) : (
                          <button
                            className="projects-btn primary"
                            disabled={generatingWorkOrderId === item.schedule_id}
                            onClick={() => handleGenerateWorkOrder(item.schedule_id)}
                          >
                            {generatingWorkOrderId === item.schedule_id ? "Generating…" : "Generate work order"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="projects-table-wrap">
            <p className="projects-section-label">Full schedule</p>
            <table className="projects-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Frequency</th>
                  <th>Status</th>
                  <th>Work order</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.schedule_id}>
                    <td data-label="Date">{new Date(item.schedule_date).toLocaleDateString()}</td>
                    <td data-label="Item">{item.inclusion_text}</td>
                    <td data-label="Frequency">{amcFrequencyLabel(item.frequency)}</td>
                    <td data-label="Status">
                      <span
                        className={item.status === "COMPLETED" ? "project-status-badge completed" : "project-status-badge"}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td data-label="Work order">
                      {item.work_order_id ? (
                        <Link to={`/app/work-orders/${item.work_order_id}`}>{item.work_order_status}</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-label="Action">
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
