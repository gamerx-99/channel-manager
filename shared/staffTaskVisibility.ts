export type VisibilityTask = { task_date: string; status: "pending" | "done" };
export type VisibilityShift = { start_time: string };
export type StaffTaskWaitingState = { waiting_for_shift_start: boolean; shift_start: string | null };

function thaiWallClock(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function isStaffTaskVisibleToAssignee(task: VisibilityTask, shifts: readonly VisibilityShift[], now: Date, isManager = false): boolean {
  if (isManager) return true;
  const today = thaiWallClock(now);
  const todayDate = `${today.year}-${today.month}-${today.day}`;
  if (task.task_date > todayDate) return false;
  // ASSUMPTION: an undone task from an earlier Thai calendar date remains visible until done.
  if (task.task_date < todayDate) return task.status === "pending";
  if (!shifts.length) return true;
  const earliest = shifts.map(shift => shift.start_time).sort()[0];
  return `${today.hour}:${today.minute}` >= earliest;
}

export function getStaffTaskWaitingState(shifts: readonly VisibilityShift[], now: Date): StaffTaskWaitingState {
  const today = thaiWallClock(now);
  const shiftStart = shifts.map(shift => shift.start_time).sort()[0] ?? null;
  return {
    waiting_for_shift_start: shiftStart !== null && `${today.hour}:${today.minute}` < shiftStart,
    shift_start: shiftStart,
  };
}
