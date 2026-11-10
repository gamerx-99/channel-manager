export type ShiftHoursInput = { start_time: string; end_time: string; break_minutes: number };

function minutesOf(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error("Invalid shift time");
  return Number(match[1]) * 60 + Number(match[2]);
}

export function shiftMinutes(shift: ShiftHoursInput) {
  if (!Number.isInteger(shift.break_minutes) || shift.break_minutes < 0) throw new Error("Invalid break minutes");
  let end = minutesOf(shift.end_time);
  const start = minutesOf(shift.start_time);
  if (end < start) end += 24 * 60;
  return Math.max(0, end - start - shift.break_minutes);
}

export function shiftHours(shift: ShiftHoursInput) {
  return shiftMinutes(shift) / 60;
}

export function monthShiftHours(shifts: readonly ShiftHoursInput[]) {
  return shifts.reduce((total, shift) => total + shiftMinutes(shift), 0) / 60;
}

export function shiftEndDate(date: string, startTime: string, endTime: string) {
  if (minutesOf(endTime) >= minutesOf(startTime)) return date;
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
