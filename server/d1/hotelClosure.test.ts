import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { R2Bucket } from "@cloudflare/workers-types/index.ts";
import { closureTimeline } from "@shared/hotelClosure";
import { authSchema } from "../../drizzle/auth-schema";
import { d1Schema } from "../../drizzle/d1-schema";
import { authorizeHotelAction, createD1SystemCallerContext, type D1ScopedDatabase } from "../db/scope";
import { deleteOwnAccount, getAccountDeletionBlockers } from "./accountDeletion";
import { getManagedHotel, listManagedHotels } from "./hotel";
import { cancelHotelClosure, exportHotelData, listOwnClosures, purgeClosedHotels, requestHotelClosure } from "./hotelClosure";
import { getOtaIcalExport } from "./ota";
import { runScheduledD1OtaSync } from "./otaScheduler";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

const NOW = new Date("2026-11-01T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const after = (days: number) => new Date(NOW.getTime() + days * DAY);
const owner = { userId: "owner" };
const staff = { userId: "staff" };
const support = { userId: "support-1", roles: ["support" as const] };
const TOKEN = "a".repeat(64);
const exec = (query: string, ...params: Array<string | number | null>) => sqlite.prepare(query).run(...params);
const one = (query: string, ...params: Array<string | number | null>) => sqlite.prepare(query).get(...params) as Record<string, unknown> | undefined;
const count = (table: string) => Number(one(`select count(*) as n from "${table}"`)!.n);

function fakeBucket(keys: string[]) {
  const stored = new Set(keys);
  const bucket = {
    list: vi.fn(async ({ prefix }: { prefix: string }) => ({ objects: [...stored].filter(key => key.startsWith(prefix)).map(key => ({ key })), truncated: false })),
    delete: vi.fn(async (remove: string[]) => { for (const key of remove) stored.delete(key); }),
  };
  return { bucket: bucket as unknown as R2Bucket, stored, mock: bucket };
}

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    const source = readFileSync(resolve(migrationFolder, file), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params as never[]); return { rows: [] }; }
    if (method === "get") { const row = statement.get(...params as never[]); return { rows: row ? [row] : [] }; }
    return { rows: statement.all(...params as never[]) };
  }, { schema: { ...d1Schema, ...authSchema } }) as unknown as D1ScopedDatabase;
  (db as { $client: unknown }).$client = {
    prepare: (query: string) => ({ bind: (...params: unknown[]) => ({ query, params }) }),
    batch: async (statements: Array<{ query: string; params: never[] }>) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(({ query, params }) => ({ meta: { changes: Number(sqlite.prepare(query).run(...params).changes) } }));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };

  for (const [id, slug] of [["h1", "one"], ["h2", "two"]]) {
    exec(`insert into hotels (id, name, slug, address, owner_contact) values (?, ?, ?, 'Addr', 'o@example.test')`, id!, `Hotel ${id}`, slug!);
    exec(`insert into room_types (id, hotel_id, name, capacity, base_price) values (?, ?, 'Room', 2, '100')`, `rt-${id}`, id!);
    exec(`insert into rooms (id, hotel_id, room_type_id, room_number) values (?, ?, ?, '1')`, `r-${id}`, id!, `rt-${id}`);
    exec(`insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price) values (?, ?, ?, 'Guest', '2026-12-01', '2026-12-02', '100')`, `b-${id}`, id!, `r-${id}`);
    exec(`insert into guests (id, booking_id, first_name, last_name, passport_no, nationality_code, birth_date) values (?, ?, 'A', 'B', 'P123', 'THA', '1990-01-01')`, `g-${id}`, `b-${id}`);
    exec(`insert into hotel_users (id, hotel_id, user_id, role) values (?, ?, 'owner', 'hotel_owner')`, `own-${id}`, id!);
    exec(`insert into hotel_users (id, hotel_id, user_id, role) values (?, ?, 'staff', 'front_desk')`, `staff-${id}`, id!);
  }
  exec(`insert into ota_connections (id, hotel_id, provider, status, ical_import_url, ical_export_token) values ('c1', 'h1', 'agoda', 'active', 'https://ota.example/a.ics', ?)`, TOKEN);
  exec(`update bookings set created_ip_hash = 'secret-hash' where id = 'b-h1'`);
  exec(`insert into hotel_payment_settings (id, hotel_id, slipok_key_enc, promptpay_id) values ('p1', 'h1', 'secret-key', '0812345678')`);
  exec(`insert into support_access_grants (id, hotel_id, support_user_id, granted_by, mode, expires_at, created_at) values ('g1', 'h1', 'support-1', 'owner', 'edit', ?, ?)`, NOW.getTime() + 3_600_000, NOW.getTime());
  exec(`insert into hotel_signup_links (id, hotel_id, token, created_by, expires_at) values ('l1', 'h1', 't', 'owner', ?)`, after(5).getTime());
});

