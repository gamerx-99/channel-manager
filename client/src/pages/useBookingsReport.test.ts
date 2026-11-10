import { describe, expect, it } from 'vitest';
import { bookingSourceTranslationKey, reportBookingsCsv } from './useBookingsReport';

describe('bookings report CSV', () => {
  it('exports the requested columns and neutralizes spreadsheet formulas in guest fields', () => {
    const csv = reportBookingsCsv([{ id: '12345678', guestName: '=HYPERLINK("bad")', roomType: 'Standard', checkIn: '2026-11-02', checkOut: '2026-11-04', nights: 2, status: 'confirmed', amount: 1500 }], ['Ref', 'Guest', 'Type', 'In', 'Out', 'Nights', 'Status', 'Amount']);
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('1500.00');
  });
  it('exports a count-only report without an amount header or values', () => {
    const csv = reportBookingsCsv([{ id: '12345678', guestName: 'Guest', roomType: 'Standard', checkIn: '2026-11-02', checkOut: '2026-11-04', nights: 2, status: 'confirmed' }], ['Ref', 'Guest', 'Type', 'In', 'Out', 'Nights', 'Status']);
    expect(csv.split('\n').map(line => line.split(',').length)).toEqual([7, 7]);
    expect(csv).not.toContain('Amount');
    expect(csv).not.toContain('1500');
  });
});

describe('bookings report source translations', () => {
  it('normalizes a walk-in source to the existing translation key', () => {
    expect(bookingSourceTranslationKey('walk-in')).toBe('bookingsReport.source_walk_in');
    expect(bookingSourceTranslationKey('walk_in')).toBe('bookingsReport.source_walk_in');
  });
});
