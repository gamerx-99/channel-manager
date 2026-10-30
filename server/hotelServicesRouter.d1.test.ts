import { beforeEach, describe, expect, it, vi } from 'vitest';

const hotelMocks = vi.hoisted(() => ({
  createHotelService: vi.fn(),
  listActiveHotelServicesBySlug: vi.fn(),
}));

vi.mock('./d1/hotel', () => hotelMocks);

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
      appMetadata: {},
      userMetadata: {},
      role: 'hotel_owner',
      roles: ['hotel_owner'],
      memberships: [{ hotelId, role: 'hotel_owner' }],
    },
    db: {} as any,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: ['hotel_owner'], access: 'authenticated' } as any,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('channelManager hotel-services wiring (D1)', () => {
  it('createHotelServiceProcedure is reachable and reaches the D1 layer', async () => {
    const app = await caller();
    hotelMocks.createHotelService.mockResolvedValueOnce({
      id: serviceId,
      hotelId,
      name: 'Extra bed',
      pricingModel: 'ONE_TIME',
      unitPrice: '500.00',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(app.channelManager.createHotelServiceProcedure({
      hotel_id: hotelId,
      name: 'Extra bed',
      pricing_model: 'ONE_TIME',
      unit_price: 500,
    })).resolves.toMatchObject({ id: serviceId });

    expect(hotelMocks.createHotelService).toHaveBeenCalledTimes(1);
    expect(hotelMocks.createHotelService).toHaveBeenCalledWith(
      {},
      { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: ['hotel_owner'], access: 'authenticated' },
      {
        hotel_id: hotelId,
        name: 'Extra bed',
        pricing_model: 'ONE_TIME',
        unit_price: 500,
      },
    );
  });

  it('listPublicHotelServices is reachable and reaches the D1 layer', async () => {
    const { appRouter } = await import('./routers');
    const app = appRouter.createCaller({ req: {} as Request, res: {} as Response, user: null, db: {} as any, caller: { userId: '', roles: [], access: 'public' } as any });

    hotelMocks.listActiveHotelServicesBySlug.mockResolvedValueOnce([
      {
        id: serviceId,
        hotelId,
        name: 'Breakfast',
        pricingModel: 'PER_PERSON_PER_NIGHT',
        unitPrice: '350.00',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await expect(app.channelManager.listPublicHotelServices({ slug: 'demo-hotel' })).resolves.toHaveLength(1);
    expect(hotelMocks.listActiveHotelServicesBySlug).toHaveBeenCalledTimes(1);
    expect(hotelMocks.listActiveHotelServicesBySlug).toHaveBeenCalledWith(
      {},
      { userId: '', roles: [], access: 'public' },
      'demo-hotel',
    );
  });
});
