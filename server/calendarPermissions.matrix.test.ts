import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@shared/authorization';

vi.setConfig({ testTimeout: 10000 });

// Hoisted mocks for D1 repositories
const availabilityMocks = vi.hoisted(() => ({
  listAvailabilityForHotel: vi.fn(),
  listBookingOccupancyForHotel: vi.fn(),
  updateAvailability: vi.fn(),
  updateAvailabilityBatch: vi.fn(),
  createRateOverride: vi.fn(),
  listRateOverrides: vi.fn(),
  deleteRateOverride: vi.fn(),
  saveCalendarRange: vi.fn(),
  listCalendarForHotel: vi.fn(),
}));

const hotelMocks = vi.hoisted(() => ({
  getManagedHotel: vi.fn(),
}));

vi.mock('./d1/availability', () => availabilityMocks);
vi.mock('./d1/hotel', () => hotelMocks);

import { appRouter } from './routers';

const HOME_HOTEL = '88ed76e4-cc93-4aa7-9c4d-30999d35ada4';
const FOREIGN_HOTEL = 'e1d6de3a-8e35-40a2-bcc5-0de1b548ad3a';
const ROOM_TYPE_ID = 'f1a1b1c1-d1e1-41f1-81f1-111111111111';

export type MatrixProfile =
  | 'owner'
  | 'staff_no_permissions'
  | 'staff_empty'
  | 'staff_rate_only'
  | 'staff_allotment_only'
  | 'staff_stop_sell_only'
  | 'staff_rate_and_allotment';

function createCaller(profile: MatrixProfile, targetMembershipHotelId = HOME_HOTEL) {
  let role: 'hotel_owner' | 'front_desk' = 'front_desk';
  let permissions: Permission[] | undefined;

  switch (profile) {
    case 'owner':
      role = 'hotel_owner';
      permissions = undefined; // Full role permissions from ROLE_PERMISSIONS.hotel_owner
      break;
    case 'staff_no_permissions':
      role = 'front_desk';
      permissions = ['property.view', 'operations.view_bookings'];
      break;
    case 'staff_empty':
      role = 'front_desk';
      permissions = [];
      break;
    case 'staff_rate_only':
      role = 'front_desk';
      permissions = ['property.view', 'revenue.manage_rates'];
      break;
    case 'staff_allotment_only':
      role = 'front_desk';
      permissions = ['property.view', 'revenue.manage_allotment'];
      break;
    case 'staff_stop_sell_only':
      role = 'front_desk';
      permissions = ['property.view', 'revenue.manage_stop_sell'];
      break;
    case 'staff_rate_and_allotment':
      role = 'front_desk';
      permissions = ['property.view', 'revenue.manage_rates', 'revenue.manage_allotment'];
      break;
  }

  return appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: {
      id: `user-${profile}`,
      email: `${profile}@example.com`,
      name: `User ${profile}`,
      accessToken: `${profile}-access-token`,
      appMetadata: {},
      userMetadata: {},
      role,
      roles: [role],
      memberships: [{
        hotelId: targetMembershipHotelId,
        role,
        ...(permissions !== undefined ? { permissions } : {}),
      }],
    },
    db: {} as any,
    caller: { userId: `user-${profile}`, roles: [role], access: 'authenticated' } as any,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hotelMocks.getManagedHotel.mockResolvedValue({
    id: HOME_HOTEL,
    room_types: [{ id: ROOM_TYPE_ID }],
    rooms: [
      { id: 'room-1', room_type_id: ROOM_TYPE_ID },
      { id: 'room-2', room_type_id: ROOM_TYPE_ID },
    ],
  });

  availabilityMocks.updateAvailability.mockResolvedValue({
    id: 'availability-1',
    roomTypeId: ROOM_TYPE_ID,
    date: '2026-08-20',
    price: '2500.00',
    roomsAvailable: 1,
  });

  availabilityMocks.updateAvailabilityBatch.mockResolvedValue({
    rows: 10,
    roomTypes: 1,
    days: 10,
    roomsAvailable: 1,
  });

  availabilityMocks.saveCalendarRange.mockResolvedValue({
    success: true as const,
  });

  availabilityMocks.createRateOverride.mockResolvedValue({
    id: 'override-1',
    roomTypeId: ROOM_TYPE_ID,
    startDate: '2026-08-20',
    endDate: '2026-08-25',
    overridePrice: '2500.00',
    minStayNights: 2,
    createdAt: new Date(),
  });

  availabilityMocks.deleteRateOverride.mockResolvedValue({
    id: 'override-1',
  });

  availabilityMocks.listRateOverrides.mockResolvedValue([]);
});

