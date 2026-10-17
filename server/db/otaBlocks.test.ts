import { describe, expect, it, vi } from 'vitest';

import {
  countBlockedUnitsByRoomTypeAndDate,
  subtractOtaBlocks,
} from './otaBlocks';

// The over-sell bug this file guards: server/db/otaBlocks.ts deleted OTA blocks
// on (hotel, provider, room_type, date) WITHOUT source_uid. Since the schema
// allows several reservations to block the same room type on the same night,
// cancelling ONE event deleted every sibling event's block and re-opened rooms
// that were still sold.
//
// These tests assert the delete filter itself (the bug lived in persistence, not
// in the pure diff, which was always correct).

interface DeleteCall { filters: Record<string, unknown> }

const FILTERABLE = ['hotel_id', 'provider', 'room_type_id', 'date', 'source_uid'] as const;

/**
 * Minimal Supabase double: `.from().delete().eq()….select()` and
 * `.from().insert()` over an in-memory row set, applying the accumulated
 * equality filters exactly as PostgREST/Postgres would.
 */
function createClient(rows: Array<Record<string, unknown>>, deleted: DeleteCall[] = []) {
  const state = { rows: [...rows], deleted };

  const matches = (row: Record<string, unknown>, filters: Record<string, unknown>) =>
    FILTERABLE.every(key => filters[key] === undefined || filters[key] === row[key]);

  const table = {
    delete: vi.fn(() => {
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {
        eq: vi.fn((column: string, value: unknown) => {
          filters[column] = value;
          return chain;
        }),
        select: vi.fn(() => {
          const snapshot = { ...filters };
          const matched = state.rows.filter(row => matches(row, snapshot));
          state.deleted.push({ filters: snapshot });
          state.rows = state.rows.filter(row => !matched.includes(row));
          return Promise.resolve({ data: matched, error: null, count: matched.length });
        }),
      };
      return chain;
    }),
    insert: vi.fn((row: Record<string, unknown>) => {
      state.rows.push(row);
      return Promise.resolve({ data: row, error: null });
    }),
  };

  return { client: { from: vi.fn(() => table) } as any, state };
}

const HOTEL = 'hotel-1';

