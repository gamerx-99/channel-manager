/**
 * Converts an ISO 8601 date string (YYYY-MM-DD) to Thai Immigration TM.30 format (DD/MM/YYYY).
 * Example: "2026-08-19" -> "19/08/2026"
 */
export function formatIsoToDisplayDate(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const cleaned = isoString.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleaned);
  if (!match) return cleaned;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/**
 * Converts a TM.30 display date string (DD/MM/YYYY) to ISO 8601 format (YYYY-MM-DD) for Supabase.
 * Example: "19/08/2026" -> "2026-08-19"
 */
export function parseDisplayDateToIso(displayString: string | null | undefined): string {
  if (!displayString) return '';
  const cleaned = displayString.trim();
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cleaned);
  if (!match) {
    throw new Error(`Invalid date format "${displayString}". Expected DD/MM/YYYY with a 4-digit A.D. year.`);
  }
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const year = match[3];

  const d = Number(day);
  const m = Number(month);
  const y = Number(year);

  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) {
    throw new Error(`Date values out of valid range: "${displayString}".`);
  }

  return `${year}-${month}-${day}`;
}