describe('Calendar Permissions Matrix & Access Boundaries', () => {

  // =========================================================================
  // 1. Single-Day Availability Matrix (updateAvailability)
  // =========================================================================
  describe('Single-Day Operations: channelManager.updateAvailability', () => {
    const basePayload = {
      hotel_id: HOME_HOTEL,
      room_type_id: ROOM_TYPE_ID,
      date: '2026-08-20',
      price: 2500,
    };

    it.each([
      { profile: 'owner' as const, action: 'rate' as const, rooms: 1, expected: 'allow' },
      { profile: 'owner' as const, action: 'allotment' as const, rooms: 1, expected: 'allow' },
      { profile: 'owner' as const, action: 'stop_sell' as const, rooms: 0, expected: 'allow' },

      { profile: 'staff_no_permissions' as const, action: 'rate' as const, rooms: 1, expected: 'deny' },
      { profile: 'staff_no_permissions' as const, action: 'allotment' as const, rooms: 1, expected: 'deny' },
      { profile: 'staff_no_permissions' as const, action: 'stop_sell' as const, rooms: 0, expected: 'deny' },

      { profile: 'staff_empty' as const, action: 'rate' as const, rooms: 1, expected: 'deny' },
      { profile: 'staff_empty' as const, action: 'allotment' as const, rooms: 1, expected: 'deny' },
      { profile: 'staff_empty' as const, action: 'stop_sell' as const, rooms: 0, expected: 'deny' },

      { profile: 'staff_rate_only' as const, action: 'rate' as const, rooms: 1, expected: 'allow' },
      { profile: 'staff_rate_only' as const, action: 'allotment' as const, rooms: 1, expected: 'deny' },
      { profile: 'staff_rate_only' as const, action: 'stop_sell' as const, rooms: 0, expected: 'deny' },

      { profile: 'staff_allotment_only' as const, action: 'rate' as const, rooms: 1, expected: 'deny' },
      { profile: 'staff_allotment_only' as const, action: 'allotment' as const, rooms: 1, expected: 'allow' },
      { profile: 'staff_allotment_only' as const, action: 'stop_sell' as const, rooms: 0, expected: 'deny' },

      { profile: 'staff_stop_sell_only' as const, action: 'rate' as const, rooms: 1, expected: 'deny' },
      { profile: 'staff_stop_sell_only' as const, action: 'allotment' as const, rooms: 1, expected: 'deny' },
      { profile: 'staff_stop_sell_only' as const, action: 'stop_sell' as const, rooms: 0, expected: 'allow' },

      { profile: 'staff_rate_and_allotment' as const, action: 'rate' as const, rooms: 1, expected: 'allow' },
      { profile: 'staff_rate_and_allotment' as const, action: 'allotment' as const, rooms: 1, expected: 'allow' },
      { profile: 'staff_rate_and_allotment' as const, action: 'stop_sell' as const, rooms: 0, expected: 'deny' },
    ])('$profile executing action: $action -> $expected', async ({ profile, action, rooms, expected }) => {
      const caller = createCaller(profile);
      const promise = caller.channelManager.updateAvailability({
        ...basePayload,
        action,
        rooms_available: rooms,
      });

      if (expected === 'allow') {
        await expect(promise).resolves.toMatchObject({ id: 'availability-1' });
        expect(availabilityMocks.updateAvailability).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ action, roomsAvailable: rooms }),
        );
      } else {
        await expect(promise).rejects.toMatchObject({ code: 'FORBIDDEN' });
        expect(availabilityMocks.updateAvailability).not.toHaveBeenCalled();
      }
    });
  });

  // =========================================================================
  // 2. Batch Availability Matrix (updateAvailabilityBatch)
  // =========================================================================
  describe('Batch Operations: channelManager.updateAvailabilityBatch', () => {
    const baseBatch = {
      hotel_id: HOME_HOTEL,
      room_type_ids: [ROOM_TYPE_ID],
      start_date: '2026-12-01',
      end_date: '2026-12-10',
    };

    it.each([
      { profile: 'owner' as const, rooms: 2, desc: 'allotment (>0)', expected: 'allow' },
      { profile: 'owner' as const, rooms: 0, desc: 'stop_sell (=0)', expected: 'allow' },

      { profile: 'staff_no_permissions' as const, rooms: 2, desc: 'allotment (>0)', expected: 'deny' },
      { profile: 'staff_no_permissions' as const, rooms: 0, desc: 'stop_sell (=0)', expected: 'deny' },

      { profile: 'staff_empty' as const, rooms: 2, desc: 'allotment (>0)', expected: 'deny' },
      { profile: 'staff_empty' as const, rooms: 0, desc: 'stop_sell (=0)', expected: 'deny' },

      { profile: 'staff_rate_only' as const, rooms: 2, desc: 'allotment (>0)', expected: 'deny' },
      { profile: 'staff_rate_only' as const, rooms: 0, desc: 'stop_sell (=0)', expected: 'deny' },

      { profile: 'staff_allotment_only' as const, rooms: 2, desc: 'allotment (>0)', expected: 'allow' },
      { profile: 'staff_allotment_only' as const, rooms: 0, desc: 'stop_sell (=0)', expected: 'deny' },

      { profile: 'staff_stop_sell_only' as const, rooms: 2, desc: 'allotment (>0)', expected: 'deny' },
      { profile: 'staff_stop_sell_only' as const, rooms: 0, desc: 'stop_sell (=0)', expected: 'allow' },

      { profile: 'staff_rate_and_allotment' as const, rooms: 2, desc: 'allotment (>0)', expected: 'allow' },
      { profile: 'staff_rate_and_allotment' as const, rooms: 0, desc: 'stop_sell (=0)', expected: 'deny' },
    ])('$profile batch update for $desc -> $expected', async ({ profile, rooms, expected }) => {
      const caller = createCaller(profile);
      const promise = caller.channelManager.updateAvailabilityBatch({
        ...baseBatch,
        rooms_available: rooms,
      });

      if (expected === 'allow') {
        await expect(promise).resolves.toMatchObject({ rows: 10 });
        expect(availabilityMocks.updateAvailabilityBatch).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ roomsAvailable: rooms }),
        );
      } else {
        await expect(promise).rejects.toMatchObject({ code: 'FORBIDDEN' });
        expect(availabilityMocks.updateAvailabilityBatch).not.toHaveBeenCalled();
      }
    });
  });

  // =========================================================================
  // 3. Date Range Single-Field Matrix (saveCalendarRange)
  // =========================================================================
  describe('Date Range Operations: channelManager.saveCalendarRange single-field matrix', () => {
    const baseRange = {
      hotel_id: HOME_HOTEL,
      room_type_ids: [ROOM_TYPE_ID],
      start_date: '2026-12-01',
      end_date: '2026-12-05',
    };

    it.each([
      // Owner: allows all single-field shapes
      { profile: 'owner' as const, field: 'price', payload: { price: 1500 }, expected: 'allow' },
      { profile: 'owner' as const, field: 'min_stay_nights', payload: { min_stay_nights: 2 }, expected: 'allow' },
      { profile: 'owner' as const, field: 'base', payload: { base: true }, expected: 'allow' },
      { profile: 'owner' as const, field: 'rooms_available (>0)', payload: { rooms_available: 2 }, expected: 'allow' },
      { profile: 'owner' as const, field: 'rooms_available (=0 stop sell)', payload: { rooms_available: 0 }, expected: 'allow' },

      // Staff No Permissions / Empty: denies all
      { profile: 'staff_no_permissions' as const, field: 'price', payload: { price: 1500 }, expected: 'deny' },
      { profile: 'staff_no_permissions' as const, field: 'rooms_available', payload: { rooms_available: 2 }, expected: 'deny' },
      { profile: 'staff_empty' as const, field: 'price', payload: { price: 1500 }, expected: 'deny' },
      { profile: 'staff_empty' as const, field: 'rooms_available', payload: { rooms_available: 2 }, expected: 'deny' },

      // Rate-Only: allows rate touchpoints, denies allotment & stop-sell
      { profile: 'staff_rate_only' as const, field: 'price', payload: { price: 1500 }, expected: 'allow' },
      { profile: 'staff_rate_only' as const, field: 'min_stay_nights', payload: { min_stay_nights: 2 }, expected: 'allow' },
      { profile: 'staff_rate_only' as const, field: 'base', payload: { base: true }, expected: 'allow' },
      { profile: 'staff_rate_only' as const, field: 'rooms_available (>0)', payload: { rooms_available: 2 }, expected: 'deny' },
      { profile: 'staff_rate_only' as const, field: 'rooms_available (=0)', payload: { rooms_available: 0 }, expected: 'deny' },

      // Allotment-Only: allows allotment > 0, denies rate touchpoints & stop-sell (=0)
      { profile: 'staff_allotment_only' as const, field: 'price', payload: { price: 1500 }, expected: 'deny' },
      { profile: 'staff_allotment_only' as const, field: 'min_stay_nights', payload: { min_stay_nights: 2 }, expected: 'deny' },
      { profile: 'staff_allotment_only' as const, field: 'base', payload: { base: true }, expected: 'deny' },
      { profile: 'staff_allotment_only' as const, field: 'rooms_available (>0)', payload: { rooms_available: 2 }, expected: 'allow' },
      { profile: 'staff_allotment_only' as const, field: 'rooms_available (=0)', payload: { rooms_available: 0 }, expected: 'deny' },

      // Stop-Sell-Only: allows stop sell (=0), denies rate touchpoints & allotment > 0
      { profile: 'staff_stop_sell_only' as const, field: 'price', payload: { price: 1500 }, expected: 'deny' },
      { profile: 'staff_stop_sell_only' as const, field: 'min_stay_nights', payload: { min_stay_nights: 2 }, expected: 'deny' },
      { profile: 'staff_stop_sell_only' as const, field: 'rooms_available (>0)', payload: { rooms_available: 2 }, expected: 'deny' },
      { profile: 'staff_stop_sell_only' as const, field: 'rooms_available (=0)', payload: { rooms_available: 0 }, expected: 'allow' },

      // Rate + Allotment: allows rate touchpoints & allotment > 0, denies stop-sell (=0)
      { profile: 'staff_rate_and_allotment' as const, field: 'price', payload: { price: 1500 }, expected: 'allow' },
      { profile: 'staff_rate_and_allotment' as const, field: 'min_stay_nights', payload: { min_stay_nights: 2 }, expected: 'allow' },
      { profile: 'staff_rate_and_allotment' as const, field: 'rooms_available (>0)', payload: { rooms_available: 2 }, expected: 'allow' },
      { profile: 'staff_rate_and_allotment' as const, field: 'rooms_available (=0)', payload: { rooms_available: 0 }, expected: 'deny' },
    ])('$profile sending $field -> $expected', async ({ profile, payload, expected }) => {
      const caller = createCaller(profile);
      const promise = caller.channelManager.saveCalendarRange({
        ...baseRange,
        ...payload,
      });

      if (expected === 'allow') {
        await expect(promise).resolves.toEqual({ success: true });
        expect(availabilityMocks.saveCalendarRange).toHaveBeenCalledTimes(1);
      } else {
        await expect(promise).rejects.toMatchObject({ code: 'FORBIDDEN' });
        expect(availabilityMocks.saveCalendarRange).not.toHaveBeenCalled();
      }
    });
  });

  // =========================================================================
  // 4. Multi-Field Partial Permission Rejection (saveCalendarRange)
  // =========================================================================
  describe('Multi-Field Atomic Rejection: channelManager.saveCalendarRange', () => {
    const range = {
      hotel_id: HOME_HOTEL,
      room_type_ids: [ROOM_TYPE_ID],
      start_date: '2026-12-01',
      end_date: '2026-12-05',
    };

    it('rejects multi-field payload (Price + Allotment) when caller only has rate permission', async () => {
      const caller = createCaller('staff_rate_only');
      await expect(caller.channelManager.saveCalendarRange({
        ...range,
        price: 1500,
        rooms_available: 2,
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(availabilityMocks.saveCalendarRange).not.toHaveBeenCalled();
    });

    it('rejects multi-field payload (Price + Allotment) when caller only has allotment permission', async () => {
      const caller = createCaller('staff_allotment_only');
      await expect(caller.channelManager.saveCalendarRange({
        ...range,
        price: 1500,
        rooms_available: 2,
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(availabilityMocks.saveCalendarRange).not.toHaveBeenCalled();
    });

    it('allows multi-field payload (Price + Allotment) when caller has combined rate + allotment permissions', async () => {
      const caller = createCaller('staff_rate_and_allotment');
      await expect(caller.channelManager.saveCalendarRange({
        ...range,
        price: 1500,
        rooms_available: 2,
      })).resolves.toEqual({ success: true });
      expect(availabilityMocks.saveCalendarRange).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ price: '1500', roomsAvailable: 2 }),
      );
    });

    it('rejects multi-field payload (Price + Stop-Sell) when caller has rate + allotment but lacks stop-sell', async () => {
      const caller = createCaller('staff_rate_and_allotment');
      await expect(caller.channelManager.saveCalendarRange({
        ...range,
        price: 1500,
        rooms_available: 0,
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(availabilityMocks.saveCalendarRange).not.toHaveBeenCalled();
    });

    it('rejects multi-field payload (Min-Stay + Allotment) when caller has only allotment permission', async () => {
      const caller = createCaller('staff_allotment_only');
      await expect(caller.channelManager.saveCalendarRange({
        ...range,
        min_stay_nights: 2,
        rooms_available: 2,
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(availabilityMocks.saveCalendarRange).not.toHaveBeenCalled();
    });

    it('rejects multi-field payload (Base-Flag + Allotment) when caller has only allotment permission', async () => {
      const caller = createCaller('staff_allotment_only');
      await expect(caller.channelManager.saveCalendarRange({
        ...range,
        base: true,
        rooms_available: 2,
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(availabilityMocks.saveCalendarRange).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. Cross-Hotel Access Denial Across Mutations
  // =========================================================================
  describe('Cross-Hotel Denial Across Calendar Mutations', () => {
    it.each([
      'owner' as const,
      'staff_rate_only' as const,
      'staff_allotment_only' as const,
      'staff_stop_sell_only' as const,
      'staff_rate_and_allotment' as const,
    ])('rejects %s attempting updateAvailability on foreign hotel', async (profile) => {
      const caller = createCaller(profile); // Membership belongs to HOME_HOTEL
      await expect(caller.channelManager.updateAvailability({
        hotel_id: FOREIGN_HOTEL,
        room_type_id: ROOM_TYPE_ID,
        date: '2026-08-20',
        price: 2500,
        rooms_available: 1,
        action: 'rate',
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(availabilityMocks.updateAvailability).not.toHaveBeenCalled();
    });

    it.each([
      'owner' as const,
      'staff_allotment_only' as const,
      'staff_stop_sell_only' as const,
    ])('rejects %s attempting updateAvailabilityBatch on foreign hotel', async (profile) => {
      const caller = createCaller(profile);
      await expect(caller.channelManager.updateAvailabilityBatch({
        hotel_id: FOREIGN_HOTEL,
        room_type_ids: [ROOM_TYPE_ID],
        start_date: '2026-12-01',
        end_date: '2026-12-05',
        rooms_available: 0,
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(availabilityMocks.updateAvailabilityBatch).not.toHaveBeenCalled();
    });

    it.each([
      'owner' as const,
      'staff_rate_only' as const,
      'staff_allotment_only' as const,
      'staff_rate_and_allotment' as const,
    ])('rejects %s attempting saveCalendarRange on foreign hotel', async (profile) => {
      const caller = createCaller(profile);
      await expect(caller.channelManager.saveCalendarRange({
        hotel_id: FOREIGN_HOTEL,
        room_type_ids: [ROOM_TYPE_ID],
        start_date: '2026-12-01',
        end_date: '2026-12-05',
        price: 1500,
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(availabilityMocks.saveCalendarRange).not.toHaveBeenCalled();
    });

    it('rejects foreign hotel on rate override mutations', async () => {
      const caller = createCaller('owner');
      await expect(caller.channelManager.createRateOverride({
        hotel_id: FOREIGN_HOTEL,
        room_type_id: ROOM_TYPE_ID,
        start_date: '2026-12-01',
        end_date: '2026-12-05',
        override_price: 2000,
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });

      await expect(caller.channelManager.deleteRateOverride({
        hotel_id: FOREIGN_HOTEL,
        rate_override_id: '99999999-9999-4999-8999-999999999999',
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });

      await expect(caller.channelManager.listRateOverrides({
        hotel_id: FOREIGN_HOTEL,
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });

      expect(availabilityMocks.createRateOverride).not.toHaveBeenCalled();
      expect(availabilityMocks.deleteRateOverride).not.toHaveBeenCalled();
      expect(availabilityMocks.listRateOverrides).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 6. Physical Capacity and Input Boundary Constraints
  // =========================================================================
  describe('Physical Capacity and Input Boundary Enforcement', () => {
    it('rejects updateAvailability when rooms_available exceeds room count configured for room type', async () => {
      // Hotel mock configured with 2 rooms for ROOM_TYPE_ID
      const caller = createCaller('owner');
      await expect(caller.channelManager.updateAvailability({
        hotel_id: HOME_HOTEL,
        room_type_id: ROOM_TYPE_ID,
        date: '2026-08-20',
        price: 2500,
        rooms_available: 3, // Exceeds 2
        action: 'allotment',
      })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringContaining('Available rooms cannot exceed'),
      });
      expect(availabilityMocks.updateAvailability).not.toHaveBeenCalled();
    });

    it('rejects updateAvailabilityBatch when date range is backwards or exceeds 62 days', async () => {
      const caller = createCaller('owner');
      // Backwards date range
      await expect(caller.channelManager.updateAvailabilityBatch({
        hotel_id: HOME_HOTEL,
        room_type_ids: [ROOM_TYPE_ID],
        start_date: '2026-12-31',
        end_date: '2026-12-01',
        rooms_available: 1,
      })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      // Range > 62 days
      await expect(caller.channelManager.updateAvailabilityBatch({
        hotel_id: HOME_HOTEL,
        room_type_ids: [ROOM_TYPE_ID],
        start_date: '2026-01-01',
        end_date: '2026-04-01',
        rooms_available: 1,
      })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

      expect(availabilityMocks.updateAvailabilityBatch).not.toHaveBeenCalled();
    });

    it('rejects saveCalendarRange when date range is backwards', async () => {
      const caller = createCaller('owner');
      await expect(caller.channelManager.saveCalendarRange({
        hotel_id: HOME_HOTEL,
        room_type_ids: [ROOM_TYPE_ID],
        start_date: '2026-12-31',
        end_date: '2026-12-01',
        price: 1500,
      })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(availabilityMocks.saveCalendarRange).not.toHaveBeenCalled();
    });
  });
});
