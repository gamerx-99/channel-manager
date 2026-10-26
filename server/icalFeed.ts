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
// date-times in a feed are converted to that local date. DTSTART and DTEND are
// converted independently; DTEND remains the exclusive checkout date. Floating
// times keep their written date.
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

type ContentLine = { name: string; value: string; parameters: Record<string, string> };

function parseContentLine(line: string): ContentLine | null {
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') inQuotes = !inQuotes;
    if (character === ':' && !inQuotes) {
      const [rawName, ...rawParameters] = line.slice(0, index).split(';');
      const name = rawName.trim().toUpperCase();
      const parameters: Record<string, string> = {};
      for (const parameter of rawParameters) {
        const separator = parameter.indexOf('=');
        if (separator <= 0) continue;
        const key = parameter.slice(0, separator).trim().toUpperCase();
        parameters[key] = parameter.slice(separator + 1).trim().replace(/^"|"$/g, '');
      }
      return name ? { name, value: line.slice(index + 1), parameters } : null;
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
      if (line.parameters.TZID) current.set(`${line.name}_TZID`, line.parameters.TZID);
    }
  }

  return events;
}

function parseZonedDate(value: string, timeZone: string | undefined): string | null {
  if (!timeZone || !/^\d{8}T\d{6}$/.test(value)) return parseIcalDate(value);
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const wallClockAsUtc = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  const written = new Date(wallClockAsUtc);
  if (written.getUTCFullYear() !== +year || written.getUTCMonth() !== +month - 1 || written.getUTCDate() !== +day
    || written.getUTCHours() !== +hour || written.getUTCMinutes() !== +minute || written.getUTCSeconds() !== +second) return null;
  try {
    const sourceFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    let instantMs = wallClockAsUtc;
    // Resolve the source zone's offset by comparing its formatted wall clock with
    // the requested local wall clock. Repeating handles DST offset boundaries.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = sourceFormatter.formatToParts(new Date(instantMs));
      const part = (type: string) => parts.find(item => item.type === type)?.value;
      const formattedWallClock = Date.UTC(
        Number(part('year')), Number(part('month')) - 1, Number(part('day')),
        Number(part('hour')), Number(part('minute')), Number(part('second')),
      );
      const adjustment = wallClockAsUtc - formattedWallClock;
      instantMs += adjustment;
      if (adjustment === 0) break;
    }
    const hotelParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(instantMs));
    const part = (type: string) => hotelParts.find(item => item.type === type)?.value;
    const result = `${part('year')}-${part('month')}-${part('day')}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null;
  } catch {
    return null;
  }
}

function toIcalEvent(properties: Map<string, string>): IcalEvent | null {
  if (properties.get('STATUS')?.trim().toUpperCase() === 'CANCELLED') return null;

  const start = parseZonedDate(properties.get('DTSTART') ?? '', properties.get('DTSTART_TZID'));
  if (!start) return null;
  const parsedEnd = parseZonedDate(properties.get('DTEND') ?? '', properties.get('DTEND_TZID'));
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
    'PRODID:-//hayhost//OTA iCal Export//EN',
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
