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
  // ASSUMPTION: the second click is check-out, except clicking the first date again edits that one night.
  if (!start || end) return [date, null];
  return date < start ? [date, start] : [start, date];
}

export function getCalendarNightSelection(start: string | null, checkout: string | null) {
  if (!start) return { nights: [], lastNight: null, nightCount: 0 };
  const lastNight = checkout && checkout > start
    ? new Date(Date.parse(`${checkout}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    : start;
  const nights: string[] = [];
  for (let day = start; day <= lastNight; day = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
    nights.push(day);
  }
  return { nights, lastNight, nightCount: nights.length };
}

export function isDateSelected(date: string, start: string | null, end: string | null): boolean {
  if (!start) return false;
  return date >= start && date <= (end && end > start
    ? new Date(Date.parse(`${end}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    : start);
}

export function isCheckoutDate(date: string, start: string | null, checkout: string | null): boolean {
  return Boolean(start && checkout && checkout > start && date === checkout);
}

export function formatBuddhistDate(iso: string, locale = "th-TH"): string {
  const dateLocale = locale.includes("-u-") ? locale : `${locale}-u-ca-buddhist`;
  return new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${iso}T12:00:00`));
}
