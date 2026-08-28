import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listAmcSchedule,
  generateAmcSchedule,
  updateAmcScheduleItemStatus,
  shareAmcSchedule,
  type AmcScheduleItem,
} from "../../api/amcSchedule";
import { amcFrequencyLabel } from "../../api/amcPlans";
import { ApiError } from "../../api/client";
import CopyLinkButton from "../../components/CopyLinkButton";
import AmcActionTable, { type AmcActionRow } from "./AmcActionTable";
import { BUCKET_CLASS, BUCKET_LABEL, dueBucket, nextPendingScheduleIds, startOfDay } from "../../lib/amcDue";
import "./ProjectsPage.css";

export default function ProjectAmcTab({ entityId, projectId }: { entityId: number; projectId: number }) {
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
    listAmcSchedule(entityId, projectId)
      .then((res) => setItems(res.items))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load AMC schedule"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityId, projectId]);

  // Frozen once per mount -- avoids buckets silently shifting mid-session
  // if the tab is left open across midnight.
  const [today] = useState(() => startOfDay(new Date()));

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

  // "Action needed" rows -- every PENDING item due now-through-next-week
  // (red/yellow/green), PLUS this project's actual next-pending occurrence
  // even if it falls further out (e.g. a quarterly/half-yearly item with no
  // sooner occurrence pending) so it's never hidden just for being outside
  // the color window -- it's still the one occurrence the backend will let
  // an admin create a work order for right now.
  const actionRows = useMemo<AmcActionRow[]>(() => {
    const actionableIds = nextPendingScheduleIds(items);
    const rows = items
      .filter((i) => i.status === "PENDING")
      .map((item) => ({ item, bucket: dueBucket(item.schedule_date, today) }))
      .filter((x) => x.bucket !== null || actionableIds.has(x.item.schedule_id));
    return rows
      .sort((a, b) => a.item.schedule_date.localeCompare(b.item.schedule_date))
      .map(({ item, bucket }) => ({
        item,
        bucket,
        actionable: actionableIds.has(item.schedule_id),
        projectId,
      }));
  }, [items, today, projectId]);

  function handleItemChanged(scheduleId: number, patch: Partial<AmcScheduleItem>) {
    setItems((prev) => prev.map((i) => (i.schedule_id === scheduleId ? { ...i, ...patch } : i)));
  }

  async function handleGenerate(regenerate: boolean) {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await generateAmcSchedule(entityId, projectId, regenerate ? { regenerate: true } : {});
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
      const res = await shareAmcSchedule(entityId, projectId);
      setShareUrl(res.share_url);
    } catch (err) {
      setShareError(err instanceof ApiError ? err.message : "Could not create a share link");
    } finally {
      setSharing(false);
    }
  }

  if (loading) return <div className="projects-loading">Loading…</div>;

  return (
    <div>
      <div className="project-detail-actions" style={{ marginBottom: 16 }}>
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
          {summary.length > 0 && <p className="projects-section-label">{summary.join(" · ")}</p>}

          <p className="projects-section-label">Action needed</p>
          <AmcActionTable
            entityId={entityId}
            rows={actionRows}
            emptyMessage="Nothing overdue, due soon, or otherwise pending action."
            onItemChanged={handleItemChanged}
          />

          <div className="projects-table-wrap" style={{ marginTop: 16 }}>
            <p className="projects-section-label" style={{ margin: "16px 16px 0" }}>
              Full schedule
            </p>
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
                {items.map((item) => {
                  const bucket = item.status === "PENDING" ? dueBucket(item.schedule_date, today) : null;
                  return (
                    <tr key={item.schedule_id}>
                      <td data-label="Date">
                        {bucket && <span className={BUCKET_CLASS[bucket]}>{BUCKET_LABEL[bucket]}</span>}{" "}
                        {new Date(item.schedule_date).toLocaleDateString()}
                      </td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
