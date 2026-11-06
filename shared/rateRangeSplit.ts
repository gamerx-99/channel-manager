// Pure helper: split existing rate-override ranges around a new range.
// Example: existing 1-31, new 10-12 -> 1-9, 10-12, 13-31.

export interface DateRange { start: string; end: string; }

export function splitRateRanges(existing: DateRange[], next: DateRange): DateRange[] {
  const result: DateRange[] = [];
  for (const r of existing) {
    if (r.end < next.start || r.start > next.end) {
      result.push({ ...r });
      continue;
    }
    // overlap: split left
    if (r.start < next.start) result.push({ start: r.start, end: prevDay(next.start) });
    // split right
    if (r.end > next.end) result.push({ start: nextDay(next.end), end: r.end });
  }
  // insert new range
  result.push({ ...next });
  // sort by start
  result.sort((a, b) => a.start.localeCompare(b.start));
  // merge adjacent? keep as is
  return result.filter(r => r.start <= r.end);
}

function prevDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Aliases
export const splitRateOverride = splitRateRanges;
export const splitRateOverrideRange = splitRateRanges;
export const applyRateOverride = splitRateRanges;
export const splitOverlappingRanges = splitRateRanges;
export const splitRateRange = splitRateRanges;