describe("requesting a closure", () => {
  it("stops the hotel at once and leaves the owner's other hotel alone", async () => {
    await requestHotelClosure(db, owner, "h1", NOW);

    expect(one(`select public_enabled from hotels where id = 'h1'`)!.public_enabled).toBe(0);
    expect(one(`select revoked_at from support_access_grants where id = 'g1'`)!.revoked_at).toBe(NOW.getTime());
    expect(one(`select expires_at from hotel_signup_links where id = 'l1'`)!.expires_at).toBe(NOW.getTime());
    expect(await getOtaIcalExport(db, createD1SystemCallerContext(), TOKEN, NOW)).toBeNull();
    expect((await runScheduledD1OtaSync(db, { syncConnection: vi.fn() })).total).toBe(0);
    expect((await listManagedHotels(db, owner)).map(hotel => hotel.id)).toEqual(["h2"]);
    expect(await getManagedHotel(db, owner, "h2", NOW)).toMatchObject({ id: "h2" });
  });

  it("refuses every other action on the hotel, for the owner, staff and support", async () => {
    await requestHotelClosure(db, owner, "h1", NOW);
    for (const caller of [owner, staff, support]) {
      await expect(authorizeHotelAction(db, caller, "h1", "property.view", "bookings.read", NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("is the owner's alone", async () => {
    await expect(requestHotelClosure(db, staff, "h1", NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requestHotelClosure(db, support, "h1", NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requestHotelClosure(db, { userId: "owner", roles: ["super_admin"] }, "h1", NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(one(`select closure_requested_at from hotels where id = 'h1'`)!.closure_requested_at).toBeNull();
  });
});

describe("cancelling", () => {
  it("restores a published hotel inside the wait", async () => {
    await requestHotelClosure(db, owner, "h1", NOW);
    await cancelHotelClosure(db, owner, "h1", after(6));
    expect(one(`select public_enabled, closure_requested_at, closure_was_public from hotels where id = 'h1'`)).toEqual({ public_enabled: 1, closure_requested_at: null, closure_was_public: null });
    await expect(getManagedHotel(db, owner, "h1", after(6))).resolves.toMatchObject({ id: "h1" });
  });

  it("keeps a private hotel private", async () => {
    exec(`update hotels set public_enabled = 0 where id = 'h1'`);
    await requestHotelClosure(db, owner, "h1", NOW);
    await cancelHotelClosure(db, owner, "h1", after(1));
    expect(one(`select public_enabled from hotels where id = 'h1'`)!.public_enabled).toBe(0);
  });

  it("is refused once the seven days are over, and for anyone but the owner", async () => {
    await requestHotelClosure(db, owner, "h1", NOW);
    await expect(cancelHotelClosure(db, staff, "h1", after(1))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cancelHotelClosure(db, owner, "h1", after(7))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(one(`select closure_requested_at from hotels where id = 'h1'`)!.closure_requested_at).toBe(NOW.getTime());
  });
});

describe("the status list", () => {
  it("shows the owner the dates and what is still possible", async () => {
    await requestHotelClosure(db, owner, "h1", NOW);
    const timeline = closureTimeline(NOW);
    expect(await listOwnClosures(db, owner, after(1))).toEqual([expect.objectContaining({ id: "h1", ...timeline, can_cancel: true, can_export: true })]);
    expect(await listOwnClosures(db, owner, after(8))).toEqual([expect.objectContaining({ can_cancel: false, can_export: true })]);
    expect(await listOwnClosures(db, owner, after(37))).toEqual([expect.objectContaining({ can_cancel: false, can_export: false })]);
    expect(await listOwnClosures(db, staff, after(1))).toEqual([]);
  });
});

describe("exporting", () => {
  it("gives the owner guest data and no secrets", async () => {
    const data = await exportHotelData(db, owner, "h1", NOW);
    expect(data.guests).toEqual([expect.objectContaining({ booking_id: "b-h1", passport_no: "P123" })]);
    expect(data.bookings).toHaveLength(1);
    expect(data.payment_settings).toMatchObject({ promptpay_id: "0812345678" });
    const text = JSON.stringify(data);
    for (const secret of ["secret-key", "secret-hash", TOKEN, "b-h2"]) expect(text).not.toContain(secret);
  });

  it("works during closure until the 30 days run out, and only for the owner", async () => {
    await requestHotelClosure(db, owner, "h1", NOW);
    await expect(exportHotelData(db, owner, "h1", after(36))).resolves.toMatchObject({ hotel: { name: "Hotel h1" } });
    await expect(exportHotelData(db, owner, "h1", after(37))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(exportHotelData(db, staff, "h1", after(1))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(exportHotelData(db, support, "h1", after(1))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("purging", () => {
  it("does nothing before day 59 after the service ends", async () => {
    await requestHotelClosure(db, owner, "h1", NOW);
    const { bucket, mock } = fakeBucket([]);
    expect(await purgeClosedHotels(db, bucket, new Date(after(66).getTime() - 1))).toEqual({ due: 0, purged: 0 });
    expect(mock.list).not.toHaveBeenCalled();
    expect(count("hotels")).toBe(2);
  });

  it("deletes the hotel, its rows and its photos within 60 days, and keeps only the proof", async () => {
    exec(`insert into hotel_media (id, hotel_id, url) values ('m1', 'h1', '/media/h1/x.jpg')`);
    exec(`insert into booking_nights (room_id, night, booking_id) values ('r-h1', '2026-12-01', 'b-h1')`);
    await requestHotelClosure(db, owner, "h1", NOW);
    const { bucket, stored } = fakeBucket(["h1/x.jpg", "h2/y.jpg"]);

    expect(await purgeClosedHotels(db, bucket, after(66))).toEqual({ due: 1, purged: 1 });

    expect(sqlite.prepare(`select id from hotels`).all()).toEqual([{ id: "h2" }]);
    expect(count("guests")).toBe(1);
    expect(one(`select count(*) as n from guests where booking_id = 'b-h1'`)!.n).toBe(0);
    for (const table of ["bookings", "rooms", "room_types", "hotel_users", "ota_connections", "hotel_payment_settings", "hotel_media", "support_access_grants"]) {
      expect(one(`select count(*) as n from "${table}" where hotel_id = 'h1'`)!.n).toBe(0);
    }
    expect(one(`select count(*) as n from booking_nights where booking_id = 'b-h1'`)!.n).toBe(0);
    expect([...stored]).toEqual(["h2/y.jpg"]);
    expect(one(`select hotel_id, closure_requested_at, purged_at from hotel_purge_log`)).toEqual({ hotel_id: "h1", closure_requested_at: NOW.getTime(), purged_at: after(66).getTime() });
  });

  it("keeps the rows when R2 fails, so the next run can finish", async () => {
    await requestHotelClosure(db, owner, "h1", NOW);
    const { bucket, mock } = fakeBucket(["h1/x.jpg"]);
    mock.delete.mockRejectedValueOnce(new Error("R2 down"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await purgeClosedHotels(db, bucket, after(66))).toEqual({ due: 1, purged: 0 });
    expect(count("hotels")).toBe(2);
    expect(await purgeClosedHotels(db, bucket, after(66))).toEqual({ due: 1, purged: 1 });
    quiet.mockRestore();
  });

  it("does not need the owner's account to still exist", async () => {
    exec(`delete from hotel_users where hotel_id = 'h2'`);
    exec(`insert into "user" (id, name, email, email_verified, created_at, updated_at) values ('owner', 'O', 'o@example.test', 1, ?, ?)`, NOW.getTime(), NOW.getTime());
    await requestHotelClosure(db, owner, "h1", NOW);
    await expect(deleteOwnAccount(db, { userId: "owner", access: "authenticated" }, after(1))).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await getAccountDeletionBlockers(db, { userId: "owner", access: "authenticated" }, after(7))).toMatchObject({ ownedHotels: [] });
    await deleteOwnAccount(db, { userId: "owner", access: "authenticated" }, after(7));
    expect(one(`select id from "user" where id = 'owner'`)).toBeUndefined();

    const { bucket } = fakeBucket([]);
    expect(await purgeClosedHotels(db, bucket, after(66))).toEqual({ due: 1, purged: 1 });
  });
});
