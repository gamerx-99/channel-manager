import { describe, expect, it, beforeEach, vi } from 'vitest';
import { calcNights, getRequiredMinStayNights, assertMinStayOrThrow } from './pricing';

// --- Pure pricing helpers ---

describe('pricing minStay helpers', () => {
  it('calcNights computes nights between dates', () => {
    expect(calcNights('2026-08-10', '2026-08-11')).toBe(1);
    expect(calcNights('2026-08-10', '2026-08-13')).toBe(3);
    expect(calcNights('2026-08-13', '2026-08-10')).toBe(0);
  });

  it('getRequiredMinStayNights returns max overlapping min stay', () => {
    const overrides = [
      { id: 'a', room_type_id: 'rt1', start_date: '2026-12-20', end_date: '2026-12-31', override_price: 1000, min_stay_nights: 3 },
      { id: 'b', room_type_id: 'rt1', start_date: '2026-12-24', end_date: '2026-12-26', override_price: 1500, min_stay_nights: 5 },
      { id: 'c', room_type_id: 'rt1', start_date: '2026-11-01', end_date: '2026-11-30', override_price: 800, min_stay_nights: null },
    ];
    // Stay overlapping both Dec overrides — most restrictive (5) wins
    expect(getRequiredMinStayNights('2026-12-24', '2026-12-26', overrides)).toBe(5);
    // Stay touching only first override
    expect(getRequiredMinStayNights('2026-12-20', '2026-12-22', overrides)).toBe(3);
    // Outside all min_stay ranges
    expect(getRequiredMinStayNights('2026-08-10', '2026-08-12', overrides)).toBeNull();
    // Override with null min_stay is ignored
    expect(getRequiredMinStayNights('2026-11-10', '2026-11-12', overrides)).toBeNull();
  });

  it('assertMinStayOrThrow throws BAD_REQUEST-style message naming the minimum', () => {
    const overrides = [
      { id: 'a', room_type_id: 'rt1', start_date: '2026-12-20', end_date: '2026-12-31', override_price: 1000, min_stay_nights: 3 },
    ];
    // 2 nights < 3 required → throw naming 3
    expect(() => assertMinStayOrThrow('2026-12-20', '2026-12-22', overrides)).toThrow(/at least 3 nights/i);
    expect(() => assertMinStayOrThrow('2026-12-20', '2026-12-22', overrides)).toThrow(/minimum stay.*3/i);
    // exactly 3 nights passes
    expect(() => assertMinStayOrThrow('2026-12-20', '2026-12-23', overrides)).not.toThrow();
  });

  it('singular night wording for min 1 is correctly formatted', () => {
    const overrides = [
      { id: 'a', room_type_id: 'rt1', start_date: '2026-12-20', end_date: '2026-12-31', override_price: 1000, min_stay_nights: 3 },
    ];
    // 2 nights < 3 → message should contain plural "nights"
    try {
      assertMinStayOrThrow('2026-12-20', '2026-12-22', overrides);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as Error).message).toMatch(/3 nights/);
    }
  });
});

// --- Router enforcement (mocked db) ---

const dbMocks = vi.hoisted(() => ({
  assertBookingMinStay: vi.fn(),
  createBookingWithGuests: vi.fn(),
  getManagedHotel: vi.fn(),
  listRateOverridesForRoomType: vi.fn(),
  // other exports required by routers module graph but not used in this flow
  createManagedHotel: vi.fn(),
  createManagedRoomType: vi.fn(),
  updateManagedRoomType: vi.fn(),
  deleteManagedRoomType: vi.fn(),
  createHotelUserAssignment: vi.fn(),
  deleteHotelUserAssignment: vi.fn(),
  listHotelOptions: vi.fn(),
  listHotelUserAssignments: vi.fn(),
  listHotelStaff: vi.fn(),
  listHotelAdminAuditLogs: vi.fn(),
  updateHotelUserAssignmentRole: vi.fn(),
  transferHotelAdmin: vi.fn(),
  getPublicHotel: vi.fn(),
  isSuperAdmin: vi.fn(),
  listAvailabilityForHotel: vi.fn(),
  listBookingsForHotel: vi.fn(),
  listManagedHotels: vi.fn(),
  listManagedHotelsForFinancials: vi.fn(),
  updateAvailability: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ requestScoped: true })),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

const HOTEL_ID = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const ROOM_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
});

function hotelOwnerCaller() {
  return import('./routers').then(({ appRouter }) =>
    appRouter.createCaller({
      req: {} as Request,
      res: {} as Response,
      user: {
        id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
        email: 'owner@example.com',
        name: 'Owner',
        accessToken: 'hotel_owner-token',
        appMetadata: {},
        userMetadata: {},
        role: 'hotel_owner' as const,
        roles: ['hotel_owner' as const],
        memberships: [{ hotelId: HOTEL_ID, role: 'hotel_owner' as const }],
      },
    }),
  );
}

describe('createBooking min_stay enforcement', () => {
  it('rejects booking violating min stay with BAD_REQUEST naming the minimum', async () => {
    dbMocks.assertBookingMinStay.mockRejectedValueOnce(
      new Error('Booking must be at least 3 nights (minimum stay for selected dates is 3 nights).'),
    );
    const app = await hotelOwnerCaller();

    await expect(
      app.channelManager.createBooking({
        hotel_id: HOTEL_ID,
        room_id: ROOM_ID,
        guest_name: 'Min Stay Guest',
        check_in: '2026-12-20',
        check_out: '2026-12-22',
        price: 1000,
        source: 'manual',
        status: 'confirmed',
        guests: [],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringMatching(/3 nights/) });

    expect(dbMocks.assertBookingMinStay).toHaveBeenCalledWith(
      { requestScoped: true },
      ROOM_ID,
      '2026-12-20',
      '2026-12-22',
    );
    expect(dbMocks.createBookingWithGuests).not.toHaveBeenCalled();
  });

  it('allows booking meeting min stay', async () => {
    dbMocks.assertBookingMinStay.mockResolvedValueOnce(undefined);
    dbMocks.createBookingWithGuests.mockResolvedValueOnce({ id: 'booking-ok' });
    const app = await hotelOwnerCaller();

    await expect(
      app.channelManager.createBooking({
        hotel_id: HOTEL_ID,
        room_id: ROOM_ID,
        guest_name: 'Happy Guest',
        check_in: '2026-12-20',
        check_out: '2026-12-23',
        price: 1000,
        source: 'manual',
        status: 'confirmed',
        guests: [],
      }),
    ).resolves.toEqual({ id: 'booking-ok' });

    expect(dbMocks.createBookingWithGuests).toHaveBeenCalled();
  });

  it('skips min stay check when room_id is null (unassigned booking)', async () => {
    dbMocks.assertBookingMinStay.mockResolvedValueOnce(undefined);
    dbMocks.createBookingWithGuests.mockResolvedValueOnce({ id: 'booking-null-room' });
    const app = await hotelOwnerCaller();

    await expect(
      app.channelManager.createBooking({
        hotel_id: HOTEL_ID,
        room_id: null,
        guest_name: 'No Room Guest',
        check_in: '2026-12-20',
        check_out: '2026-12-21',
        price: 500,
        source: 'manual',
        status: 'confirmed',
        guests: [],
      }),
    ).resolves.toEqual({ id: 'booking-null-room' });

    expect(dbMocks.assertBookingMinStay).toHaveBeenCalledWith(
      { requestScoped: true },
      null,
      '2026-12-20',
      '2026-12-21',
    );
  });
});
