import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETED_USER_ID } from "@shared/accountDeletion";
import { authSchema } from "../../drizzle/auth-schema";
import { d1Schema } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { checkAccountPassword, deleteOwnAccount, getAccountDeletionBlockers } from "./accountDeletion";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

const NOW = new Date("2026-10-31T10:00:00.000Z");
const nowMs = NOW.getTime();
const later = nowMs + 3_600_000;
const USER = "user-to-delete-0001";
const EMAIL = "leaver@example.test";
const self = { userId: USER, access: "authenticated" } as const;
const exec = (query: string, ...params: Array<string | number | null>) => sqlite.prepare(query).run(...params);
const one = (query: string, ...params: Array<string | number | null>) => sqlite.prepare(query).get(...params) as Record<string, unknown> | undefined;
const count = (table: string) => Number(one(`select count(*) as n from "${table}"`)!.n);

function addUser(id: string, email: string) {
  exec(`insert into "user" (id, name, email, email_verified, created_at, updated_at) values (?, 'Name', ?, 1, ?, ?)`, id, email, nowMs, nowMs);
  exec(`insert into session (id, expires_at, token, created_at, updated_at, user_id) values (?, ?, ?, ?, ?, ?)`, `s-${id}`, later, `t-${id}`, nowMs, nowMs, id);
  exec(`insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) values (?, ?, 'credential', ?, 'hash', ?, ?)`, `a-${id}`, id, id, nowMs, nowMs);
}
const addVerification = (identifier: string, value: string) =>
  exec(`insert into verification (id, identifier, value, expires_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?)`, crypto.randomUUID(), identifier, value, later, nowMs, nowMs);
const addMember = (hotelId: string, userId: string, role: string) =>
  exec(`insert into hotel_users (id, hotel_id, user_id, role) values (?, ?, ?, ?)`, crypto.randomUUID(), hotelId, userId, role);
const addAdmin = (userId: string, email: string) =>
  exec(`insert into platform_admins (id, user_id, email, invited_by, accepted_at) values (?, ?, ?, 'root', ?)`, crypto.randomUUID(), userId, email, nowMs);

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
  exec(`insert into hotels (id, name, slug, address, owner_contact) values ('h1', 'Hotel One', 'h1', 'Addr', ?)`, ` ${EMAIL.toUpperCase()} `);
  addUser(USER, EMAIL);
  addUser("colleague", "colleague@example.test");
  addMember("h1", "colleague", "hotel_owner");
  exec(`insert into room_types (id, hotel_id, name, capacity, base_price) values ('rt', 'h1', 'Room', 2, '100')`);
  exec(`insert into rooms (id, hotel_id, room_type_id, room_number) values ('r1', 'h1', 'rt', '1')`);
});
afterEach(() => sqlite.close());

/** Every text cell in the database, so a table added later without handling fails here. */
function allCells() {
  const tables = sqlite.prepare(`select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '\\_%' escape '\\'`).all() as Array<{ name: string }>;
  return tables.flatMap(({ name }) => (sqlite.prepare(`select * from "${name}"`).all() as Array<Record<string, unknown>>)
    .flatMap(row => Object.entries(row).map(([column, value]) => ({ table: name, column, value: String(value) }))));
}

