import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const migrationName = "20261029000000_booking_nights_overlap_guard.sql";
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

function createDbBeforeBookingNights() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    if (file >= migrationName) continue;
    const source = readFileSync(resolve(migrationFolder, file), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
  }
  db.exec(`
    insert into hotels (id, name, slug, address, owner_contact) values ('h1', 'Hotel', 'hotel', 'address', 'owner@test');
    insert into room_types (id, hotel_id, name, capacity, base_price) values ('rt1', 'h1', 'Room', 2, '100.00');
    insert into rooms (id, hotel_id, room_type_id, room_number) values ('r1', 'h1', 'rt1', '001');
  `);
  return db;
}

function runBookingNightsMigration(db: InstanceType<typeof DatabaseSync>) {
  const source = readFileSync(resolve(migrationFolder, migrationName), "utf8");
  for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
}

describe("booking_nights migration", () => {
  it("backfills occupying nights, including active holds, and excludes expired/non-occupying rows", () => {
    const db = createDbBeforeBookingNights();
    try {
      db.exec(`
        insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, source, status)
          values ('confirmed', 'h1', 'r1', 'Guest', '2030-01-01', '2030-01-03', '100.00', 'manual', 'confirmed');
        insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, source, status, expires_at)
          values ('active-hold', 'h1', 'r1', 'Guest', '2030-01-03', '2030-01-05', '100.00', 'manual', 'held', 4102444800000);
        insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, source, status, expires_at)
          values ('no-expiry-hold', 'h1', 'r1', 'Guest', '2030-01-05', '2030-01-06', '100.00', 'manual', 'pending_payment', null);
        insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, source, status, expires_at)
          values ('expired-hold', 'h1', 'r1', 'Guest', '2030-01-06', '2030-01-07', '100.00', 'manual', 'held', 1);
        insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, source, status)
          values ('checked-out', 'h1', 'r1', 'Guest', '2030-01-07', '2030-01-08', '100.00', 'manual', 'checked_out');
      `);

      runBookingNightsMigration(db);

      const rows = db.prepare("select booking_id, night from booking_nights order by booking_id, night").all() as { booking_id: string; night: string }[];
      expect(rows).toEqual([
        { booking_id: "active-hold", night: "2030-01-03" },
        { booking_id: "active-hold", night: "2030-01-04" },
        { booking_id: "confirmed", night: "2030-01-01" },
        { booking_id: "confirmed", night: "2030-01-02" },
        { booking_id: "no-expiry-hold", night: "2030-01-05" },
      ]);
    } finally { db.close(); }
  });

  it("fails the migration when existing occupying bookings overlap", () => {
    const db = createDbBeforeBookingNights();
    try {
      db.exec(`
        insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, source, status)
          values ('b1', 'h1', 'r1', 'Guest', '2030-01-01', '2030-01-03', '100.00', 'manual', 'confirmed');
        insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, source, status)
          values ('b2', 'h1', 'r1', 'Guest', '2030-01-02', '2030-01-04', '100.00', 'manual', 'confirmed');
      `);
      expect(() => runBookingNightsMigration(db)).toThrow(/UNIQUE constraint failed/);
    } finally { db.close(); }
  });
});
