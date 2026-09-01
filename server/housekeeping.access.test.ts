import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getManagedHotel: vi.fn(),
  createHousekeepingTask: vi.fn(),
  listHousekeepingTasks: vi.fn(),
  updateHousekeepingTaskStatus: vi.fn(),
}));
const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(() => ({ mocked: true })),
}));

vi.mock('./db', () => dbMocks);
vi.mock('./supabase', () => supabaseMocks);

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const ROOM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOOKING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TASK_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getManagedHotel.mockResolvedValue({
    id: HOME_HOTEL,
    name: 'Test Hotel',
    room_types: [],
    rooms: [{ id: ROOM_ID, room_type_id: 'rt-1', room_number: '101', status: 'available' }],
  });
  dbMocks.createHousekeepingTask.mockResolvedValue({
    id: TASK_ID,
    room_id: ROOM_ID,
    booking_id: null,
    assigned_to: null,
    due_date: '2026-09-01',
    status: 'pending',
    created_at: new Date().toISOString(),
  });
  dbMocks.listHousekeepingTasks.mockResolvedValue([]);
  dbMocks.updateHousekeepingTaskStatus.mockResolvedValue({
    id: TASK_ID,
    room_id: ROOM_ID,
    booking_id: null,
    assigned_to: null,
    due_date: '2026-09-01',
    status: 'done',
    created_at: new Date().toISOString(),
  });
});

function caller(role: 'super_admin' | 'admin' | 'hotel_owner' | 'revenue_manager' | 'front_desk' | 'housekeeping') {
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

const validCreateInput = {
  hotel_id: HOME_HOTEL,
  room_id: ROOM_ID,
  due_date: '2026-09-01' as const,
  status: 'pending' as const,
};

describe('housekeeping tasks access — housekeeping.view/update_room_status', () => {
  it('lets housekeeping role list, create, and update tasks', async () => {
    const app = await caller('housekeeping');

    await expect(app.channelManager.listHousekeepingTasks({ hotel_id: HOME_HOTEL })).resolves.toEqual([]);
    expect(dbMocks.listHousekeepingTasks).toHaveBeenCalledWith({ mocked: true }, { hotel_id: HOME_HOTEL });

    await expect(app.channelManager.createHousekeepingTask(validCreateInput)).resolves.toMatchObject({ id: TASK_ID });
    expect(dbMocks.createHousekeepingTask).toHaveBeenCalledOnce();

    await expect(
      app.channelManager.updateHousekeepingTaskStatus({ hotel_id: HOME_HOTEL, task_id: TASK_ID, status: 'done' }),
    ).resolves.toMatchObject({ status: 'done' });
    expect(dbMocks.updateHousekeepingTaskStatus).toHaveBeenCalledWith({ mocked: true }, { task_id: TASK_ID, status: 'done' });
  });

  it('lets hotel_owner manage housekeeping tasks', async () => {
    const app = await caller('hotel_owner');

    await expect(app.channelManager.createHousekeepingTask(validCreateInput)).resolves.toMatchObject({ id: TASK_ID });
    await expect(app.channelManager.listHousekeepingTasks({ hotel_id: HOME_HOTEL })).resolves.toEqual([]);
    await expect(
      app.channelManager.updateHousekeepingTaskStatus({ hotel_id: HOME_HOTEL, task_id: TASK_ID, status: 'in_progress' }),
    ).resolves.toMatchObject({ status: 'done' });
  });

  it('lets super_admin bypass hotel permission for housekeeping tasks', async () => {
    const app = await caller('super_admin');

    await expect(app.channelManager.listHousekeepingTasks({ hotel_id: HOME_HOTEL })).resolves.toEqual([]);
    expect(dbMocks.listHousekeepingTasks).toHaveBeenCalledOnce();

    await expect(app.channelManager.createHousekeepingTask(validCreateInput)).resolves.toMatchObject({ id: TASK_ID });
    expect(dbMocks.createHousekeepingTask).toHaveBeenCalledOnce();
  });

  it('lets front_desk and admin view but not create/update', async () => {
    for (const role of ['front_desk', 'admin'] as const) {
      vi.clearAllMocks();
      dbMocks.getManagedHotel.mockResolvedValue({
        id: HOME_HOTEL,
        name: 'Test Hotel',
        room_types: [],
        rooms: [{ id: ROOM_ID, room_type_id: 'rt-1', room_number: '101', status: 'available' }],
      });
      dbMocks.listHousekeepingTasks.mockResolvedValue([]);
      const app = await caller(role);

      await expect(app.channelManager.listHousekeepingTasks({ hotel_id: HOME_HOTEL })).resolves.toEqual([]);
      await expect(app.channelManager.createHousekeepingTask(validCreateInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        app.channelManager.updateHousekeepingTaskStatus({ hotel_id: HOME_HOTEL, task_id: TASK_ID, status: 'done' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    // No successful create/update should have slipped through after the loop
  });

  it('denies revenue_manager for all housekeeping operations', async () => {
    const app = await caller('revenue_manager');

    await expect(app.channelManager.listHousekeepingTasks({ hotel_id: HOME_HOTEL })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.channelManager.createHousekeepingTask(validCreateInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      app.channelManager.updateHousekeepingTaskStatus({ hotel_id: HOME_HOTEL, task_id: TASK_ID, status: 'done' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(dbMocks.listHousekeepingTasks).not.toHaveBeenCalled();
    expect(dbMocks.createHousekeepingTask).not.toHaveBeenCalled();
    expect(dbMocks.updateHousekeepingTaskStatus).not.toHaveBeenCalled();
  });

  it('passes booking_id to db layer and returns derived due_date from the db result', async () => {
    // Due_date derivation from booking.check_out was moved from the router to createHousekeepingTask
    // in db.ts (Phase 1C refactor). The router now passes due_date: null and relies on db.ts to
    // derive it from the booking. This test verifies the router passes the right args to the db
    // function and returns whatever the db function resolves with (including derived due_date).
    const checkOutDate = '2026-09-15';
    dbMocks.createHousekeepingTask.mockResolvedValueOnce({
      id: TASK_ID,
      room_id: ROOM_ID,
      booking_id: BOOKING_ID,
      assigned_to: null,
      due_date: checkOutDate,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    const app = await caller('housekeeping');
    await expect(
      app.channelManager.createHousekeepingTask({
        hotel_id: HOME_HOTEL,
        room_id: ROOM_ID,
        booking_id: BOOKING_ID,
        // due_date intentionally omitted — db.ts derives it from booking.check_out
      }),
    ).resolves.toMatchObject({ due_date: checkOutDate });

    // Router passes due_date: null; derivation is the db layer's responsibility
    expect(dbMocks.createHousekeepingTask).toHaveBeenCalledWith(
      expect.objectContaining({ mocked: true }),
      expect.objectContaining({ room_id: ROOM_ID, booking_id: BOOKING_ID, due_date: null }),
    );
  });

  it('returns NOT_FOUND when updating a non-existent task', async () => {
    dbMocks.updateHousekeepingTaskStatus.mockResolvedValueOnce(null);
    const app = await caller('housekeeping');

    await expect(
      app.channelManager.updateHousekeepingTaskStatus({ hotel_id: HOME_HOTEL, task_id: TASK_ID, status: 'done' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
