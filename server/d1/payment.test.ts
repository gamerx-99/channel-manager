import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bookings, d1Schema, hotelPaymentSettings, hotelUsers, hotels } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { createPaymentSession, finalizePaymentSession, getHotelPaymentConfig, getLatestPaymentSession, savePromptPaySettings, updateBookingPaymentStatus, updatePaymentSessionStatus } from "./payment";

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
    await savePromptPaySettings(db, caller, "a", "prompt", 30);
    const config = await getHotelPaymentConfig(db, caller, "a");
    // slipok_enabled is no longer returned: one central SlipOK account serves every hotel.
    expect(config).toEqual({ promptpay_id: "prompt", payment_timeout_minutes: 30 });
    expect(Object.keys(config!).sort()).toEqual(["payment_timeout_minutes", "promptpay_id"]);
    expect(config).not.toHaveProperty("slipok_key_enc");
    expect(config).not.toHaveProperty("slipok_key_hash");
    expect(config).not.toHaveProperty("slipok_branch_id");
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

  it("rejects cross-hotel payment settings and session access", async () => {
    await seed();
    const callerA = { userId: "ua" };
    const sessionB = await createPaymentSession(db, { userId: 'ub' }, { booking_id: 'bb', hotel_id: 'b', amount: 10, qr_reference: 'reference-b', qr_string: 'qr-b', expires_at: '2026-11-01T00:00:00.000Z' });
    await savePromptPaySettings(db, { userId: "ub" }, "b", "prompt-b", 15);
    await expect(getHotelPaymentConfig(db, callerA, "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(savePromptPaySettings(db, callerA, "b", "prompt-a", 30)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createPaymentSession(db, callerA, { booking_id: "bb", hotel_id: "b", amount: 10, qr_reference: "x", qr_string: "x", expires_at: "2026-11-01T00:00:00.000Z" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getLatestPaymentSession(db, callerA, "bb", "b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updatePaymentSessionStatus(db, callerA, "b", sessionB.id, "paid")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(finalizePaymentSession(db, callerA, "b", sessionB.id, { status: "paid" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateBookingPaymentStatus(db, callerA, "b", "bb", "verified")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reports a transaction reference already verified on another session as a duplicate", async () => {
    await seed();
    const sessionA = await createPaymentSession(db, { userId: "ua" }, { booking_id: "ba", hotel_id: "a", amount: 50, qr_reference: "qa", qr_string: "qa", expires_at: "2026-11-01T00:00:00.000Z" });
    const sessionB = await createPaymentSession(db, { userId: "ub" }, { booking_id: "bb", hotel_id: "b", amount: 50, qr_reference: "qb", qr_string: "qb", expires_at: "2026-11-01T00:00:00.000Z" });
    await expect(finalizePaymentSession(db, { userId: "ua" }, "a", sessionA.id, { status: "paid", rawResponse: {}, verifiedTransactionRef: "TX-SAME" })).resolves.toEqual({ duplicateRef: false });

    // A slip pays one booking on the whole platform, so another hotel's session is refused too.
    await expect(finalizePaymentSession(db, { userId: "ub" }, "b", sessionB.id, { status: "paid", rawResponse: {}, verifiedTransactionRef: "TX-SAME" })).resolves.toEqual({ duplicateRef: true });
    await expect(getLatestPaymentSession(db, { userId: "ub" }, "bb", "b")).resolves.toMatchObject({ status: "pending" });
    // Finalizing the same session again is not a duplicate of itself.
    await expect(finalizePaymentSession(db, { userId: "ua" }, "a", sessionA.id, { status: "paid", rawResponse: {}, verifiedTransactionRef: "TX-SAME" })).resolves.toEqual({ duplicateRef: false });
  });
});