function seedEverything() {
  addMember("h1", USER, "front_desk");
  exec(`insert into two_factor (id, secret, backup_codes, user_id) values ('tf', 'sec', 'codes', ?)`, USER);
  addVerification("reset-password:token", USER);
  addVerification("mfa-step-up:s1", USER);
  addVerification(`account-delete-attempts:${USER}`, "2");
  addVerification(`invite:${EMAIL}`, "tok-1");
  addVerification(`support-invite:${EMAIL}`, "tok-2");
  addVerification(`platform-invite:${EMAIL}`, "tok-3");
  addVerification(`hotel-invite:h1:front_desk:colleague:${EMAIL}`, "tok-4");
  addVerification(`hotel-invite:h1:front_desk:${USER}:someone@example.test`, "tok-5");
  addVerification("hotel-invite:h1:front_desk:colleague:keep@example.test", "tok-keep");
  exec(`insert into support_accounts (id, user_id, email, invited_by, accepted_at) values ('sa', ?, ?, 'root', ?)`, USER, EMAIL, nowMs);
  exec(`insert into support_accounts (id, user_id, email, invited_by) values ('sa2', 'other', 'other@example.test', ?)`, USER);
  addAdmin("root", "root@example.test");
  addAdmin(USER, EMAIL);
  exec(`insert into platform_admins (id, user_id, email, invited_by) values ('pa2', 'other', 'other@example.test', ?)`, USER);
  exec(`insert into support_access_grants (id, hotel_id, support_user_id, granted_by, mode, expires_at, created_at) values ('g1', 'h1', ?, 'colleague', 'view', ?, ?)`, USER, later, nowMs);
  exec(`insert into support_access_grants (id, hotel_id, support_user_id, granted_by, mode, expires_at, created_at) values ('g2', 'h1', 'other', ?, 'view', ?, ?)`, USER, later, nowMs);
  exec(`insert into support_access_log (id, hotel_id, support_user_id, action) values ('l1', 'h1', ?, 'access.supportAccess:{"hotelId":"h1"}')`, USER);
  exec(`insert into support_access_log (id, hotel_id, support_user_id, action) values ('l2', 'h1', 'other', ?)`, `denied:access.grantSupport:{"hotelId":"h1","supportEmail":"${EMAIL.toUpperCase()}"}`);
  exec(`insert into support_access_log (id, hotel_id, support_user_id, action) values ('l3', 'h1', 'other', ?)`, `access.updateStaffPermissions:{"hotelId":"h1","targetUserId":"${USER}"}`);
  exec(`insert into support_access_log (id, hotel_id, support_user_id, action) values ('l4', 'h1', 'other', 'channelManager.bookings:{"hotel_id":"h1"}')`);
  exec(`insert into hotel_admin_audit_logs (id, hotel_id, actor_user_id, actor_email, action, previous_admin_membership_id, previous_admin_user_id, new_admin_membership_id, new_admin_user_id, details)
    values ('al', 'h1', ?, ?, 'hotel_admin_transfer', 'm1', ?, 'm2', ?, ?)`, USER, EMAIL, USER, USER, JSON.stringify({ email: EMAIL }));
  exec(`insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, created_by) values ('b1', 'h1', 'r1', 'Guest Keep', '2026-11-01', '2026-11-02', '100', ?)`, USER);
  exec(`insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price) values ('b2', 'h1', 'r1', 'Public Guest', '2026-11-03', '2026-11-04', '100')`);
  exec(`insert into guests (id, booking_id, first_name, last_name, passport_no, nationality_code, birth_date) values ('gu', 'b1', 'A', 'B', 'P1', 'THA', '1990-01-01')`);
  exec(`insert into booking_status_log (id, booking_id, to_status, changed_by, reason) values ('bl', 'b1', 'cancelled', ?, 'staff')`, USER);
  exec(`insert into booking_status_log (id, booking_id, to_status, changed_by, reason) values ('bl2', 'b2', 'cancelled', null, 'ota_ical_removed_from_feed')`);
  exec(`insert into message_threads (id, hotel_id, booking_id) values ('th', 'h1', 'b1')`);
  exec(`insert into messages (id, thread_id, sender_user_id, body) values ('me', 'th', ?, 'Hello guest')`, USER);
  exec(`insert into housekeeping_tasks (id, room_id, assigned_to, due_date) values ('ht', 'r1', ?, '2026-11-01')`, USER);
  exec(`insert into room_housekeeping_status (room_id, updated_by) values ('r1', ?)`, USER);
  exec(`insert into hotel_signup_links (id, hotel_id, token, created_by, expires_at) values ('sl1', 'h1', 'open', ?, ?)`, USER, later);
  exec(`insert into hotel_signup_links (id, hotel_id, token, created_by, expires_at, used_at, used_by_user_id) values ('sl2', 'h1', 'used', 'root', ?, ?, ?)`, later, nowMs, USER);
}

