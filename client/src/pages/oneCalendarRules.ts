export function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getMonthDates(anchor: Date): string[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, index) => toLocalIsoDate(new Date(year, month, index + 1)));
}

export function selectCalendarDate(start: string | null, end: string | null, date: string): [string, string | null] {
  if (!start || end) return [date, null];
  return date < start ? [date, start] : [start, date];
}

export function isDateSelected(date: string, start: string | null, end: string | null): boolean {
  if (!start) return false;
  return date === start || (end !== null && date >= start && date <= end);
}

export function formatBuddhistDate(iso: string, locale = "th-TH"): string {
  const dateLocale = locale.includes("-u-") ? locale : `${locale}-u-ca-buddhist`;
  return new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${iso}T12:00:00`));
}
