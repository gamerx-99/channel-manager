import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bookings, d1Schema, hotelPaymentSettings, hotelUsers, hotels } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { createPaymentSession, finalizePaymentSession, getHotelPaymentConfig, getLatestPaymentSession, getSlipOkSettings, removeSlipOkKey, savePromptPaySettings, saveSlipOkSettings, updateBookingPaymentStatus, updatePaymentSessionStatus } from "./payment";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) for (const statement of readFileSync(resolve(migrationFolder, file), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query); statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    const row = method === "get" ? statement.get(...params) : statement.all(...params);
    return { rows: row ? (Array.isArray(row) ? row : [row]) : [] };
  }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
  db.$client = { prepare: query => ({ bind: (...params) => ({ query, params }) }), batch: async statements => statements.map(statement => {
    const { query, params } = statement as { query: string; params: unknown[] };
    const result = sqlite.prepare(query).run(...params); return { meta: { changes: Number(result.changes) } };
  }) };
});
afterEach(() => sqlite.close());

async function seed() {
  await db.insert(hotels).values([{ id: "a", name: "A", slug: "a", address: "A", ownerContact: "a", publicEnabled: true }, { id: "b", name: "B", slug: "b", address: "B", ownerContact: "b", publicEnabled: true }]);
  await db.insert(hotelUsers).values([{ id: "ma", hotelId: "a", userId: "ua", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] }, { id: "mb", hotelId: "b", userId: "ub", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] }]);
  await db.insert(bookings).values([{ id: "ba", hotelId: "a", guestName: "A", checkIn: "2026-11-01", checkOut: "2026-11-02", price: "50.00", source: "manual", status: "confirmed" }, { id: "bb", hotelId: "b", guestName: "B", checkIn: "2026-11-01", checkOut: "2026-11-02", price: "50.00", source: "manual", status: "confirmed" }]);
}

describe("D1 payment repository", () => {
  it("scopes settings, sessions and booking payment updates to hotel", async () => {
    await seed(); const caller = { userId: "ua" };
    await saveSlipOkSettings(db, caller, "a", "encrypted", "hash", "branch");
    await expect(getSlipOkSettings(db, caller, "a")).resolves.toEqual({ configured: true, enabled: true, branchId: "branch" });
    await savePromptPaySettings(db, caller, "a", "prompt", 30);
    await expect(getHotelPaymentConfig(db, caller, "a")).resolves.toMatchObject({ promptpay_id: "prompt", payment_timeout_minutes: 30 });
    await saveSlipOkSettings(db, caller, "b", "x", "y", "z").then(() => { throw Error("expected denial"); }, error => expect(error.code).toBe("FORBIDDEN"));
    await removeSlipOkKey(db, caller, "a");
    await expect(getSlipOkSettings(db, caller, "a")).resolves.toMatchObject({ configured: false, enabled: false });
    const session = await createPaymentSession(db, caller, { booking_id: "ba", hotel_id: "a", amount: 100.25, qr_reference: "qr", qr_string: "data", expires_at: "2026-11-01T00:00:00.000Z" });
    expect(session.amount).toBe("100.25");
    await expect(createPaymentSession(db, caller, { booking_id: "bb", hotel_id: "a", amount: 10, qr_reference: "x", qr_string: "x", expires_at: "2026-11-01T00:00:00.000Z" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getLatestPaymentSession(db, caller, "ba", "a")).resolves.toMatchObject({ id: session.id });
    await expect(getLatestPaymentSession(db, caller, "bb", "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updatePaymentSessionStatus(db, caller, "a", session.id, "paid")).resolves.toMatchObject({ status: "paid" });
    await expect(finalizePaymentSession(db, caller, "a", session.id, { status: "paid", rawResponse: { ok: true }, verifiedTransactionRef: "ref" })).resolves.toEqual({ duplicateRef: false });
    await expect(updateBookingPaymentStatus(db, caller, "a", "ba", "verified")).resolves.toBeUndefined();
    await expect(updateBookingPaymentStatus(db, caller, "a", "bb", "verified")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
