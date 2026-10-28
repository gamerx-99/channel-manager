import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bookings, d1Schema, hotelUsers, hotels, messageThreads, messages } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { createMessage, createMessageThread, listMessages, listThreads } from "./messaging";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;
let beforeMessageQuery: (() => void) | null;

beforeEach(() => {
  beforeMessageQuery = null;
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const name of readdirSync(migrationFolder).filter(file => file.endsWith(".sql")).sort()) {
    const source = readFileSync(resolve(migrationFolder, name), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    if ((query.toLowerCase().includes("insert into messages") || (query.toLowerCase().includes("join") && query.includes("message_threads") && query.includes("messages"))) && beforeMessageQuery) {
      beforeMessageQuery();
      beforeMessageQuery = null;
    }
    const statement = sqlite.prepare(query);
    statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    if (method === "get") { const row = statement.get(...params); return { rows: row ? [row] : [] }; }
    return { rows: statement.all(...params) };
  }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
});

afterEach(() => sqlite.close());

async function seedHotel(id: string, owner: string) {
  await db.insert(hotels).values({ id, name: id, slug: id, address: "address", ownerContact: `${owner}@example.test` });
  await db.insert(hotelUsers).values({ id: `m-${id}`, hotelId: id, userId: owner, role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
  await db.insert(bookings).values({ id: `booking-${id}`, hotelId: id, guestName: "Guest", checkIn: "2026-11-01", checkOut: "2026-11-02", price: "100.00", source: "manual", status: "confirmed" });
}

describe("D1 messaging repository", () => {
  it("creates, lists and reads messages only in the caller's hotel", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    const caller = { userId: "owner-a" };
    const thread = await createMessageThread(db, caller, { hotel_id: "a", booking_id: "booking-a" });
    expect(thread).toMatchObject({ hotelId: "a", bookingId: "booking-a" });
    const message = await createMessage(db, caller, { hotel_id: "a", thread_id: thread.id, body: "  Hello  " });
    expect(message).toMatchObject({ threadId: thread.id, senderUserId: "owner-a", body: "Hello" });
    expect(await listThreads(db, caller, { hotel_id: "a", booking_id: "booking-a" })).toHaveLength(1);
    expect(await listMessages(db, caller, "a", thread.id)).toHaveLength(1);

    await expect(createMessageThread(db, caller, { hotel_id: "b" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listThreads(db, caller, { hotel_id: "b" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listMessages(db, caller, "b", thread.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createMessage(db, caller, { hotel_id: "b", thread_id: thread.id, body: "No" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects foreign bookings and invalid message bodies", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    const caller = { userId: "owner-a" };
    await expect(createMessageThread(db, caller, { hotel_id: "a", booking_id: "booking-b" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const thread = await createMessageThread(db, caller, { hotel_id: "a" });
    await expect(createMessage(db, caller, { hotel_id: "a", thread_id: thread.id, body: "  " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(createMessage(db, caller, { hotel_id: "a", thread_id: thread.id, body: "x".repeat(4001) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps message writes scoped if thread ownership changes after authorization", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    const thread = await createMessageThread(db, { userId: "owner-a" }, { hotel_id: "a" });
    beforeMessageQuery = () => sqlite.prepare("update message_threads set hotel_id = 'b' where id = ?").run(thread.id);
    await expect(createMessage(db, { userId: "owner-a" }, { hotel_id: "a", thread_id: thread.id, body: "hello" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.select().from(messages)).length).toBe(0);
  });

  it("keeps message reads scoped if thread ownership changes after authorization", async () => {
    await seedHotel("a", "owner-a");
    await seedHotel("b", "owner-b");
    const caller = { userId: "owner-a" };
    const thread = await createMessageThread(db, caller, { hotel_id: "a" });
    await createMessage(db, caller, { hotel_id: "a", thread_id: thread.id, body: "secret" });
    beforeMessageQuery = () => sqlite.prepare("update message_threads set hotel_id = 'b' where id = ?").run(thread.id);
    expect(await listMessages(db, caller, "a", thread.id)).toEqual([]);
  });
});
