import { hotelUsers } from '../drizzle/d1-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const housekeepingMocks = vi.hoisted(() => ({
  createHousekeepingTask: vi.fn(),
  listHousekeepingTasks: vi.fn(),
  updateHousekeepingTaskStatus: vi.fn(),
}));

vi.mock('./d1/housekeeping', () => housekeepingMocks);

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const ROOM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TASK_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function makeDb(role: string) {
  const membership = { hotelId: HOME_HOTEL, role, permissionGrants: null, permissionRevokes: null, userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322' };
  return {
    select: (..._cols: any[]) => ({
      from: (table: any) => {
        if (table === hotelUsers) return { where: async () => [membership] };
        return { where: () => ({ limit: async () => [] }) };
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  housekeepingMocks.listHousekeepingTasks.mockResolvedValue([]);
  housekeepingMocks.createHousekeepingTask.mockResolvedValue({ id: TASK_ID, room_id: ROOM_ID, status: 'pending', due_date: '2026-09-01' });
  housekeepingMocks.updateHousekeepingTaskStatus.mockResolvedValue({ id: TASK_ID, status: 'done' });
});

function caller(role: string) {
  return import('./routers').then(({ appRouter }) => appRouter.createCaller({
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
    db: makeDb(role) as any,
    caller: { userId: 'd93900a0-e7fe-45d6-9364-80ea8a035322', roles: [role], memberships: [{ hotelId: HOME_HOTEL, role }], access: 'authenticated' } as any,
  }));
}

describe('housekeeping tasks access', () => {
  it('denies revenue_manager for all operations', async () => {
    const app = await caller('revenue_manager');
    await expect(app.channelManager.listHousekeepingTasks({ hotel_id: HOME_HOTEL })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.channelManager.createHousekeepingTask({ hotel_id: HOME_HOTEL, room_id: ROOM_ID, due_date: '2026-09-01', status: 'pending' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.channelManager.updateHousekeepingTaskStatus({ hotel_id: HOME_HOTEL, task_id: TASK_ID, status: 'done' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows housekeeping role to list and create', async () => {
    const app = await caller('housekeeping');
    await expect(app.channelManager.listHousekeepingTasks({ hotel_id: HOME_HOTEL })).resolves.toEqual([]);
    await expect(app.channelManager.createHousekeepingTask({ hotel_id: HOME_HOTEL, room_id: ROOM_ID, due_date: '2026-09-01', status: 'pending' })).resolves.toMatchObject({ id: TASK_ID });
  });

  it('returns NOT_FOUND when updating a non-existent task', async () => {
    housekeepingMocks.updateHousekeepingTaskStatus.mockResolvedValueOnce(null);
    const app = await caller('housekeeping');
    await expect(app.channelManager.updateHousekeepingTaskStatus({ hotel_id: HOME_HOTEL, task_id: TASK_ID, status: 'done' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

