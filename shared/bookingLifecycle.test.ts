import { describe, it, expect } from 'vitest';
import {
  assertValidTransition,
  isExpired,
  isBookingOccupyingInventory,
  ALLOWED_TRANSITIONS,
  type BookingStatus,
} from './bookingLifecycle';

describe('bookingLifecycle', () => {
  describe('ALLOWED_TRANSITIONS', () => {
    it('allows every documented edge', () => {
      const cases: [BookingStatus, BookingStatus][] = [
        ['held', 'pending_payment'],
        ['held', 'expired'],
        ['held', 'cancelled'],
        ['pending_payment', 'pending_verification'],
        ['pending_payment', 'expired'],
        ['pending_payment', 'cancelled'],
        ['pending_verification', 'confirmed'],
        ['pending_verification', 'payment_rejected'],
        ['payment_rejected', 'pending_verification'],
        ['payment_rejected', 'expired'],
        ['confirmed', 'cancelled'],
        ['confirmed', 'checked_in'],
        ['checked_in', 'checked_out'],
        ['cancelled', 'refund_pending'],
        ['refund_pending', 'refunded'],
      ];

      for (const [from, to] of cases) {
        expect(ALLOWED_TRANSITIONS[from]).toContain(to);
      }
    });

    it('rejects invalid transitions', () => {
      expect(() => assertValidTransition('held', 'confirmed')).toThrow(
        'Invalid booking status transition: held -> confirmed',
      );
      expect(() => assertValidTransition('confirmed', 'held')).toThrow(
        'Invalid booking status transition: confirmed -> held',
      );
      expect(() => assertValidTransition('expired', 'held')).toThrow(
        'Invalid booking status transition: expired -> held',
      );
      expect(() => assertValidTransition('refunded', 'cancelled')).toThrow(
        'Invalid booking status transition: refunded -> cancelled',
      );
    });

    it('treats same-state assertions as a no-op', () => {
      expect(() => assertValidTransition('held', 'held')).not.toThrow();
      expect(() => assertValidTransition('confirmed', 'confirmed')).not.toThrow();
      expect(() => assertValidTransition('expired', 'expired')).not.toThrow();
    });
  });

  describe('isExpired', () => {
    it('returns false when expiresAt is null', () => {
      expect(isExpired(null)).toBe(false);
    });

    it('returns false for a future timestamp', () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      expect(isExpired(future)).toBe(false);
    });

    it('returns true for a past timestamp', () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      expect(isExpired(past)).toBe(true);
    });
  });

  describe('isBookingOccupyingInventory', () => {
    it('returns true for confirmed regardless of expiry', () => {
      expect(
        isBookingOccupyingInventory({ status: 'confirmed', expires_at: null }),
      ).toBe(true);
      expect(
        isBookingOccupyingInventory({
          status: 'confirmed',
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        }),
      ).toBe(true);
    });

    it('returns true for held bookings that are not expired', () => {
      expect(
        isBookingOccupyingInventory({
          status: 'held',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        }),
      ).toBe(true);
    });

    it('returns false for held bookings that have expired', () => {
      expect(
        isBookingOccupyingInventory({
          status: 'held',
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        }),
      ).toBe(false);
    });

    it('returns false for cancelled bookings', () => {
      expect(
        isBookingOccupyingInventory({ status: 'cancelled', expires_at: null }),
      ).toBe(false);
    });
  });
});
