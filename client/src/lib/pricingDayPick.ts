export type PickedRange = { start_date: string; end_date: string };

/**
 * Clicking days on the pricing calendar: the first click sets the start date,
 * the second sets the end date (the same day twice means one night), and a
 * click before the start or after a full range starts over.
 */
export function nextPickedRange(current: PickedRange, isoDay: string): PickedRange {
  if (!current.start_date || current.end_date || isoDay < current.start_date) {
    return { start_date: isoDay, end_date: "" };
  }
  return { start_date: current.start_date, end_date: isoDay };
}

export function isDayInPickedRange(range: PickedRange, isoDay: string): boolean {
  if (!range.start_date) return false;
  const end = range.end_date || range.start_date;
  return isoDay >= range.start_date && isoDay <= end;
}
