import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

function applyBeforeReceiptMigration(db: InstanceType<typeof DatabaseSync>) {
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    if (file.startsWith("20261110040000")) break;
    for (const statement of readFileSync(resolve(migrationFolder, file), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) db.exec(statement);
    }
  }
}

function seed(db: InstanceType<typeof DatabaseSync>, duplicateReceipts = false) {
  db.exec(`insert into hotels (id, name, slug, address, owner_contact) values ('h1', 'Hotel', 'h1', 'Addr', 'o@test.com');
    insert into room_types (id, hotel_id, name, capacity, base_price) values ('rt1', 'h1', 'Deluxe', 2, '100');
    insert into rooms (id, hotel_id, room_type_id, room_number) values ('r1', 'h1', 'rt1', '101');
    insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, status, payment_status)
      values ('b1', 'h1', 'r1', 'Guest', '2026-12-01', '2026-12-02', '100', 'confirmed', 'verified');
    insert into booking_documents (id, hotel_id, booking_id, doc_type, year, seq, doc_number, snapshot_json, created_at)
      values ('rc1', 'h1', 'b1', 'receipt', 2026, 1, 'RC-2026-000001', '{"legacy":true}', 1793527200000);`);
  if (duplicateReceipts) db.exec(`insert into booking_documents (id, hotel_id, booking_id, doc_type, year, seq, doc_number, snapshot_json, created_at)
    values ('rc2', 'h1', 'b1', 'receipt', 2026, 2, 'RC-2026-000002', '{"legacy":true}', 1793527200001);`);
}

describe("verified receipt link migration", () => {
  it("preserves existing receipts without assigning payment evidence", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    applyBeforeReceiptMigration(db);
    seed(db);
    const source = readFileSync(resolve(migrationFolder, "20261110040000_verified_receipt_link.sql"), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
    expect(db.prepare(`select id, doc_number, snapshot_json, payment_session_id from booking_documents`).get()).toEqual({
      id: "rc1", doc_number: "RC-2026-000001", snapshot_json: '{"legacy":true}', payment_session_id: null,
    });
    expect(db.prepare(`pragma foreign_key_check`).all()).toEqual([]);
  });

  it("stops on duplicate legacy receipts for one booking", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    applyBeforeReceiptMigration(db);
    seed(db, true);
    const source = readFileSync(resolve(migrationFolder, "20261110040000_verified_receipt_link.sql"), "utf8");
    expect(() => {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }).toThrow(/booking_documents\.booking_id/);
    expect(db.prepare(`select count(*) as count from booking_documents where doc_type = 'receipt'`).get()).toEqual({ count: 2 });
    expect(db.prepare(`pragma table_info(booking_documents)`).all().some((column: any) => column.name === "payment_session_id")).toBe(false);
  });
});
