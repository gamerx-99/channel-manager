import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  listManagedHotels: vi.fn(),
  getManagedHotel: vi.fn(),
  listAvailabilityForHotel: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn((token: string) => ({ requestScoped: true, token })),
}));

const otaMocks = vi.hoisted(() => ({
  getGlobalOtaSummary: vi.fn(),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);
vi.mock('./otaSync', () => otaMocks);

const MY_HOTEL_ID = '11111111-1111-4111-a111-111111111111';
const OTHER_HOTEL_ID = '99999999-9999-4999-a999-999999999999';

const mockHotels = [
  {
    id: MY_HOTEL_ID,
    name: 'My Hotel',
    slug: 'my-hotel',
    address: '123 Main St',
    public_enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    room_types: [{ id: 'rt-1' }],
    rooms: [
      { id: 'r-1', status: 'available' },
      { id: 'r-2', status: 'occupied' },
    ],
    bookings: [
      {
        id: 'b-1',
        source: 'manual' as const,
        status: 'confirmed' as const,
        check_in: new Date().toISOString().slice(0, 10),
        check_out: '2026-12-31',
        price: 1500,
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

function createCaller(role: 'hotel_owner' | 'super_admin' = 'hotel_owner') {
  return import('./routers').then(({ appRouter }) =>
    appRouter.createCaller({
      req: {} as Request,
      res: {} as Response,
      user: {
        id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
        email: 'user@example.com',
        name: 'Test user',
        accessToken: `${role}-access-token`,
        appMetadata: {},
        userMetadata: {},
        role,
        roles: [role],
        memberships: [{ hotelId: MY_HOTEL_ID, role }],
      },
    }),
  );
}

describe('channelManager.dashboard hotel isolation and filtering', () => {
  it('returns all caller-accessible hotels when no hotelId is passed', async () => {
    dbMocks.listManagedHotels.mockResolvedValueOnce(mockHotels);
    const app = await createCaller();

    const result = await app.channelManager.dashboard();

    expect(result.hotels).toHaveLength(1);
    expect(result.hotels[0].id).toBe(MY_HOTEL_ID);
    expect(result.summary.hotelCount).toBe(1);
    expect(result.summary.roomCount).toBe(2);
    expect(result.summary.availableRoomCount).toBe(1);
  });

  it('filters to the specific hotel when a valid caller-accessible hotelId is provided', async () => {
    dbMocks.listManagedHotels.mockResolvedValueOnce(mockHotels);
    const app = await createCaller();

    const result = await app.channelManager.dashboard({ hotelId: MY_HOTEL_ID });

    expect(result.hotels).toHaveLength(1);
    expect(result.hotels[0].id).toBe(MY_HOTEL_ID);
    expect(result.summary.hotelCount).toBe(1);
  });

  it('returns 0 hotels and empty summary when an unauthorized hotelId is requested', async () => {
    // Supabase RLS only returns hotels the caller is authorized to see
    dbMocks.listManagedHotels.mockResolvedValueOnce(mockHotels);
    const app = await createCaller();

    const result = await app.channelManager.dashboard({ hotelId: OTHER_HOTEL_ID });

    // Target hotel was not in RLS-visible list -> filtered out completely
    expect(result.hotels).toHaveLength(0);
    expect(result.summary.hotelCount).toBe(0);
    expect(result.summary.roomCount).toBe(0);
    expect(result.summary.availableRoomCount).toBe(0);
    expect(result.summary.recentBookings).toHaveLength(0);
  });
});

describe('channelManager.dashboardCalendar hotel isolation and filtering', () => {
  it('returns empty calendar when an unauthorized hotelId is requested', async () => {
    dbMocks.listManagedHotels.mockResolvedValueOnce(mockHotels);
    otaMocks.getGlobalOtaSummary.mockResolvedValueOnce([]);
    const app = await createCaller();

    const result = await app.channelManager.dashboardCalendar({
      hotelId: OTHER_HOTEL_ID,
      startDate: '2026-08-01',
      days: 7,
    });

    expect(result.hotels).toHaveLength(0);
  });

  it('populates calendar only for the authorized hotel when hotelId is passed', async () => {
    dbMocks.listManagedHotels.mockResolvedValueOnce(mockHotels);
    otaMocks.getGlobalOtaSummary.mockResolvedValueOnce([]);
    dbMocks.getManagedHotel.mockResolvedValueOnce({
      id: MY_HOTEL_ID,
      name: 'My Hotel',
      room_types: [{ id: 'rt-1', name: 'Deluxe', base_price: 1500 }],
      rooms: [{ id: 'r-1', room_type_id: 'rt-1', status: 'available' }],
    });
    dbMocks.listAvailabilityForHotel.mockResolvedValueOnce([]);
    const app = await createCaller();

    const result = await app.channelManager.dashboardCalendar({
      hotelId: MY_HOTEL_ID,
      startDate: '2026-08-01',
      days: 7,
    });

    expect(result.hotels).toHaveLength(1);
    expect(result.hotels[0].hotel.id).toBe(MY_HOTEL_ID);
    expect(result.hotels[0].roomTypes[0].name).toBe('Deluxe');
  });
});
