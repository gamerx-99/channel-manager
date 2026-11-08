import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const annualMigration = "20261108000000_booking_documents_annual_types.sql";
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql") && name < annualMigration).sort()) {
    const source = readFileSync(resolve(migrationFolder, file), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  sqlite.exec(`
    INSERT INTO hotels (id, name, slug, address, owner_contact) VALUES ('h1', 'Hotel', 'hotel', 'Addr', 'owner@example.test');
    INSERT INTO room_types (id, hotel_id, name, capacity, base_price) VALUES ('rt1', 'h1', 'Room', 2, '100');
    INSERT INTO rooms (id, hotel_id, room_type_id, room_number) VALUES ('r1', 'h1', 'rt1', '1');
    INSERT INTO bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, status, payment_status)
      VALUES ('b1', 'h1', 'r1', 'Guest', '2025-12-01', '2025-12-02', '100', 'confirmed', 'verified');
    INSERT INTO booking_documents (id, hotel_id, booking_id, doc_type, seq, doc_number, snapshot_json)
      VALUES ('d1', 'h1', 'b1', 'receipt', 1, 'RC-000001', '{"issuedOn":"2025-12-31"}');
  `);
});

describe("annual booking document migration", () => {
  it("backfills the old issue year and permits the same sequence in the following year", () => {
    const source = readFileSync(resolve(migrationFolder, annualMigration), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);

    expect(sqlite.prepare("SELECT issued_year FROM booking_documents WHERE id = 'd1'").get()).toEqual({ issued_year: 2025 });
    expect(() => sqlite.exec(`
      INSERT INTO booking_documents (id, hotel_id, booking_id, doc_type, issued_year, seq, doc_number, snapshot_json)
      VALUES ('d2', 'h1', 'b1', 'receipt', 2026, 1, 'RC-2026-000001', '{}');
    `)).not.toThrow();
    expect(() => sqlite.exec(`
      INSERT INTO booking_documents (id, hotel_id, booking_id, doc_type, issued_year, seq, doc_number, snapshot_json)
      VALUES ('d3', 'h1', 'b1', 'quotation', 2026, 1, 'QT-2026-000001', '{}');
    `)).not.toThrow();
    expect(() => sqlite.exec(`
      INSERT INTO booking_documents (id, hotel_id, booking_id, doc_type, issued_year, seq, doc_number, snapshot_json)
      VALUES ('d4', 'h1', 'b1', 'receipt', 2026, 1, 'RC-2026-000001', '{}');
    `)).toThrow(/UNIQUE/);
  });
});