describe("deleteOwnAccount", () => {
  it("leaves no trace of the id or email anywhere in the database", async () => {
    seedEverything();
    await deleteOwnAccount(db, self, NOW);

    const leftovers = allCells().filter(cell => cell.value.includes(USER) || cell.value.toLowerCase().includes(EMAIL));
    expect(leftovers).toEqual([]);
  });

  it("removes the account and its logins, and nobody else's", async () => {
    seedEverything();
    await deleteOwnAccount(db, self, NOW);

    expect(one(`select id from "user" where id = ?`, USER)).toBeUndefined();
    expect(count("session")).toBe(1);
    expect(count("account")).toBe(1);
    expect(count("two_factor")).toBe(0);
    expect(one(`select id from "user" where id = 'colleague'`)).toBeDefined();
    expect(one(`select id from hotel_users where user_id = 'colleague'`)).toBeDefined();
  });

  it("keeps only unrelated invites", async () => {
    seedEverything();
    await deleteOwnAccount(db, self, NOW);

    expect(sqlite.prepare("select value from verification").all()).toEqual([{ value: "tok-keep" }]);
  });

  it("revokes live support keys the person held or granted", async () => {
    seedEverything();
    await deleteOwnAccount(db, self, NOW);

    expect(one(`select support_user_id, revoked_at from support_access_grants where id = 'g1'`)).toEqual({ support_user_id: DELETED_USER_ID, revoked_at: nowMs });
    expect(one(`select granted_by, revoked_at from support_access_grants where id = 'g2'`)).toEqual({ granted_by: DELETED_USER_ID, revoked_at: nowMs });
  });

  it("redacts audit text only where it names the person", async () => {
    seedEverything();
    await deleteOwnAccount(db, self, NOW);

    expect(one(`select action from support_access_log where id = 'l2'`)!.action).toBe('denied:access.grantSupport:{"redacted":true}');
    expect(one(`select action from support_access_log where id = 'l3'`)!.action).toBe('access.updateStaffPermissions:{"redacted":true}');
    expect(one(`select action from support_access_log where id = 'l4'`)!.action).toBe('channelManager.bookings:{"hotel_id":"h1"}');
  });

  it("keeps the hotel's records", async () => {
    seedEverything();
    await deleteOwnAccount(db, self, NOW);

    expect(one(`select guest_name, created_by from bookings where id = 'b1'`)).toEqual({ guest_name: "Guest Keep", created_by: DELETED_USER_ID });
    expect(count("guests")).toBe(1);
    expect(count("hotel_admin_audit_logs")).toBe(1);
    expect(count("support_access_log")).toBe(4);
    expect(one(`select body, sender_user_id from messages where id = 'me'`)).toEqual({ body: "Hello guest", sender_user_id: DELETED_USER_ID });
    expect(one(`select name, owner_contact from hotels where id = 'h1'`)).toEqual({ name: "Hotel One", owner_contact: "" });
  });

  it("does not turn a staff cancellation into an automatic OTA one", async () => {
    seedEverything();
    await deleteOwnAccount(db, self, NOW);

    expect(one(`select changed_by from booking_status_log where id = 'bl'`)!.changed_by).toBe(DELETED_USER_ID);
    expect(one(`select changed_by from booking_status_log where id = 'bl2'`)!.changed_by).toBeNull();
    expect(one(`select created_by from bookings where id = 'b2'`)!.created_by).toBeNull();
  });

  it("unassigns housekeeping work and ends unused signup links", async () => {
    seedEverything();
    await deleteOwnAccount(db, self, NOW);

    expect(one(`select assigned_to from housekeeping_tasks where id = 'ht'`)!.assigned_to).toBeNull();
    expect(one(`select updated_by from room_housekeeping_status where room_id = 'r1'`)!.updated_by).toBeNull();
    expect(one(`select created_by, expires_at from hotel_signup_links where id = 'sl1'`)).toEqual({ created_by: DELETED_USER_ID, expires_at: nowMs });
    expect(one(`select used_by_user_id from hotel_signup_links where id = 'sl2'`)!.used_by_user_id).toBe(DELETED_USER_ID);
  });

  it("refuses a hotel owner and changes nothing", async () => {
    exec(`insert into hotels (id, name, slug, address, owner_contact) values ('h2', 'Hotel Two', 'h2', 'Addr', 'c')`);
    addMember("h2", USER, "hotel_owner");
    exec(`insert into bookings (id, hotel_id, guest_name, check_in, check_out, price, created_by) values ('b9', 'h2', 'G', '2026-11-01', '2026-11-02', '100', ?)`, USER);
    const before = allCells();

    await expect(deleteOwnAccount(db, self, NOW)).rejects.toMatchObject({ code: "CONFLICT" });

    expect(allCells()).toEqual(before);
  });

  it("refuses the last platform admin but not one of two", async () => {
    addAdmin(USER, EMAIL);
    await expect(deleteOwnAccount(db, self, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(one(`select id from "user" where id = ?`, USER)).toBeDefined();

    addAdmin("root", "root@example.test");
    await expect(deleteOwnAccount(db, self, NOW)).resolves.toEqual({ success: true });
  });

  it("does not count a disabled or unaccepted admin as a remaining one", async () => {
    addAdmin(USER, EMAIL);
    exec(`insert into platform_admins (id, user_id, email, invited_by) values ('p', 'pending', 'p@example.test', 'root')`);
    exec(`insert into platform_admins (id, user_id, email, invited_by, accepted_at, disabled_at) values ('d', 'off', 'd@example.test', 'root', ?, ?)`, nowMs, nowMs);

    await expect(deleteOwnAccount(db, self, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses a public caller", async () => {
    await expect(deleteOwnAccount(db, { userId: "", access: "public" }, NOW)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("getAccountDeletionBlockers", () => {
  it("names every hotel the person owns", async () => {
    exec(`insert into hotels (id, name, slug, address, owner_contact) values ('h2', 'Hotel Two', 'h2', 'Addr', 'c')`);
    addMember("h2", USER, "hotel_owner");
    addMember("h1", USER, "front_desk");

    await expect(getAccountDeletionBlockers(db, self)).resolves.toEqual({ ownedHotels: [{ id: "h2", name: "Hotel Two" }], lastPlatformAdmin: false });
  });

  it("finds nothing for ordinary staff", async () => {
    addMember("h1", USER, "housekeeping");
    await expect(getAccountDeletionBlockers(db, self)).resolves.toEqual({ ownedHotels: [], lastPlatformAdmin: false });
  });
});

describe("checkAccountPassword", () => {
  const headers = new Headers({ cookie: "session=abc" });
  const wrong = Object.assign(new Error("Invalid password"), { status: "BAD_REQUEST" });
  const check = (verifyPassword: ReturnType<typeof vi.fn>) =>
    checkAccountPassword({ auth: { api: { verifyPassword } } as never, db, headers, userId: USER, password: "pw", now: NOW });

  it("accepts the right password", async () => {
    const verifyPassword = vi.fn().mockResolvedValue({ status: true });
    await expect(check(verifyPassword)).resolves.toBeUndefined();
    expect(verifyPassword).toHaveBeenCalledWith({ headers, body: { password: "pw" } });
  });

  it("locks after five wrong passwords, without asking Better Auth again", async () => {
    const verifyPassword = vi.fn().mockRejectedValue(wrong);
    for (let attempt = 0; attempt < 5; attempt++) await expect(check(verifyPassword)).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(check(verifyPassword)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(verifyPassword).toHaveBeenCalledTimes(5);
  });

  it("starts counting again after the window", async () => {
    addVerification(`account-delete-attempts:${USER}`, "5");
    exec(`update verification set expires_at = ?`, nowMs - 1);
    const verifyPassword = vi.fn().mockRejectedValue(wrong);

    await expect(check(verifyPassword)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(sqlite.prepare("select value from verification").all()).toEqual([{ value: "1" }]);
  });

  it("does not count an outage as a wrong password", async () => {
    const outage = new Error("database down");
    await expect(check(vi.fn().mockRejectedValue(outage))).rejects.toBe(outage);
    expect(count("verification")).toBe(0);
  });
});
