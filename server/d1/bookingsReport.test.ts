import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle as sqliteProxy } from 'drizzle-orm/sqlite-proxy';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bookings, bookingServices, d1Schema, hotelUsers, hotels, rooms, roomTypes } from '../../drizzle/d1-schema';
import type { D1ScopedDatabase } from '../db/scope';
import { listBookingsReportData } from './bookingsReport';

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle/d1');
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith('.sql')).sort()) {
    const source = readFileSync(resolve(migrationFolder, file), 'utf8');
    for (const statement of source.split('--> statement-breakpoint')) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    statement.setReturnArrays(true);
    if (method === 'run') { statement.run(...params); return { rows: [] }; }
    if (method === 'get') { const row = statement.get(...params); return { rows: row ? [row] : [] }; }
    return { rows: statement.all(...params) };
  }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
  for (const id of ['a', 'b']) {
    await db.insert(hotels).values({ id: `hotel-${id}`, name: id, slug: id, address: 'A', ownerContact: 'owner@example.test', publicEnabled: true });
    await db.insert(roomTypes).values({ id: `rt-${id}`, hotelId: `hotel-${id}`, name: `Type ${id}`, capacity: 2, basePrice: '100.00' });
    await db.insert(rooms).values({ id: `room-${id}`, hotelId: `hotel-${id}`, roomTypeId: `rt-${id}`, roomNumber: '101', status: id === 'a' ? 'available' : 'maintenance' });
    await db.insert(bookings).values({ id: `booking-${id}`, hotelId: `hotel-${id}`, roomId: `room-${id}`, guestName: `Guest ${id}`, checkIn: '2026-11-01', checkOut: '2026-11-03', price: '100.00', source: 'manual', status: 'confirmed' });
  }
});
afterEach(() => sqlite.close());

describe('scoped bookings report repository', () => {
  it('returns only the authorized hotel with its room capacity and booking fields', async () => {
    await db.insert(hotelUsers).values({ id: 'member-a', hotelId: 'hotel-a', userId: 'user-1', role: 'front_desk' } as any);
    const caller = { userId: 'user-1', roles: ['front_desk'], access: 'authenticated' } as any;
    const result = await listBookingsReportData(db, caller, 'hotel-a');
    expect(result.sellableRooms).toBe(1);
    expect(result.bookings).toMatchObject([{ id: 'booking-a', guestName: 'Guest a', roomType: 'Type a' }]);
    await expect(listBookingsReportData(db, caller, 'hotel-b')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('denies the report after the owner revokes its permission', async () => {
    await db.insert(hotelUsers).values({ id: 'member-a', hotelId: 'hotel-a', userId: 'user-1', role: 'front_desk', permissionRevokes: ['reports.view_bookings'] } as any);
    await expect(listBookingsReportData(db, { userId: 'user-1', roles: ['front_desk'], access: 'authenticated' } as any, 'hotel-a')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('subtracts guest-selected services from room revenue without changing the booking amount', async () => {
    await db.insert(hotelUsers).values({ id: 'member-a', hotelId: 'hotel-a', userId: 'user-1', role: 'front_desk' } as any);
    await db.insert(bookingServices).values({ id: 'service-a', bookingId: 'booking-a', serviceName: 'Breakfast', pricingModel: 'ONE_TIME', unitPrice: '20.00', quantity: 1, totalPrice: '20.00' });
    const result = await listBookingsReportData(db, { userId: 'user-1', roles: ['front_desk'], access: 'authenticated' } as any, 'hotel-a');
    expect(result.bookings[0]).toMatchObject({ price: '100.00', roomRevenue: 80 });
  });
});