describe('replaceOtaImportBlocks — per-UID deletion', () => {
  it('deletes exactly one sibling event when one reservation is cancelled', async () => {
    // Three Deluxe rooms sold on the same night; only uidC is cancelled.
    const rows = [
      { hotel_id: HOTEL, provider: 'agoda', room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidA' },
      { hotel_id: HOTEL, provider: 'agoda', room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidB' },
      { hotel_id: HOTEL, provider: 'agoda', room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidC' },
    ];
    const { client, state } = createClient(rows);

    const { replaceOtaImportBlocks } = await import('./otaBlocks');
    const result = await replaceOtaImportBlocks(
      client,
      HOTEL,
      'agoda',
      [{ room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidC' }],
      [],
    );

    expect(result.deleted).toBe(1);
    // The two still-sold events must keep blocking.
    expect(state.rows.map(row => row.source_uid).sort()).toEqual(['uidA', 'uidB']);
  });

  it('includes source_uid in the delete filter', async () => {
    const rows = [
      { hotel_id: HOTEL, provider: 'agoda', room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidA' },
      { hotel_id: HOTEL, provider: 'agoda', room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidB' },
    ];
    const { client, state } = createClient(rows);

    const { replaceOtaImportBlocks } = await import('./otaBlocks');
    await replaceOtaImportBlocks(
      client,
      HOTEL,
      'agoda',
      [{ room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidA' }],
      [],
    );

    expect(state.deleted).toHaveLength(1);
    expect(state.deleted[0].filters.source_uid).toBe('uidA');
  });

  it('never touches another provider\'s blocks for the same night', async () => {
    const rows = [
      { hotel_id: HOTEL, provider: 'agoda', room_type_id: 'rt1', date: '2026-08-20', source_uid: 'shared-uid' },
      { hotel_id: HOTEL, provider: 'booking', room_type_id: 'rt1', date: '2026-08-20', source_uid: 'shared-uid' },
    ];
    const { client, state } = createClient(rows);

    const { replaceOtaImportBlocks } = await import('./otaBlocks');
    await replaceOtaImportBlocks(
      client,
      HOTEL,
      'agoda',
      [{ room_type_id: 'rt1', date: '2026-08-20', source_uid: 'shared-uid' }],
      [],
    );

    // booking.com's identically-UIDed row survives: the provider filter holds.
    expect(state.rows).toEqual([
      { hotel_id: HOTEL, provider: 'booking', room_type_id: 'rt1', date: '2026-08-20', source_uid: 'shared-uid' },
    ]);
  });

  it('releases every night of a multi-night cancellation, per UID', async () => {
    const rows = [
      { hotel_id: HOTEL, provider: 'agoda', room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidLong' },
      { hotel_id: HOTEL, provider: 'agoda', room_type_id: 'rt1', date: '2026-08-21', source_uid: 'uidLong' },
      { hotel_id: HOTEL, provider: 'agoda', room_type_id: 'rt1', date: '2026-08-22', source_uid: 'uidShort' },
    ];
    const { client, state } = createClient(rows);

    const { replaceOtaImportBlocks } = await import('./otaBlocks');
    await replaceOtaImportBlocks(
      client,
      HOTEL,
      'agoda',
      [
        { room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidLong' },
        { room_type_id: 'rt1', date: '2026-08-21', source_uid: 'uidLong' },
      ],
      [],
    );

    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].source_uid).toBe('uidShort');
  });

  it('inserts a new block without disturbing existing siblings', async () => {
    const rows = [
      { hotel_id: HOTEL, provider: 'agoda', room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidA' },
    ];
    const { client, state } = createClient(rows);

    const { replaceOtaImportBlocks } = await import('./otaBlocks');
    await replaceOtaImportBlocks(
      client,
      HOTEL,
      'agoda',
      [],
      [{ room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidB' }],
    );

    expect(state.rows).toHaveLength(2);
  });
});

describe('listOtaImportBlocks — provider scoping', () => {
  it('returns only the requested provider\'s rows when scoped', async () => {
    const rows = [
      { hotel_id: HOTEL, provider: 'agoda', room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidA' },
      { hotel_id: HOTEL, provider: 'booking', room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidA' },
    ];
    const eqFilters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((column: string, value: unknown) => {
      eqFilters[column] = value;
      return chain;
    });
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve().then(() => {
        const filtered = rows.filter(row =>
          (['hotel_id', 'provider'] as const).every(
            key => eqFilters[key] === undefined || eqFilters[key] === row[key],
          ),
        );
        return resolve({ data: filtered, error: null });
      });

    const { listOtaImportBlocks } = await import('./otaBlocks');
    const result = await listOtaImportBlocks({ from: () => chain } as any, HOTEL, 'agoda');

    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe('agoda');
    expect(eqFilters.provider).toBe('agoda');
  });

  it('returns every provider when no scope is given (UI listing)', async () => {
    const rows = [
      { hotel_id: HOTEL, provider: 'agoda', room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidA' },
      { hotel_id: HOTEL, provider: 'booking', room_type_id: 'rt1', date: '2026-08-20', source_uid: 'uidB' },
    ];
    const eqFilters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((column: string, value: unknown) => {
      eqFilters[column] = value;
      return chain;
    });
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve().then(() =>
        resolve({
          data: rows.filter(row => eqFilters.hotel_id === undefined || eqFilters.hotel_id === row.hotel_id),
          error: null,
        }),
      );

    const { listOtaImportBlocks } = await import('./otaBlocks');
    const result = await listOtaImportBlocks({ from: () => chain } as any, HOTEL);
    expect(result).toHaveLength(2);
  });
});
describe("countBlockedUnitsByRoomTypeAndDate", () => {
  it("counts each OTA event as one sold room on the same night", () => {
    const counts = countBlockedUnitsByRoomTypeAndDate([
      { room_type_id: "rt1", date: "2026-08-20" },
      { room_type_id: "rt1", date: "2026-08-20" },
      { room_type_id: "rt1", date: "2026-08-20" },
    ]);
    expect(counts.get("rt1:2026-08-20")).toBe(3);
  });

  it("keeps room types and dates independent", () => {
    const counts = countBlockedUnitsByRoomTypeAndDate([
      { room_type_id: "rt1", date: "2026-08-20" },
      { room_type_id: "rt1", date: "2026-08-21" },
      { room_type_id: "rt2", date: "2026-08-20" },
    ]);
    expect(counts.get("rt1:2026-08-20")).toBe(1);
    expect(counts.get("rt1:2026-08-21")).toBe(1);
    expect(counts.get("rt2:2026-08-20")).toBe(1);
  });

  it("ignores malformed rows rather than throwing", () => {
    const counts = countBlockedUnitsByRoomTypeAndDate([
      { room_type_id: "rt1", date: "2026-08-20" },
      { room_type_id: "", date: "2026-08-20" },
      { room_type_id: "rt2", date: "" },
    ]);
    expect(counts.size).toBe(1);
    expect(counts.get("rt1:2026-08-20")).toBe(1);
  });

  it("returns an empty map when the hotel has no OTA connections yet", () => {
    expect(countBlockedUnitsByRoomTypeAndDate([]).size).toBe(0);
  });
});

describe("subtractOtaBlocks", () => {
  it("removes sold rooms from the available count", () => {
    expect(subtractOtaBlocks(3, 1)).toBe(2);
    expect(subtractOtaBlocks(5, 0)).toBe(5);
  });

  it("floors at zero instead of reporting negative rooms", () => {
    // A stale feed can block more rooms than exist; that reads as "closed".
    expect(subtractOtaBlocks(2, 5)).toBe(0);
    expect(subtractOtaBlocks(0, 1)).toBe(0);
  });
});
