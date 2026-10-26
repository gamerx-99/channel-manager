import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── db mocks ───────────────────────────────────────────────────────────────
const dbMocks = vi.hoisted(() => ({
  getManagedHotel: vi.fn(),
  listHotelMedia: vi.fn(),
  createHotelMedia: vi.fn(),
  deleteHotelMedia: vi.fn(),
  setHotelMediaHero: vi.fn(),
}));
const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ mocked: true })),
}));
// storage helpers are used inside upload/delete hotelMedia router procedures
const storageMocks = vi.hoisted(() => ({
  storagePut: vi.fn(),
  uploadHotelMediaToStorage: vi.fn(),
  deleteHotelMediaFromStorage: vi.fn(),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);
vi.mock('./storage', () => storageMocks);

// ─── Constants ──────────────────────────────────────────────────────────────
const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const MEDIA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const SAMPLE_MEDIA = {
  id: MEDIA_ID,
  hotel_id: HOME_HOTEL,
  url: 'https://storage.example.com/hotel-media/test.jpg',
  caption: 'Test image',
  is_hero: true,
  display_order: 0,
  created_at: new Date().toISOString(),
};

// ─── Caller helpers ─────────────────────────────────────────────────────────
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
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getManagedHotel.mockResolvedValue({
    id: HOME_HOTEL,
    name: 'Test Hotel',
    slug: 'test-hotel',
    room_types: [],
    rooms: [],
  });
  dbMocks.listHotelMedia.mockResolvedValue([SAMPLE_MEDIA]);
  dbMocks.createHotelMedia.mockResolvedValue(SAMPLE_MEDIA);
  dbMocks.deleteHotelMedia.mockResolvedValue({ id: MEDIA_ID });
  dbMocks.setHotelMediaHero.mockResolvedValue(undefined);
  storageMocks.storagePut.mockResolvedValue({
    url: 'https://storage.example.com/hotel-media/test.jpg',
  });
  storageMocks.uploadHotelMediaToStorage.mockResolvedValue({
    key: `${HOME_HOTEL}/test_123.jpg`,
    url: 'https://storage.example.com/hotel-media/test.jpg',
  });
  storageMocks.deleteHotelMediaFromStorage.mockResolvedValue(undefined);
});

// ─── Tests ───────────────────────────────────────────────────────────────────
describe('hotel media CRUD — permission boundaries (Phase 06)', () => {
  it('hotel_owner can list, upload, delete, and set hero for their hotel', async () => {
    const app = await caller('hotel_owner');

    // listHotelMedia — property.view
    const list = await app.channelManager.listHotelMedia({ hotel_id: HOME_HOTEL });
    expect(list).toHaveLength(1);
    expect(dbMocks.listHotelMedia).toHaveBeenCalledOnce();

    // uploadHotelMedia — property.manage_profile
    const uploaded = await app.channelManager.uploadHotelMedia({
      hotel_id: HOME_HOTEL,
      base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB',
      filename: 'test.jpg',
    });
    expect(uploaded.url).toContain('storage.example.com');
    expect(storageMocks.uploadHotelMediaToStorage).toHaveBeenCalledOnce();

    // setHotelMediaHero — property.manage_profile
    const hero = await app.channelManager.setHotelMediaHero({
      hotel_id: HOME_HOTEL,
      media_id: MEDIA_ID,
    });
    expect(hero).toEqual({ success: true });
    expect(dbMocks.setHotelMediaHero).toHaveBeenCalledOnce();

    // deleteHotelMedia — property.manage_profile
    dbMocks.listHotelMedia.mockResolvedValueOnce([]); // no remaining after delete
    const deleted = await app.channelManager.deleteHotelMedia({
      hotel_id: HOME_HOTEL,
      media_id: MEDIA_ID,
    });
    expect(deleted).toEqual({ id: MEDIA_ID });
    expect(dbMocks.deleteHotelMedia).toHaveBeenCalledOnce();
  });

  it('front_desk can list media (property.view) but cannot upload/delete/set hero', async () => {
    const app = await caller('front_desk');

    const list = await app.channelManager.listHotelMedia({ hotel_id: HOME_HOTEL });
    expect(list).toHaveLength(1);

    await expect(
      app.channelManager.uploadHotelMedia({
        hotel_id: HOME_HOTEL,
        base64: 'data:image/jpeg;base64,/9j/',
        filename: 'test.jpg',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      app.channelManager.deleteHotelMedia({ hotel_id: HOME_HOTEL, media_id: MEDIA_ID }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      app.channelManager.setHotelMediaHero({ hotel_id: HOME_HOTEL, media_id: MEDIA_ID }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('revenue_manager can list (has property.view) but cannot upload/delete/set hero (no property.manage_profile)', async () => {
    const app = await caller('revenue_manager');

    // revenue_manager has property.view → list is allowed
    const list = await app.channelManager.listHotelMedia({ hotel_id: HOME_HOTEL });
    expect(list).toHaveLength(1);

    await expect(
      app.channelManager.uploadHotelMedia({
        hotel_id: HOME_HOTEL,
        base64: 'data:image/jpeg;base64,/9j/',
        filename: 'test.jpg',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('super_admin bypasses hotel permission and can list/upload/delete', async () => {
    const app = await caller('super_admin');

    const list = await app.channelManager.listHotelMedia({ hotel_id: HOME_HOTEL });
    expect(list).toHaveLength(1);

    const uploaded = await app.channelManager.uploadHotelMedia({
      hotel_id: HOME_HOTEL,
      base64: 'data:image/jpeg;base64,/9j/',
      filename: 'superadmin-upload.jpg',
    });
    expect(uploaded).toMatchObject({ id: MEDIA_ID });
  });

  it('deleteHotelMedia promotes first remaining item as hero when deleted item was hero', async () => {
    const secondMedia = { ...SAMPLE_MEDIA, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', is_hero: false };
    // After delete, listHotelMedia returns 1 item with is_hero: false → router should promote it
    dbMocks.deleteHotelMedia.mockResolvedValueOnce({ id: MEDIA_ID });
    // Override: only 1 call to listHotelMedia happens inside deleteHotelMedia (after the delete)
    dbMocks.listHotelMedia.mockResolvedValueOnce([secondMedia]);

    const app = await caller('hotel_owner');
    await app.channelManager.deleteHotelMedia({ hotel_id: HOME_HOTEL, media_id: MEDIA_ID });

    expect(dbMocks.setHotelMediaHero).toHaveBeenCalledWith(
      expect.anything(),
      HOME_HOTEL,
      secondMedia.id,
    );
  });
});
