export interface RateRange {
  id: string;
  start_date: string;
  end_date: string;
  override_price: string;
  min_stay_nights: number | null;
}

export interface NewRateRange {
  start_date: string;
  end_date: string;
  override_price?: string;
  min_stay_nights?: number | null;
  base?: boolean;
}

export interface SplitResult {
  deleteIds: string[];
  create: NewRateRange[];
}

// Pure helper: split existing rate-override ranges around a new range.
// Returns ids to delete and rows to create, all non-overlapping.
export function splitRateRanges(
  existing: RateRange[],
  next: NewRateRange | NewRateRange[] | null,
): SplitResult {
  const deleteIds: string[] = [];
  const create: NewRateRange[] = [];
  if (next === null || (Array.isArray(next) && next.length === 0)) {
    return { deleteIds: [], create: [] };
  }

  const replacements = Array.isArray(next) ? next : [next];
  const selectionStart = replacements[0]!.start_date;
  const selectionEnd = replacements[replacements.length - 1]!.end_date;
  const baseMode = !Array.isArray(next) && (next.base === true || next.override_price === undefined);

  for (const r of existing) {
    if (r.end_date < selectionStart || r.start_date > selectionEnd) {
      continue;
    }
    deleteIds.push(r.id);
    if (r.start_date < selectionStart) {
      const end = prevDay(selectionStart);
      if (r.start_date <= end) {
        create.push({ start_date: r.start_date, end_date: end, override_price: r.override_price, min_stay_nights: r.min_stay_nights });
      }
    }
    if (r.end_date > selectionEnd) {
      const start = nextDay(selectionEnd);
      if (start <= r.end_date) {
        create.push({ start_date: start, end_date: r.end_date, override_price: r.override_price, min_stay_nights: r.min_stay_nights });
      }
    }
  }

  if (!baseMode) {
    for (const replacement of replacements) {
      if (replacement.override_price === undefined) continue;
      create.push({ start_date: replacement.start_date, end_date: replacement.end_date, override_price: replacement.override_price, min_stay_nights: replacement.min_stay_nights ?? null });
    }
  }

  // sort by start
  create.sort((a, b) => a.start_date.localeCompare(b.start_date));
  return { deleteIds, create };
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
