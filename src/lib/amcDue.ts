import type { AmcScheduleItem } from "../api/amcSchedule";

export type DueBucket = "overdue" | "this-week" | "next-week";

export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Monday-start week. Buckets a PENDING item's schedule_date for AMC due-date
// coloring: anything already past today is "overdue" (red, unaddressed),
// the rest of this calendar week is "this-week" (yellow), and the following
// calendar week is "next-week" (green). Anything further out gets no
// bucket (null) -- it's still shown as the project's "next due" item if it
// happens to be the earliest pending occurrence, just without a color.
export function dueBucket(scheduleDate: string, today: Date): DueBucket | null {
  const d = startOfDay(new Date(scheduleDate));
  const dow = (today.getDay() + 6) % 7; // 0=Mon..6=Sun
  const endOfThisWeek = addDays(today, 6 - dow);
  const endOfNextWeek = addDays(endOfThisWeek, 7);
  if (d < today) return "overdue";
  if (d <= endOfThisWeek) return "this-week";
  if (d <= endOfNextWeek) return "next-week";
  return null;
}

export const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Overdue",
  "this-week": "Due this week",
  "next-week": "Due next week",
};

export const BUCKET_CLASS: Record<DueBucket, string> = {
  overdue: "amc-due-badge red",
  "this-week": "amc-due-badge yellow",
  "next-week": "amc-due-badge green",
};

export const NEXT_DUE_LABEL = "Next due";
export const NEXT_DUE_CLASS = "amc-due-badge neutral";

// Mirrors the backend's AMCScheduleRepository.get_next_pending_group exactly
// (see app/repositories/amc_repository.py): among a single project's still-
// PENDING occurrences, only the one(s) sharing the earliest schedule_date
// are currently eligible for work-order creation -- regardless of how far
// out that date is (a project whose only pending items are quarterly/
// half-yearly can still have its next occurrence actioned months ahead).
// `items` must already be scoped to one project.
export function nextPendingScheduleIds(items: AmcScheduleItem[]): Set<number> {
  const pending = items.filter((i) => i.status === "PENDING");
  if (pending.length === 0) return new Set();
  const nextDate = pending.reduce((min, i) => (i.schedule_date < min ? i.schedule_date : min), pending[0].schedule_date);
  return new Set(pending.filter((i) => i.schedule_date === nextDate).map((i) => i.schedule_id));
}
