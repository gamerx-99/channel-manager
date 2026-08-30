import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  createManagedHotel: vi.fn(),
  createManagedRoomType: vi.fn(),
  createBookingWithGuests: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
});

function caller(role: TestRole = 'super_admin') {
  return import('./routers').then(({ appRouter }) => appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
      email: 'mutation-test@example.com',
      name: 'Mutation test user',
      accessToken: `${role}-access-token`,
      appMetadata: { role },
      userMetadata: {},
      roles: [role],
      memberships: role === 'hotel_owner' ? [{ hotelId: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4', role }] : [],
    },
  }));
}

describe('channelManager.createHotel', () => {
  it('rejects hotel creation for a non-super-admin before INSERT is attempted', async () => {
    const app = await caller('hotel_owner');

    await expect(app.channelManager.createHotel({
      name: 'Little Bro',
      slug: 'little-bro',
      address: 'Bangkok',
      owner_contact: 'owner@example.com',
      public_enabled: false,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(supabaseMocks.createRlsSupabaseClient).not.toHaveBeenCalled();
    expect(dbMocks.createManagedHotel).not.toHaveBeenCalled();
  });

  it('passes normalized, validated input to the RLS-scoped insert helper for a super-admin', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    dbMocks.isSuperAdmin.mockResolvedValueOnce(true);
    dbMocks.createManagedHotel.mockResolvedValueOnce({ id: 'hotel-created' });
    const app = await caller('super_admin');

    await expect(app.channelManager.createHotel({
      name: '  Little Bro  ',
      slug: 'Little-Bro',
      address: '  Bangkok  ',
      owner_contact: ' owner@example.com ',
      public_enabled: true,
    })).resolves.toEqual({ id: 'hotel-created' });

    expect(dbMocks.isSuperAdmin).toHaveBeenCalledWith(client);
    expect(dbMocks.createManagedHotel).toHaveBeenCalledWith(client, {
      name: 'Little Bro',
      slug: 'little-bro',
      address: 'Bangkok',
      owner_contact: 'owner@example.com',
      public_enabled: true,
    });
  });

  it('rejects an invalid public slug during tRPC input validation', async () => {
    const app = await caller('super_admin');

    await expect(app.channelManager.createHotel({
      name: 'Little Bro',
      slug: 'Little Bro',
      address: 'Bangkok',
      owner_contact: 'owner@example.com',
      public_enabled: false,
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(dbMocks.createManagedHotel).not.toHaveBeenCalled();
  });
});

describe('channelManager.createRoomType', () => {
  it('rejects an RLS-hidden hotel before attempting the room type INSERT', async () => {
    dbMocks.getManagedHotel.mockResolvedValueOnce(null);
    const app = await caller('hotel_owner');

    await expect(app.channelManager.createRoomType({
      hotel_id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4',
      name: 'Deluxe King',
      capacity: 2,
      base_price: 2500,
      quantity: 5,
    })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'This hotel is not available to your account.',
    });

    expect(dbMocks.createManagedRoomType).not.toHaveBeenCalled();
  });

  it('allows an RLS-visible hotel owner to create a positive-priced room type', async () => {
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    dbMocks.getManagedHotel.mockResolvedValueOnce({ id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4' });
    dbMocks.createManagedRoomType.mockResolvedValueOnce({ id: 'room-type-created' });
    const app = await caller('hotel_owner');

    await expect(app.channelManager.createRoomType({
      hotel_id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4',
      name: '  Deluxe King  ',
      capacity: 2,
      base_price: 2500,
      quantity: 5,
    })).resolves.toEqual({ id: 'room-type-created' });

    expect(dbMocks.getManagedHotel).toHaveBeenCalledWith(client, '88ed76e4-cc93-4aa7-9c4d-30999d35ada4');
    expect(dbMocks.createManagedRoomType).toHaveBeenCalledWith(client, {
      hotel_id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4',
      name: 'Deluxe King',
      capacity: 2,
      base_price: 2500,
      quantity: 5,
    });
  });

  it('rejects a zero base price before querying the database', async () => {
    const app = await caller('hotel_owner');

    await expect(app.channelManager.createRoomType({
      hotel_id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4',
      name: 'Deluxe King',
      capacity: 2,
      base_price: 0,
      quantity: 5,
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(dbMocks.getManagedHotel).not.toHaveBeenCalled();
    expect(dbMocks.createManagedRoomType).not.toHaveBeenCalled();
  });

  it('maps a database uniqueness error to a conflict response', async () => {
    dbMocks.getManagedHotel.mockResolvedValueOnce({ id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4' });
    dbMocks.createManagedRoomType.mockRejectedValueOnce(new Error('23505: duplicate key value violates unique constraint'));
    const app = await caller('hotel_owner');

    await expect(app.channelManager.createRoomType({
      hotel_id: '88ed76e4-cc93-4aa7-9c4d-30999d35ada4',
      name: 'Duplicate',
      capacity: 2,
      base_price: 2500,
      quantity: 5,
    })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A hotel or room type with the same unique details already exists.',
    });
  });
});
