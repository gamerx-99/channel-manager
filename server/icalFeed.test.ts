import { describe, expect, it } from 'vitest';
import { buildIcalExport, parseIcalEvents } from './icalFeed';

const calendar = (...lines: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n');

describe('parseIcalEvents', () => {
  it('reads a Booking.com style all-day block', () => {
    const feed = calendar(
      'BEGIN:VEVENT',
      'DTSTAMP:20261026T010000Z',
      'DTSTART;VALUE=DATE:20261029',
      'DTEND;VALUE=DATE:20261030',
      'UID:6d1b0b4c3e@booking.com',
      'SUMMARY:CLOSED - Not available',
      'END:VEVENT',
    );

    expect(parseIcalEvents(feed)).toEqual([
      { uid: '6d1b0b4c3e@booking.com', start: '2026-10-29', end: '2026-10-30', summary: 'CLOSED - Not available' },
    ]);
  });

  it('reads an Airbnb style feed with LF endings, folded lines and escaped text', () => {
    const feed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261101',
      'DTEND;VALUE=DATE:20261104',
      'UID:1418fb94e984-abc@air',
      ' bnb.com',
      'SUMMARY:Reserved\\, thank you',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');

    expect(parseIcalEvents(feed)).toEqual([
      { uid: '1418fb94e984-abc@airbnb.com', start: '2026-11-01', end: '2026-11-04', summary: 'Reserved, thank you' },
    ]);
  });

  it('converts UTC date-times to the hotel (Asia/Bangkok) date', () => {
    const [event] = parseIcalEvents(calendar(
      'BEGIN:VEVENT',
      'UID:utc',
      'DTSTART:20261028T180000Z', // 01:00 on the 29th in Bangkok
      'DTEND:20261030T040000Z',
      'END:VEVENT',
    ));

    expect(event).toMatchObject({ start: '2026-10-29', end: '2026-10-30' });
  });

  it('keeps the written date for TZID and floating times', () => {
    const [event] = parseIcalEvents(calendar(
      'BEGIN:VEVENT',
      'UID:tz',
      'DTSTART;TZID="Asia/Bangkok":20261029T140000',
      'DTEND;TZID="Asia/Bangkok":20261031T120000',
      'END:VEVENT',
    ));

    expect(event).toMatchObject({ start: '2026-10-29', end: '2026-10-31' });
  });

  it('turns a missing or non-positive DTEND into one night', () => {
    const events = parseIcalEvents(calendar(
      'BEGIN:VEVENT', 'UID:no-end', 'DTSTART;VALUE=DATE:20261231', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:same-day', 'DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261105', 'END:VEVENT',
    ));

    expect(events.map(event => [event.start, event.end])).toEqual([['2026-12-31', '2027-01-01'], ['2026-11-05', '2026-11-06']]);
  });

  it('drops cancelled events, invalid dates, and ignores properties of nested alarms', () => {
    const events = parseIcalEvents(calendar(
      'BEGIN:VEVENT', 'UID:cancelled', 'STATUS:CANCELLED', 'DTSTART;VALUE=DATE:20261110', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:bad-date', 'DTSTART;VALUE=DATE:20261340', 'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:with-alarm',
      'DTSTART;VALUE=DATE:20261120',
      'DTEND;VALUE=DATE:20261122',
      'BEGIN:VALARM',
      'SUMMARY:alarm text',
      'DTSTART:20261119T000000Z',
      'END:VALARM',
      'SUMMARY:Blocked',
      'END:VEVENT',
    ));

    expect(events).toEqual([{ uid: 'with-alarm', start: '2026-11-20', end: '2026-11-22', summary: 'Blocked' }]);
  });

  it('derives a stable UID when the feed omits one', () => {
    const feed = calendar('BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261203', 'END:VEVENT');

    expect(parseIcalEvents(feed)[0].uid).toBe('nouid-2026-12-01-2026-12-03');
    expect(parseIcalEvents(feed)[0].uid).toBe(parseIcalEvents(feed)[0].uid);
  });
});

describe('buildIcalExport', () => {
  const now = new Date('2026-10-26T05:06:07.000Z');

  it('builds a CRLF calendar of opaque all-day blocks with no guest data', () => {
    const ics = buildIcalExport({
      calendarName: 'Seaside Inn · 101',
      events: [{ uid: 'b6f9', start: '2026-10-29', end: '2026-10-30' }],
      now,
    });

    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.split('\r\n')).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Channel Manager//OTA iCal Export//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Seaside Inn · 101',
      'BEGIN:VEVENT',
      'UID:b6f9@channel-manager',
      'DTSTAMP:20261026T050607Z',
      'DTSTART;VALUE=DATE:20261029',
      'DTEND;VALUE=DATE:20261030',
      'SUMMARY:Not available',
      'TRANSP:OPAQUE',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ]);
  });

  it('escapes text and folds long lines to 75 octets without splitting characters', () => {
    const ics = buildIcalExport({ calendarName: `โรงแรม, ทะเล; ${'ห้อง'.repeat(30)}`, events: [], now });
    const encoder = new TextEncoder();

    expect(ics).toContain('X-WR-CALNAME:โรงแรม\\, ทะเล\\; ');
    for (const physicalLine of ics.split('\r\n')) {
      expect(encoder.encode(physicalLine).length).toBeLessThanOrEqual(75);
    }
    // Unfolding restores the original content line.
    expect(ics.replace(/\r\n /g, '')).toContain(`ห้อง`.repeat(30));
  });

  it('round-trips through the parser', () => {
    const ics = buildIcalExport({ calendarName: 'Hotel', events: [{ uid: 'x1', start: '2026-11-02', end: '2026-11-05' }], now });

    expect(parseIcalEvents(ics)).toEqual([{ uid: 'x1@channel-manager', start: '2026-11-02', end: '2026-11-05', summary: 'Not available' }]);
  });
});
