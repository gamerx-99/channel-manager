import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { confirmManualFullPayment } from "./payment";
import type { D1ScopedDatabase } from "../db/scope";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

function makeDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    const source = readFileSync(resolve(migrationFolder, file), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  sqlite.exec(`insert into hotels (id, name, slug, address, owner_contact) values ('h1','Hotel','h1','Addr','o@test.com');
    insert into room_types (id, hotel_id, name, capacity, base_price) values ('rt1','h1','Deluxe',2,'100');
    insert into rooms (id, hotel_id, room_type_id, room_number) values ('r1','h1','rt1','1');
    insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, status, payment_status)
      values ('b1','h1','r1','Guest','2026-12-01','2026-12-02','120.00','pending_verification','pending');
    insert into payment_sessions (id, booking_id, hotel_id, amount, status, qr_reference, expires_at)
      values ('ps1','b1','h1','120.00','pending','QR-1',1794000000000);`);
  const client = {
    prepare(query: string) {
      let values: unknown[] = [];
      return { bind(...params: unknown[]) { values = params; return { query, values }; } };
    },
    async batch(statements: Array<{ query: string; values: unknown[] }>) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(({ query, values }) => {
          const result = sqlite.prepare(query).run(...values as never[]);
          return { meta: { changes: Number(result.changes) } };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, db: { $client: client } as unknown as D1ScopedDatabase };
}

describe("manual full payment confirmation atomicity", () => {
  it("keeps the deployed legacy payment sequence compatible until the candidate is enabled", () => {
    const { sqlite } = makeDb();
    // The deployed Worker finalizes the session, confirms the booking, then
    // marks payment verified. Only the candidate writer sets verified_by.
    sqlite.prepare(`update payment_sessions set status='paid', verified_transaction_ref='LEGACY-BANK-120', verified_at=1794268800000 where id='ps1'`).run();
    expect(sqlite.prepare(`select status, payment_status from bookings where id='b1'`).get()).toEqual({ status: 'pending_verification', payment_status: 'pending' });
    expect(sqlite.prepare(`select count(*) as count from booking_status_log`).get()).toEqual({ count: 0 });
    expect(sqlite.prepare(`update bookings set status='confirmed', expires_at=NULL where id='b1' and status='pending_verification' returning id`).get()).toEqual({ id: 'b1' });
    sqlite.prepare(`update bookings set payment_status='verified' where id='b1'`).run();
  });

  it("writes session evidence, booking confirmation, and the status log together", async () => {
    const { sqlite, db } = makeDb();
    await expect(confirmManualFullPayment(db, {
      hotelId: "h1", bookingId: "b1", sessionId: "ps1", amountSatang: 12000,
      transactionReference: "BANK-120", userId: "staff", reason: "manual_approve", now: new Date("2026-11-10T00:00:00Z"),
    })).resolves.toBe(true);
    expect(sqlite.prepare(`select status, payment_status from bookings where id='b1'`).get()).toEqual({ status: "confirmed", payment_status: "verified" });
    expect(sqlite.prepare(`select status, verified_transaction_ref from payment_sessions where id='ps1'`).get()).toEqual({ status: "paid", verified_transaction_ref: "BANK-120" });
    expect(sqlite.prepare(`select from_status, to_status, changed_by, reason from booking_status_log where booking_id='b1'`).get()).toEqual({ from_status: "pending_verification", to_status: "confirmed", changed_by: "staff", reason: "manual_approve" });
  });

  it("does not change either record if the entered amount is not the booking total", async () => {
    const { sqlite, db } = makeDb();
    await expect(confirmManualFullPayment(db, {
      hotelId: "h1", bookingId: "b1", sessionId: "ps1", amountSatang: 11999,
      transactionReference: "BANK-11999", userId: "staff", reason: "manual_approve", now: new Date("2026-11-10T00:00:00Z"),
    })).resolves.toBe(false);
    expect(sqlite.prepare(`select status, payment_status from bookings where id='b1'`).get()).toEqual({ status: "pending_verification", payment_status: "pending" });
    expect(sqlite.prepare(`select status, verified_transaction_ref from payment_sessions where id='ps1'`).get()).toEqual({ status: "pending", verified_transaction_ref: null });
    expect(sqlite.prepare(`select count(*) as count from booking_status_log where booking_id='b1'`).get()).toEqual({ count: 0 });
  });
});
