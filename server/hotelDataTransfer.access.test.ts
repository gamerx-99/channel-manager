import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveMembershipPermissions } from '@shared/permissions';

const transferMocks = vi.hoisted(() => ({ exportHotelSetup: vi.fn(), previewHotelSetupImport: vi.fn(), applyHotelSetupImport: vi.fn() }));
vi.mock('./d1/hotelDataTransfer', () => transferMocks);
const hotelId = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
function caller(role: 'hotel_owner' | 'front_desk') {
  const permissions = resolveMembershipPermissions(role);
  return import('./routers').then(({ appRouter }) => appRouter.createCaller({
    req: {} as Request, res: {} as Response, db: {} as any,
    user: { id: 'owner-a', email: 'owner@example.test', name: 'Owner', accessToken: 'test-token', appMetadata: {}, userMetadata: {}, role, roles: [role], memberships: [{ hotelId, role, permissions }] },
    caller: { userId: 'owner-a', roles: [role], access: 'authenticated' } as any,
  }));
}

beforeEach(() => vi.clearAllMocks());
describe('hotel data transfer permission gates', () => {
  it('requires hotel profile management for export, preview and apply', async () => {
    const app = await caller('front_desk');
    await expect(app.channelManager.exportHotelData({ hotel_id: hotelId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.channelManager.previewHotelImport({ hotel_id: hotelId, file: {} })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.channelManager.applyHotelImport({ hotel_id: hotelId, file: {} })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(transferMocks.exportHotelSetup).not.toHaveBeenCalled();
    expect(transferMocks.previewHotelSetupImport).not.toHaveBeenCalled();
    expect(transferMocks.applyHotelSetupImport).not.toHaveBeenCalled();
  });

  it("routes an authorized owner's requests through the scoped D1 procedures", async () => {
    transferMocks.exportHotelSetup.mockResolvedValueOnce({ format: 'hayhost-hotel', version: 1 });
    transferMocks.previewHotelSetupImport.mockResolvedValueOnce({ changes: [] });
    transferMocks.applyHotelSetupImport.mockResolvedValueOnce({ applied: true });
    const app = await caller('hotel_owner');
    await expect(app.channelManager.exportHotelData({ hotel_id: hotelId })).resolves.toMatchObject({ version: 1 });
    await expect(app.channelManager.previewHotelImport({ hotel_id: hotelId, file: {} })).resolves.toEqual({ changes: [] });
    await expect(app.channelManager.applyHotelImport({ hotel_id: hotelId, file: {} })).resolves.toEqual({ applied: true });
    expect(transferMocks.exportHotelSetup).toHaveBeenCalled();
    expect(transferMocks.previewHotelSetupImport).toHaveBeenCalled();
    expect(transferMocks.applyHotelSetupImport).toHaveBeenCalled();
  });
});
