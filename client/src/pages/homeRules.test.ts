import { describe, expect, it } from 'vitest';
import { recentBookingStatusTone } from './homeRules';

describe('recentBookingStatusTone', () => {
  it('matches the Bookings page colours for each status', () => {
    expect(recentBookingStatusTone('confirmed')).toBe('live');
    expect(recentBookingStatusTone('checked_in')).toBe('live');
    expect(recentBookingStatusTone('checked_out')).toBe('done');
    expect(recentBookingStatusTone('refunded')).toBe('done');
    expect(recentBookingStatusTone('cancelled')).toBe('setup');
    expect(recentBookingStatusTone('payment_rejected')).toBe('setup');
    expect(recentBookingStatusTone('pending_verification')).toBe('pending');
  });
});
