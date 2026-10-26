/**
 * Pure iCalendar (RFC 5545) helpers for OTA calendar sync: parse an OTA feed into
 * date ranges, and build the .ics feed we export back to OTAs. No I/O here.
 */

export type IcalEvent = {
  uid: string;
  /** First night, YYYY-MM-DD. */
  start: string;
  /** Check-out date (exclusive), YYYY-MM-DD. */
  end: string;
  summary: string;
};

export type IcalExportEvent = { uid: string; start: string; end: string };

// ASSUMPTION: hotels operate on Asia/Bangkok time (the UI's display zone), so UTC
// date-times in a feed are converted to that local date. Floating/TZID times keep
// their written date.
const HOTEL_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseIcalDate(value: string): string | null {
  const match = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, utc] = match;

  // Reject impossible calendar dates such as 20261340 (Date.UTC would silently roll them over).
  const written = new Date(Date.UTC(+year, +month - 1, +day));
  if (written.getUTCFullYear() !== +year || written.getUTCMonth() !== +month - 1 || written.getUTCDate() !== +day) {
    return null;
  }

  return hour && utc
    ? new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second) + HOTEL_UTC_OFFSET_MS).toISOString().slice(0, 10)
    : `${year}-${month}-${day}`;
}

function unescapeText(value: string): string {
  return value
    .replace(/\\[nN]/g, ' ')
    .replace(/\\([,;\\])/g, '$1')
    .trim();
}

type ContentLine = { name: string; value: string };

function parseContentLine(line: string): ContentLine | null {
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') inQuotes = !inQuotes;
    if (character === ':' && !inQuotes) {
      const name = line.slice(0, index).split(';')[0].trim().toUpperCase();
      return name ? { name, value: line.slice(index + 1) } : null;
    }
  }
  return null;
}

/**
 * Parses VEVENTs into night ranges. Cancelled events are dropped; a missing or
 * non-positive DTEND becomes a one-night stay. Nested components (VALARM) are ignored.
 */
export function parseIcalEvents(feed: string): IcalEvent[] {
  const lines = feed.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events: IcalEvent[] = [];
  let current: Map<string, string> | null = null;
  let nestedDepth = 0;

  for (const rawLine of lines) {
    const line = parseContentLine(rawLine);
    if (!line) continue;
    const value = line.value.trim().toUpperCase();

    if (line.name === 'BEGIN') {
      if (current) nestedDepth += 1;
      else if (value === 'VEVENT') current = new Map();
      continue;
    }
    if (line.name === 'END') {
      if (!current) continue;
      if (nestedDepth > 0) {
        nestedDepth -= 1;
        continue;
      }
      if (value === 'VEVENT') {
        const event = toIcalEvent(current);
        if (event) events.push(event);
        current = null;
      }
      continue;
    }
    if (current && nestedDepth === 0 && !current.has(line.name)) {
      current.set(line.name, line.value);
    }
  }

  return events;
}

function toIcalEvent(properties: Map<string, string>): IcalEvent | null {
  if (properties.get('STATUS')?.trim().toUpperCase() === 'CANCELLED') return null;

  const start = parseIcalDate(properties.get('DTSTART') ?? '');
  if (!start) return null;
  const parsedEnd = parseIcalDate(properties.get('DTEND') ?? '');
  const end = parsedEnd && parsedEnd > start ? parsedEnd : addDays(start, 1);
  const summary = unescapeText(properties.get('SUMMARY') ?? '');
  const uid = properties.get('UID')?.trim() || `nouid-${start}-${end}`;

  return { uid, start, end, summary };
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line to at most 75 octets per physical line (RFC 5545 §3.1). */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function formatIcalDate(isoDate: string): string {
  return isoDate.slice(0, 10).replace(/-/g, '');
}

function formatIcalTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Builds the export feed. Every event is an opaque "Not available" block: no guest data. */
export function buildIcalExport(input: { calendarName: string; events: IcalExportEvent[]; now?: Date }): string {
  const stamp = formatIcalTimestamp(input.now ?? new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Channel Manager//OTA iCal Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(input.calendarName)}`,
    ...input.events.flatMap((event) => [
      'BEGIN:VEVENT',
      `UID:${event.uid}@channel-manager`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${formatIcalDate(event.start)}`,
      `DTEND;VALUE=DATE:${formatIcalDate(event.end)}`,
      'SUMMARY:Not available',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
