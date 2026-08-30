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

/**
 * A platform role's `hotel_users` row still carries a `hotel_id` because the column is
 * NOT NULL, so `HOME_HOTEL` is the arbitrary hotel it points at and `OTHER_HOTEL` is the
 * one it must still be able to read without any membership.
 */
const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const OTHER_HOTEL = '2d0a2f4e-6b3f-4a1e-9f0d-5c2b7a913e11';

beforeEach(() => {
  vi.clearAllMocks();
});

function caller(role: 'admin' | 'front_desk') {
  return import('./routers').then(({ appRouter }) => appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
      email: 'platform-admin@example.com',
      name: 'Platform admin',
      accessToken: `${role}-access-token`,
      appMetadata: {},
      userMetadata: {},
      role,
      roles: [role],
      memberships: [{ hotelId: HOME_HOTEL, role }],
    },
  }));
}

describe('read-only platform admin access', () => {
  it('reads bookings for a hotel it has no membership in', async () => {
    dbMocks.listBookingsForHotel.mockResolvedValueOnce([]);
    const app = await caller('admin');

    await expect(app.channelManager.bookings(OTHER_HOTEL)).resolves.toEqual([]);
    expect(supabaseMocks.createRlsSupabaseClient).toHaveBeenCalledWith('admin-access-token');
    expect(dbMocks.listBookingsForHotel).toHaveBeenCalledWith({ requestScoped: true }, OTHER_HOTEL);
  });

  it('still denies a property role the same cross-hotel read', async () => {
    const app = await caller('front_desk');

    await expect(app.channelManager.bookings(OTHER_HOTEL)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.listBookingsForHotel).not.toHaveBeenCalled();
  });

  it('refuses every write capability, on its own hotel row and on any other', async () => {
    const app = await caller('admin');

    for (const hotelId of [HOME_HOTEL, OTHER_HOTEL]) {
      await expect(app.channelManager.exportTm30(hotelId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(app.channelManager.hotelStaff({ hotel_id: hotelId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(app.channelManager.createRoomType({
        hotel_id: hotelId,
        name: 'Deluxe',
        capacity: 2,
        base_price: 1200,
        quantity: 5,
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }

    await expect(app.channelManager.createHotel({
      name: 'New property',
      slug: 'new-property',
      address: 'Bangkok',
      owner_contact: 'owner@example.com',
      public_enabled: false,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(app.channelManager.adminUsers()).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(dbMocks.createManagedRoomType).not.toHaveBeenCalled();
    expect(dbMocks.createManagedHotel).not.toHaveBeenCalled();
  });

  it('scopes the portfolio dashboard through RLS rather than the membership list', async () => {
    dbMocks.listManagedHotels.mockResolvedValueOnce([]);
    const app = await caller('admin');

    await app.channelManager.hotels();

    expect(dbMocks.listManagedHotels).toHaveBeenCalledWith({ requestScoped: true });
  });
});
