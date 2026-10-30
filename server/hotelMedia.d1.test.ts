import { beforeEach, describe, expect, it, vi } from 'vitest';

const siteConfigMocks = vi.hoisted(() => ({
  listHotelMedia: vi.fn(),
  deleteHotelMedia: vi.fn(),
  setHotelMediaHero: vi.fn(),
}));

vi.mock('./d1/siteConfig', () => siteConfigMocks);

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const MEDIA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const SAMPLE_MEDIA = {
  id: MEDIA_ID,
  hotelId: HOME_HOTEL,
  url: '/media/hotel-media/test.jpg',
  caption: 'Test image',
  isHero: true,
  displayOrder: 0,
  createdAt: new Date(),
};

function caller(role: 'super_admin' | 'admin' | 'hotel_owner' | 'revenue_manager' | 'front_desk') {
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
        memberships: [{ hotelId: HOME_HOTEL, role }],
      },
      db: {} as any,
      caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], access: 'authenticated' } as any,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  siteConfigMocks.listHotelMedia.mockResolvedValue([SAMPLE_MEDIA]);
  siteConfigMocks.deleteHotelMedia.mockResolvedValue({ id: MEDIA_ID, url: SAMPLE_MEDIA.url });
  siteConfigMocks.setHotelMediaHero.mockResolvedValue(undefined);
});

describe('hotel media router permissions (D1)', () => {
  it('hotel_owner can list, delete, and set hero for their hotel', async () => {
    const app = await caller('hotel_owner');

    const list = await app.channelManager.listHotelMedia({ hotel_id: HOME_HOTEL });
    expect(list).toHaveLength(1);
    expect(siteConfigMocks.listHotelMedia).toHaveBeenCalledOnce();

    const hero = await app.channelManager.setHotelMediaHero({ hotel_id: HOME_HOTEL, media_id: MEDIA_ID });
    expect(hero).toEqual({ success: true });
    expect(siteConfigMocks.setHotelMediaHero).toHaveBeenCalledOnce();

    const deleted = await app.channelManager.deleteHotelMedia({ hotel_id: HOME_HOTEL, media_id: MEDIA_ID });
    expect(deleted).toEqual({ id: MEDIA_ID });
    expect(siteConfigMocks.deleteHotelMedia).toHaveBeenCalledOnce();
  });

  it('front_desk can list media (property.view) but cannot delete or set hero', async () => {
    const app = await caller('front_desk');

    const list = await app.channelManager.listHotelMedia({ hotel_id: HOME_HOTEL });
    expect(list).toHaveLength(1);

    await expect(app.channelManager.deleteHotelMedia({ hotel_id: HOME_HOTEL, media_id: MEDIA_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.channelManager.setHotelMediaHero({ hotel_id: HOME_HOTEL, media_id: MEDIA_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('revenue_manager can list (has property.view) but cannot delete or set hero', async () => {
    const app = await caller('revenue_manager');

    const list = await app.channelManager.listHotelMedia({ hotel_id: HOME_HOTEL });
    expect(list).toHaveLength(1);

    await expect(app.channelManager.deleteHotelMedia({ hotel_id: HOME_HOTEL, media_id: MEDIA_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.channelManager.setHotelMediaHero({ hotel_id: HOME_HOTEL, media_id: MEDIA_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('super_admin bypasses hotel permission and can list/delete/set hero', async () => {
    const app = await caller('super_admin');

    const list = await app.channelManager.listHotelMedia({ hotel_id: HOME_HOTEL });
    expect(list).toHaveLength(1);

    await expect(app.channelManager.setHotelMediaHero({ hotel_id: HOME_HOTEL, media_id: MEDIA_ID })).resolves.toMatchObject({ success: true });
    await expect(app.channelManager.deleteHotelMedia({ hotel_id: HOME_HOTEL, media_id: MEDIA_ID })).resolves.toMatchObject({ id: MEDIA_ID });
  });

  it('uploadHotelMedia is disabled in tRPC and points callers to the /api/media endpoint', async () => {
    const app = await caller('hotel_owner');
    await expect(app.channelManager.uploadHotelMedia({
      hotel_id: HOME_HOTEL,
      base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB',
      filename: 'test.jpg',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST', message: /\/api\/media/ });
  });
});
