import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  createManagedHotel: vi.fn(),
  createManagedRoomType: vi.fn(),
  updateManagedRoomType: vi.fn(),
  deleteManagedRoomType: vi.fn(),
  createBookingWithGuests: vi.fn(),
  createHotelUserAssignment: vi.fn(),
  deleteHotelUserAssignment: vi.fn(),
  listHotelOptions: vi.fn(),
  listHotelUserAssignments: vi.fn(),
  getManagedHotel: vi.fn(),
  getPublicHotel: vi.fn(),
  isSuperAdmin: vi.fn(),
  listAvailabilityForHotel: vi.fn(),
  listBookingsForHotel: vi.fn(),
  listManagedHotels: vi.fn(),
  updateAvailability: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ requestScoped: true })),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

const hotelId = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const roomTypeId = 'f1a1b1c1-d1e1-41f1-81f1-111111111111';
const otherRoomTypeId = 'f2a2b2c2-d2e2-42f2-82f2-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getManagedHotel.mockResolvedValue({
    id: hotelId,
    room_types: [{ id: roomTypeId }],
    rooms: [
      { id: 'room-1', room_type_id: roomTypeId },
      { id: 'room-2', room_type_id: roomTypeId },
    ],
  });
  dbMocks.updateAvailability.mockResolvedValue({ id: 'availability-1', rooms_available: 1 });
});

function caller(role: 'revenue_manager' | 'housekeeping' | 'hotel_owner' = 'revenue_manager') {
  return import('./routers').then(({ appRouter }) => appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: 'd93900e7-7fe4-45d6-9364-80ea8a035322',
      email: `${role}@example.com`,
      name: 'Availability test user',
      accessToken: `${role}-access-token`,
      appMetadata: { role },
      userMetadata: {},
      roles: [role],
      memberships: [{ hotelId, role }],
    },
  }));
}

describe('channelManager.updateAvailability quick actions', () => {
  it('allows Revenue Manager to update allotment inside the selected property', async () => {
    const app = await caller('revenue_manager');

    await expect(app.channelManager.updateAvailability({
      hotel_id: hotelId,
      room_type_id: roomTypeId,
      date: '2026-08-20',
      price: 2500,
      rooms_available: 1,
      action: 'allotment',
    })).resolves.toMatchObject({ id: 'availability-1' });

    expect(dbMocks.getManagedHotel).toHaveBeenCalledWith(expect.anything(), hotelId);
    expect(dbMocks.updateAvailability).toHaveBeenCalledWith(expect.anything(), {
      room_type_id: roomTypeId,
      date: '2026-08-20',
      price: 2500,
      rooms_available: 1,
    });
  });

  it('allows Hotel Admin to issue the explicit stop-sell action', async () => {
    const app = await caller('hotel_owner');

    await expect(app.channelManager.updateAvailability({
      hotel_id: hotelId,
      room_type_id: roomTypeId,
      date: '2026-08-20',
      price: 2500,
      rooms_available: 0,
      action: 'stop_sell',
    })).resolves.toMatchObject({ id: 'availability-1' });

    expect(dbMocks.updateAvailability).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ rooms_available: 0 }));
  });

  it('rejects Housekeeping before any availability write', async () => {
    const app = await caller('housekeeping');

    await expect(app.channelManager.updateAvailability({
      hotel_id: hotelId,
      room_type_id: roomTypeId,
      date: '2026-08-20',
      price: 2500,
      rooms_available: 0,
      action: 'stop_sell',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(dbMocks.getManagedHotel).not.toHaveBeenCalled();
    expect(dbMocks.updateAvailability).not.toHaveBeenCalled();
  });

  it('rejects a room type outside the selected property and over-capacity values', async () => {
    const app = await caller('revenue_manager');

    await expect(app.channelManager.updateAvailability({
      hotel_id: hotelId,
      room_type_id: otherRoomTypeId,
      date: '2026-08-20',
      price: 2500,
      rooms_available: 1,
      action: 'allotment',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    dbMocks.getManagedHotel.mockResolvedValueOnce({
      id: hotelId,
      room_types: [{ id: roomTypeId }],
      rooms: [{ id: 'room-1', room_type_id: roomTypeId }],
    });

    await expect(app.channelManager.updateAvailability({
      hotel_id: hotelId,
      room_type_id: roomTypeId,
      date: '2026-08-20',
      price: 2500,
      rooms_available: 2,
      action: 'allotment',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(dbMocks.updateAvailability).not.toHaveBeenCalled();
  });
});
