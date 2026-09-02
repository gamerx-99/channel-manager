import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression test for the wiring mistake that made holdRoomType/confirmBookingDetails
// unreachable from the real appRouter in sub-phase B. The new hotel-services procedures
// must be imported into server/routers.ts AND listed in the channelManager router object
// before they become callable; pnpm check does not catch a missing property here.

const dbMocks = vi.hoisted(() => ({
  createHotelService: vi.fn(),
  listActiveHotelServicesBySlug: vi.fn(),
  getManagedHotel: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ requestScoped: true })),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

const hotelId = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const serviceId = 'f1a1b1c1-d1e1-41f1-81f1-111111111111';

function caller() {
  return import('./routers').then(({ appRouter }) => appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: 'd93900a0-e7fe-45d6-9364-80ea8a035322',
      email: 'hotel-service-test@example.com',
      name: 'Hotel service test user',
      accessToken: 'hotel_owner-access-token',
      appMetadata: { role: 'hotel_owner' },
      userMetadata: {},
      roles: ['hotel_owner'],
      memberships: [{ hotelId, role: 'hotel_owner' }],
    },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('channelManager hotel-services wiring', () => {
  it('createHotelServiceProcedure is reachable and reaches the db layer', async () => {
    const app = await caller();
    const client = { requestScoped: true };
    supabaseMocks.createRlsSupabaseClient.mockReturnValueOnce(client);
    dbMocks.getManagedHotel.mockResolvedValueOnce({ id: hotelId, room_types: [] });
    dbMocks.createHotelService.mockResolvedValueOnce({
      id: serviceId,
      hotel_id: hotelId,
      name: 'Extra bed',
      pricing_model: 'ONE_TIME',
      unit_price: 500,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await expect(app.channelManager.createHotelServiceProcedure({
      hotel_id: hotelId,
      name: 'Extra bed',
      pricing_model: 'ONE_TIME',
      unit_price: 500,
    })).resolves.toMatchObject({ id: serviceId });

    expect(supabaseMocks.createRlsSupabaseClient).toHaveBeenCalledWith('hotel_owner-access-token');
    expect(dbMocks.getManagedHotel).toHaveBeenCalledWith(client, hotelId);
    expect(dbMocks.createHotelService).toHaveBeenCalledTimes(1);
    expect(dbMocks.createHotelService).toHaveBeenCalledWith(client, {
      hotel_id: hotelId,
      name: 'Extra bed',
      pricing_model: 'ONE_TIME',
      unit_price: 500,
    });
  });

  it('listPublicHotelServices is reachable and reaches the db layer', async () => {
    const { appRouter } = await import('./routers');
    const app = appRouter.createCaller({ req: {} as Request, res: {} as Response, user: null });

    dbMocks.listActiveHotelServicesBySlug.mockResolvedValueOnce([
      {
        id: serviceId,
        hotel_id: hotelId,
        name: 'Breakfast',
        pricing_model: 'PER_PERSON_PER_NIGHT',
        unit_price: 350,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    await expect(app.channelManager.listPublicHotelServices({ slug: 'demo-hotel' })).resolves.toHaveLength(1);
    expect(dbMocks.listActiveHotelServicesBySlug).toHaveBeenCalledTimes(1);
    expect(dbMocks.listActiveHotelServicesBySlug).toHaveBeenCalledWith(expect.anything(), 'demo-hotel');
  });
});
