import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { generateAmcScheduleWorkOrder, type AmcScheduleItem } from "../../api/amcSchedule";
import { amcFrequencyLabel } from "../../api/amcPlans";
import { assignWorkOrder } from "../../api/workOrders";
import { listEntityUsers, type EntityUser } from "../../api/entityUsers";
import { listTeams, type TeamListItem } from "../../api/teams";
import { ApiError } from "../../api/client";
import { useAuth } from "../../lib/AuthContext";
import { canManageAmc } from "../../lib/roles";
import { BUCKET_CLASS, BUCKET_LABEL, NEXT_DUE_CLASS, NEXT_DUE_LABEL, type DueBucket } from "../../lib/amcDue";
import "./ProjectsPage.css";

export type AmcActionRow = {
  item: AmcScheduleItem;
  /** Color bucket for display, or null when the item is only shown because
   * it's the project's next-pending (actionable) occurrence. */
  bucket: DueBucket | null;
  /** Whether a work order can be created for this item right now -- i.e.
   * it's (one of) the earliest-due PENDING occurrence(s) for its project.
   * Rows outside that group would 409 from the backend, so the create
   * action is disabled rather than left to fail. */
  actionable: boolean;
  projectId: number;
  /** When set, a "Project" column with a link is rendered -- used on the
   * cross-project Projects list page. Omitted on the single-project AMC tab. */
  customerName?: string;
};

/**
 * Renders the "Action needed" AMC table: due-date badge, create-work-order
 * action, and an inline expanding assign panel (assignee type + user/team
 * select + Assign) so an admin can create and assign a work order without
 * leaving the page. Shared between the per-project AMC tab
 * (`ProjectAmcTab`) and the cross-project view on the Projects list page.
 */
