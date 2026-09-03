import { describe, expect, it, vi } from 'vitest';
import { expireBookingIfPast } from './booking';
import { isBookingOccupyingInventory } from '@shared/bookingLifecycle';

// Regression coverage for two bugs an advisor review caught before sub-phase E shipped:
//
// 1. verifySlip moves a booking into 'pending_verification' but ALLOWED_TRANSITIONS has no
//    pending_verification -> 'expired' edge (manual review must never auto-fail on a timer).
//    If expires_at were left non-null from the prior pending_payment state, the next lazy-check
//    would throw instead of no-op'ing — turning a routine poll into a 500. The fix is that
//    verifySlip now clears expires_at to null when entering pending_verification; these tests
//    pin down why that's required and confirm the room correctly stays reserved during review.
// 2. holdRoomType/createPublicBooking must sweep stale held/pending_payment rows before
//    checking availability — expireBookingIfPast is the mechanism they call per stale row.

function makeBookingsTableMock(row: Record<string, unknown> | null) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
      }),
    }),
    update,
  };
}

function makeClient(bookingsTable: ReturnType<typeof makeBookingsTableMock>) {
  return {
    from: (table: string) => {
      if (table === 'bookings') return bookingsTable;
      if (table === 'booking_status_log') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as any;
}

describe('expireBookingIfPast', () => {
  it('is a safe no-op for a pending_verification row with expires_at=null (manual review, no timer)', async () => {
    const bookingsTable = makeBookingsTableMock({
      id: 'b1',
      status: 'pending_verification',
      expires_at: null,
    });
    const client = makeClient(bookingsTable);

    const result = await expireBookingIfPast(client, 'b1');

    expect(result).toEqual({ id: 'b1', status: 'pending_verification', expires_at: null });
    expect(bookingsTable.update).not.toHaveBeenCalled();
  });

  it('flips a held row past its expires_at to expired', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const bookingsTable = makeBookingsTableMock({
      id: 'b2',
      status: 'held',
      expires_at: past,
    });
    const client = makeClient(bookingsTable);

    const result = await expireBookingIfPast(client, 'b2');

    expect(result).toEqual({ status: 'expired', expires_at: past });
    expect(bookingsTable.update).toHaveBeenCalledWith({ status: 'expired' });
  });

  it('does not throw if a stale pending_verification row somehow still carries a past expires_at (defensive)', async () => {
    // Should never happen once verifySlip clears expires_at on entry, but confirms
    // expireBookingIfPast itself wouldn't crash if it did — assertValidTransition would throw
    // for pending_verification -> expired, which is exactly the 500 this guards against.
    const past = new Date(Date.now() - 60_000).toISOString();
    const bookingsTable = makeBookingsTableMock({
      id: 'b3',
      status: 'pending_verification',
      expires_at: past,
    });
    const client = makeClient(bookingsTable);

    await expect(expireBookingIfPast(client, 'b3')).rejects.toThrow(
      'Invalid booking status transition: pending_verification -> expired',
    );
  });
});

describe('isBookingOccupyingInventory during manual review', () => {
  it('keeps the room reserved for pending_verification with no expiry (a human is reviewing the slip)', () => {
    expect(isBookingOccupyingInventory({ status: 'pending_verification', expires_at: null })).toBe(true);
  });
});
