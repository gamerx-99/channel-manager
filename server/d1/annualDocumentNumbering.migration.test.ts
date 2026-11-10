import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

describe("annual document numbering migration (20261110030000)", () => {
  function applyMigrationsUpTo(sqlite: InstanceType<typeof DatabaseSync>, stopBeforeTag?: string) {
    const files = readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort();
    for (const file of files) {
      if (stopBeforeTag && file.startsWith(stopBeforeTag)) break;
      const source = readFileSync(resolve(migrationFolder, file), "utf8");
      for (const statement of source.split("--> statement-breakpoint")) {
        if (statement.trim()) sqlite.exec(statement);
      }
    }
  }

  function applySingleMigration(sqlite: InstanceType<typeof DatabaseSync>, filename: string) {
    const source = readFileSync(resolve(migrationFolder, filename), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }

  it("safely migrates legacy rows, populates Bangkok year, and activates annual sequence index", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON");

    // 1. Apply all migrations up to the one before annual_document_numbering
    applyMigrationsUpTo(sqlite, "20261110030000");

    // 2. Insert test hotel and booking
    sqlite.prepare(`insert into hotels (id, name, slug, address, owner_contact) values ('h1', 'Hotel 1', 'h1', 'Addr', 'o@test.com')`).run();
    sqlite.prepare(`insert into room_types (id, hotel_id, name, capacity, base_price) values ('rt1', 'h1', 'Deluxe', 2, '100')`).run();
    sqlite.prepare(`insert into rooms (id, hotel_id, room_type_id, room_number) values ('r1', 'h1', 'rt1', '101')`).run();
    sqlite.prepare(`insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, status, payment_status)
      values ('b1', 'h1', 'r1', 'Guest 1', '2026-11-01', '2026-11-03', '1000', 'confirmed', 'verified')`).run();

    // 3. Insert historical/legacy documents (created with older schema lacking 'year' and 'idempotency_key')
    // 2026-11-01 10:00:00 UTC = 2026-11-01 17:00:00 Bangkok
    const time2026 = Date.parse("2026-11-01T10:00:00.000Z");
    sqlite.prepare(`insert into booking_documents (id, hotel_id, booking_id, doc_type, seq, doc_number, snapshot_json, created_at)
      values ('legacy-1', 'h1', 'b1', 'receipt', 1, 'RC-000001', '{"number":"RC-000001"}', ?)`).run(time2026);
    sqlite.prepare(`insert into booking_documents (id, hotel_id, booking_id, doc_type, seq, doc_number, snapshot_json, created_at)
      values ('legacy-2', 'h1', 'b1', 'invoice', 1, 'INV-000001', '{"number":"INV-000001"}', ?)`).run(time2026);

    // 4. Apply 20261110030000_annual_document_numbering.sql
    applySingleMigration(sqlite, "20261110030000_annual_document_numbering.sql");

    // 5. Verify legacy rows remain intact with correct year backfilled from Bangkok time
    const rows = sqlite.prepare(`select id, doc_type, year, seq, doc_number, idempotency_key from booking_documents order by id`).all() as Array<{
      id: string; doc_type: string; year: number; seq: number; doc_number: string; idempotency_key: string | null;
    }>;

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "legacy-1", doc_type: "receipt", year: 2026, seq: 1, doc_number: "RC-000001", idempotency_key: null });
    expect(rows[1]).toMatchObject({ id: "legacy-2", doc_type: "invoice", year: 2026, seq: 1, doc_number: "INV-000001", idempotency_key: null });

    // 6. Verify year NOT NULL constraint on new rows
    expect(() => {
      sqlite.prepare(`insert into booking_documents (id, hotel_id, booking_id, doc_type, year, seq, doc_number, snapshot_json, created_at)
        values ('new-null-year', 'h1', 'b1', 'receipt', NULL, 2, 'RC-2026-000002', '{}', 1762000000000)`).run();
    }).toThrow(/NOT NULL constraint failed/);

    // 7. Verify annual unique constraint on (hotel_id, doc_type, year, seq)
    expect(() => {
      // Trying to insert duplicate seq=1 in year 2026 for receipt
      sqlite.prepare(`insert into booking_documents (id, hotel_id, booking_id, doc_type, year, seq, doc_number, snapshot_json, created_at)
        values ('new-dup-seq', 'h1', 'b1', 'receipt', 2026, 1, 'RC-2026-000001', '{}', 1762000000000)`).run();
    }).toThrow(/UNIQUE constraint failed/);

    // But seq=1 in year 2027 succeeds!
    sqlite.prepare(`insert into booking_documents (id, hotel_id, booking_id, doc_type, year, seq, doc_number, snapshot_json, created_at)
      values ('new-2027-seq1', 'h1', 'b1', 'receipt', 2027, 1, 'RC-2027-000001', '{}', 1793500000000)`).run();

    // 8. Verify idempotency unique constraint on (hotel_id, idempotency_key)
    sqlite.prepare(`insert into booking_documents (id, hotel_id, booking_id, doc_type, year, seq, doc_number, snapshot_json, idempotency_key, created_at)
      values ('idemp-1', 'h1', 'b1', 'receipt', 2027, 2, 'RC-2027-000002', '{}', 'key-abc', 1793500000000)`).run();

    // Duplicate idempotency_key for same hotel fails
    expect(() => {
      sqlite.prepare(`insert into booking_documents (id, hotel_id, booking_id, doc_type, year, seq, doc_number, snapshot_json, idempotency_key, created_at)
        values ('idemp-2', 'h1', 'b1', 'invoice', 2027, 1, 'INV-2027-000001', '{}', 'key-abc', 1793500000000)`).run();
    }).toThrow(/UNIQUE constraint failed.*idempotency_key/);
  });

  it("aborts migration if legacy data contains invalid year range violating year check", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON");
    applyMigrationsUpTo(sqlite, "20261110030000");

    sqlite.prepare(`insert into hotels (id, name, slug, address, owner_contact) values ('h1', 'Hotel 1', 'h1', 'Addr', 'o@test.com')`).run();
    sqlite.prepare(`insert into room_types (id, hotel_id, name, capacity, base_price) values ('rt1', 'h1', 'Deluxe', 2, '100')`).run();
    sqlite.prepare(`insert into rooms (id, hotel_id, room_type_id, room_number) values ('r1', 'h1', 'rt1', '101')`).run();
    sqlite.prepare(`insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, status, payment_status)
      values ('b1', 'h1', 'r1', 'Guest 1', '2026-11-01', '2026-11-03', '1000', 'confirmed', 'verified')`).run();

    // Insert corrupt record with timestamp from year 1970 (created_at = 1000)
    sqlite.prepare(`insert into booking_documents (id, hotel_id, booking_id, doc_type, seq, doc_number, snapshot_json, created_at)
      values ('corrupt-1', 'h1', 'b1', 'receipt', 1, 'RC-000001', '{}', 1000)`).run();

    // Migration insert into __new_booking_documents must fail the year >= 2020 check constraint!
    expect(() => {
      applySingleMigration(sqlite, "20261110030000_annual_document_numbering.sql");
    }).toThrow(/CHECK constraint failed/);
  });
});