export default function AmcActionTable({
  entityId,
  rows,
  emptyMessage,
  onItemChanged,
}: {
  entityId: number;
  rows: AmcActionRow[];
  emptyMessage: string;
  onItemChanged: (scheduleId: number, patch: Partial<AmcScheduleItem>) => void;
}) {
  const { user } = useAuth();
  // Backend restricts creating/assigning AMC work orders to entity
  // admins/ENTITY_SERVICE_MANAGER (see require_amc_manager /
  // is_amc_manager). Mirror that here so other roles see a plain view
  // rather than a button that always 403s.
  const canManage = canManageAmc(user?.roles ?? []);

  const [creatingWorkOrderId, setCreatingWorkOrderId] = useState<number | null>(null);
  const [workOrderError, setWorkOrderError] = useState<string | null>(null);

  const [expandedScheduleId, setExpandedScheduleId] = useState<number | null>(null);
  const [users, setUsers] = useState<EntityUser[]>([]);
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [assigneeType, setAssigneeType] = useState<"USER" | "TEAM">("USER");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    listEntityUsers(entityId)
      .then((res) => setUsers(res.items))
      .catch(() => {});
    listTeams(entityId, { active: true })
      .then((res) => setTeams(res.items))
      .catch(() => {});
  }, [entityId]);

  // Opens the inline assign panel for both first-time assignment and
  // reassignment -- when a current assignee exists it prefills the panel so
  // reassigning is a one-field change rather than a blank form.
  function openAssignPanel(scheduleId: number, current: AmcScheduleItem["assignee"]) {
    setExpandedScheduleId((prev) => (prev === scheduleId ? null : scheduleId));
    setAssigneeType(current?.assignee_type ?? "USER");
    setSelectedAssigneeId(current ? String(current.assignee_id) : "");
    setAssignError(null);
  }

  async function handleCreateWorkOrder(scheduleId: number) {
    setCreatingWorkOrderId(scheduleId);
    setWorkOrderError(null);
    try {
      const res = await generateAmcScheduleWorkOrder(entityId, scheduleId);
      onItemChanged(scheduleId, { work_order_id: res.work_order_id, work_order_status: res.work_order_status });
      openAssignPanel(scheduleId, null);
    } catch (err) {
      setWorkOrderError(err instanceof ApiError ? err.message : "Could not create a work order for this item");
    } finally {
      setCreatingWorkOrderId(null);
    }
  }

  async function handleAssign(scheduleId: number, workOrderId: number) {
    if (!selectedAssigneeId) return;
    setAssigning(true);
    setAssignError(null);
    try {
      const res = await assignWorkOrder(entityId, workOrderId, assigneeType, Number(selectedAssigneeId));
      const matchedUser = assigneeType === "USER" ? users.find((u) => u.user_id === res.assignee_id) : undefined;
      const name = assigneeType === "USER" ? matchedUser?.full_name ?? "" : teams.find((t) => t.team_id === res.assignee_id)?.name ?? "";
      // Feed the persisted assignment back into the shared item state (not
      // just local component state) so it survives this row re-rendering and
      // is what "Reassign" prefills from next time -- this is the piece that
      // makes reassignment durable rather than a one-shot local flag.
      onItemChanged(scheduleId, {
        assignee: {
          assignee_type: assigneeType,
          assignee_id: Number(selectedAssigneeId),
          name,
          email: matchedUser?.email ?? null,
          phone: matchedUser?.phone ?? null,
        },
      });
      setExpandedScheduleId(null);
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : "Could not assign this work order");
    } finally {
      setAssigning(false);
    }
  }

  const showProjectColumn = rows.some((r) => r.customerName !== undefined);

  return (
    <div className="projects-table-wrap">
      {workOrderError && (
        <p className="projects-status error" style={{ margin: "16px 16px 0" }}>
          {workOrderError}
        </p>
      )}
      {rows.length === 0 ? (
        <p style={{ padding: 16, margin: 0 }}>{emptyMessage}</p>
      ) : (
        <table className="projects-table">
          <thead>
            <tr>
              {showProjectColumn && <th>Project</th>}
              <th>Due</th>
              <th>Item</th>
              <th>Frequency</th>
              <th>Work order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, bucket, actionable, projectId, customerName }) => (
              <Fragment key={item.schedule_id}>
                <tr>
                  {showProjectColumn && (
                    <td data-label="Project">
                      <Link to={`/app/projects/${projectId}`}>{customerName}</Link>
                    </td>
                  )}
                  <td data-label="Due">
                    <span className={bucket ? BUCKET_CLASS[bucket] : NEXT_DUE_CLASS}>
                      {bucket ? BUCKET_LABEL[bucket] : NEXT_DUE_LABEL}
                    </span>{" "}
                    {new Date(item.schedule_date).toLocaleDateString()}
                  </td>
                  <td data-label="Item">{item.inclusion_text}</td>
                  <td data-label="Frequency">{amcFrequencyLabel(item.frequency)}</td>
                  <td data-label="Work order">
                    {item.work_order_id ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <Link to={`/app/work-orders/${item.work_order_id}`}>
                          View work order → ({item.work_order_status})
                        </Link>
                        {item.assignee && (
                          <span className="projects-status success" style={{ margin: 0 }}>
                            Assigned to {item.assignee.name}
                          </span>
                        )}
                        {canManage && (
                          <button className="projects-btn" onClick={() => openAssignPanel(item.schedule_id, item.assignee)}>
                            {expandedScheduleId === item.schedule_id ? "Cancel" : item.assignee ? "Reassign" : "Assign"}
                          </button>
                        )}
                      </div>
                    ) : actionable && canManage ? (
                      <button
                        className="projects-btn primary"
                        disabled={creatingWorkOrderId === item.schedule_id}
                        onClick={() => handleCreateWorkOrder(item.schedule_id)}
                      >
                        {creatingWorkOrderId === item.schedule_id ? "Creating…" : "Create work order"}
                      </button>
                    ) : actionable ? (
                      <span className="work-order-type-hint" title="Only entity admins or AMC service managers can create AMC work orders">
                        Awaiting assignment by an admin
                      </span>
                    ) : (
                      <span className="work-order-type-hint" title="An earlier pending AMC occurrence for this project must be completed first">
                        Waiting on an earlier occurrence
                      </span>
                    )}
                  </td>
                </tr>
                {expandedScheduleId === item.schedule_id && item.work_order_id && (
                  <tr>
                    <td colSpan={showProjectColumn ? 5 : 4}>
                      <div className="projects-filters" style={{ margin: 0 }}>
                        <select value={assigneeType} onChange={(e) => setAssigneeType(e.target.value as "USER" | "TEAM")}>
                          <option value="USER">Individual</option>
                          <option value="TEAM">Team</option>
                        </select>
                        {assigneeType === "USER" ? (
                          <select value={selectedAssigneeId} onChange={(e) => setSelectedAssigneeId(e.target.value)}>
                            <option value="">Select a user…</option>
                            {users.map((u) => (
                              <option key={u.user_id} value={u.user_id}>
                                {u.full_name} ({u.email})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select value={selectedAssigneeId} onChange={(e) => setSelectedAssigneeId(e.target.value)}>
                            <option value="">Select a team…</option>
                            {teams.map((t) => (
                              <option key={t.team_id} value={t.team_id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          className="projects-btn primary"
                          disabled={!selectedAssigneeId || assigning}
                          onClick={() => handleAssign(item.schedule_id, item.work_order_id!)}
                        >
                          {assigning ? "Assigning…" : item.assignee ? "Reassign" : "Assign"}
                        </button>
                        <button className="projects-btn" onClick={() => setExpandedScheduleId(null)}>
                          Cancel
                        </button>
                      </div>
                      {assignError && <p className="projects-status error">{assignError}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
