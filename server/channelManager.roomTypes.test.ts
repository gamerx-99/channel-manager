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

type TestRole = 'super_admin' | 'hotel_owner';
const hotelId = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const roomTypeId = 'f1a1b1c1-d1e1-41f1-81f1-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
});

function caller(role: TestRole = 'hotel_owner') {
  return import('./routers').then(({ appRouter }) => appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
      email: 'room-type-test@example.com',
      name: 'Room type test user',
      accessToken: `${role}-access-token`,
      appMetadata: { role },
      userMetadata: {},
      roles: [role],
      memberships: role === 'hotel_owner' ? [{ hotelId, role }] : [],
    },
  }));
}

function visibleHotel() {
  return {
    id: hotelId,
    room_types: [{ id: roomTypeId, hotel_id: hotelId, name: 'Deluxe King', capacity: 2, base_price: 2500 }],
  };
}

describe('channelManager.updateRoomType', () => {
  it('rejects an RLS-hidden hotel before attempting an update', async () => {
    dbMocks.getManagedHotel.mockResolvedValueOnce(null);
    const app = await caller('hotel_owner');

    await expect(app.channelManager.updateRoomType({
      hotel_id: hotelId,
      room_type_id: roomTypeId,
      name: 'Deluxe King',
      capacity: 2,
      base_price: 2800,
    })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'This room type is not available to your account.',
    });

    expect(dbMocks.updateManagedRoomType).not.toHaveBeenCalled();
  });

  it('allows a hotel owner to update a visible room type through the request-scoped client', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    dbMocks.getManagedHotel.mockResolvedValueOnce(visibleHotel());
    dbMocks.updateManagedRoomType.mockResolvedValueOnce({ id: roomTypeId, name: '  Suite  ' });
    const app = await caller('hotel_owner');

    await expect(app.channelManager.updateRoomType({
      hotel_id: hotelId,
      room_type_id: roomTypeId,
      name: '  Suite  ',
      capacity: 3,
      base_price: 3200,
    })).resolves.toMatchObject({ id: roomTypeId });

    expect(supabaseMocks.createRlsSupabaseClient).toHaveBeenCalledWith('hotel_owner-access-token');
    expect(dbMocks.getManagedHotel).toHaveBeenCalledWith(client, hotelId);
    expect(dbMocks.updateManagedRoomType).toHaveBeenCalledWith(client, {
      hotel_id: hotelId,
      room_type_id: roomTypeId,
      name: 'Suite',
      capacity: 3,
      base_price: 3200,
    });
  });

  it('allows a super admin to update a visible room type without using a service-role client', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    dbMocks.getManagedHotel.mockResolvedValueOnce(visibleHotel());
    dbMocks.updateManagedRoomType.mockResolvedValueOnce({ id: roomTypeId });
    const app = await caller('super_admin');

    await expect(app.channelManager.updateRoomType({
      hotel_id: hotelId,
      room_type_id: roomTypeId,
      name: 'Executive King',
      capacity: 2,
      base_price: 4000,
    })).resolves.toMatchObject({ id: roomTypeId });

    expect(supabaseMocks.createRlsSupabaseClient).toHaveBeenCalledWith('super_admin-access-token');
    expect(dbMocks.updateManagedRoomType).toHaveBeenCalledWith(client, expect.objectContaining({ name: 'Executive King' }));
  });

  it('rejects a non-positive base price before querying Supabase', async () => {
    const app = await caller('hotel_owner');

    await expect(app.channelManager.updateRoomType({
      hotel_id: hotelId,
      room_type_id: roomTypeId,
      name: 'Deluxe King',
      capacity: 2,
      base_price: 0,
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(dbMocks.getManagedHotel).not.toHaveBeenCalled();
    expect(dbMocks.updateManagedRoomType).not.toHaveBeenCalled();
  });

  it('maps an RLS-filtered update result to not found', async () => {
    dbMocks.getManagedHotel.mockResolvedValueOnce(visibleHotel());
    dbMocks.updateManagedRoomType.mockResolvedValueOnce(null);
    const app = await caller('hotel_owner');

    await expect(app.channelManager.updateRoomType({
      hotel_id: hotelId,
      room_type_id: roomTypeId,
      name: 'Deluxe King',
      capacity: 2,
      base_price: 2800,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('channelManager.deleteRoomType', () => {
  it('rejects an RLS-hidden room type before attempting deletion', async () => {
    dbMocks.getManagedHotel.mockResolvedValueOnce({ id: hotelId, room_types: [] });
    const app = await caller('hotel_owner');

    await expect(app.channelManager.deleteRoomType({
      hotel_id: hotelId,
      room_type_id: roomTypeId,
    })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'This room type is not available to your account.',
    });

    expect(dbMocks.deleteManagedRoomType).not.toHaveBeenCalled();
  });

  it('allows a hotel owner to delete a visible room type through the request-scoped client', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    dbMocks.getManagedHotel.mockResolvedValueOnce(visibleHotel());
    dbMocks.deleteManagedRoomType.mockResolvedValueOnce({ id: roomTypeId });
    const app = await caller('hotel_owner');

    await expect(app.channelManager.deleteRoomType({
      hotel_id: hotelId,
      room_type_id: roomTypeId,
    })).resolves.toEqual({ success: true, id: roomTypeId });

    expect(supabaseMocks.createRlsSupabaseClient).toHaveBeenCalledWith('hotel_owner-access-token');
    expect(dbMocks.deleteManagedRoomType).toHaveBeenCalledWith(client, {
      hotel_id: hotelId,
      room_type_id: roomTypeId,
    });
  });

  it('maps a filtered delete result to not found', async () => {
    dbMocks.getManagedHotel.mockResolvedValueOnce(visibleHotel());
    dbMocks.deleteManagedRoomType.mockResolvedValueOnce(null);
    const app = await caller('super_admin');

    await expect(app.channelManager.deleteRoomType({
      hotel_id: hotelId,
      room_type_id: roomTypeId,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
