import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

describe("D1 exact-money migration", () => {
  it("preserves referenced rows while rebuilding monetary tables", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("PRAGMA foreign_keys = ON");
      const migrations = readdirSync(migrationFolder).filter(file => file.endsWith(".sql")).sort();
      const moneyMigrations = migrations.filter(file => file.startsWith("20261028044"));
      const laterMigrations = migrations.filter(file => file.startsWith("2026102819"));
      for (const file of migrations.filter(file => !moneyMigrations.includes(file) && !laterMigrations.includes(file))) {
        const source = readFileSync(resolve(migrationFolder, file), "utf8");
        for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
      }

      db.exec(`
        insert into hotels (id, name, slug, address, owner_contact) values ('h1', 'Hotel', 'hotel', 'address', 'owner@test');
        insert into room_types (id, hotel_id, name, capacity, base_price) values ('rt1', 'h1', 'Room', 2, 100.25);
        insert into rooms (id, hotel_id, room_type_id, room_number) values ('r1', 'h1', 'rt1', '001');
        insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, source, status)
          values ('b1', 'h1', 'r1', 'Guest', '2026-11-01', '2026-11-02', 123.45, 'manual', 'confirmed');
        insert into guests (id, booking_id, first_name, last_name, passport_no, nationality_code, birth_date)
          values ('g1', 'b1', 'Guest', 'Name', 'P123', 'THA', '1990-01-01');
        insert into booking_services (id, booking_id, service_name, pricing_model, unit_price, quantity, total_price)
          values ('bs1', 'b1', 'Breakfast', 'ONE_TIME', 20.25, 1, 20.25);
        insert into rate_overrides (id, room_type_id, start_date, end_date, override_price)
          values ('ro1', 'rt1', '2026-11-01', '2026-11-02', 150.75);
        insert into hotel_services (id, hotel_id, name, pricing_model, unit_price)
          values ('hs1', 'h1', 'Breakfast', 'ONE_TIME', 20.25);
        insert into payment_sessions (id, booking_id, hotel_id, amount, status, qr_reference, expires_at)
          values ('ps1', 'b1', 'h1', 123.45, 'pending', 'qr1', 1793500000000);
      `);

      for (const file of moneyMigrations) {
        const source = readFileSync(resolve(migrationFolder, file), "utf8");
        for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
      }
      // These migrations were created after the table rebuilds and must run afterward.
      for (const file of laterMigrations) {
        const source = readFileSync(resolve(migrationFolder, file), "utf8");
        for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
      }

      for (const table of ["bookings", "guests", "booking_services", "rate_overrides", "payment_sessions", "hotel_services"]) {
        expect(Number((db.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n), table).toBe(1);
      }
      expect((db.prepare("select price from bookings where id='b1'").get() as { price: string }).price).toBe("123.45");
      expect((db.prepare("select base_price from room_types where id='rt1'").get() as { base_price: string }).base_price).toBe("100.25");
      expect(db.prepare("pragma foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});
