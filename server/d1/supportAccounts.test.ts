import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelUsers, hotels, supportAccessGrants, supportAccounts } from "../../drizzle/d1-schema";
import { user, verification } from "../../drizzle/auth-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { MockEmailSender } from "../email";
import { acceptStaffInvite } from "./invites";
import {
  disableSupportAccount, findSupportUserIdByEmail, getSupportMemberships, grantSupportAccess,
  inviteSupportAccount, isActiveSupportAccount, listSupportAccess, listSupportAccounts,
} from "./supportAccess";
import { getManagedHotel } from "./hotel";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;
let mail: MockEmailSender;

const superAdmin = { userId: "root", roles: ["super_admin"], access: "authenticated" } as any;
const owner = { userId: "owner", roles: ["hotel_owner"], access: "authenticated" } as any;
const EMAIL = "support@example.test";

beforeEach(async () => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    const source = readFileSync(resolve(migrationFolder, file), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    if (method === "get") { const row = statement.get(...params); return { rows: row ? [row] : [] }; }
    return { rows: statement.all(...params) };
  }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
  mail = new MockEmailSender();
  await db.insert(hotels).values({ id: "hotel-a", name: "A", slug: "a", address: "A", ownerContact: "owner@example.test", publicEnabled: true });
  await db.insert(hotelUsers).values({ id: "m-root", hotelId: "hotel-a", userId: "root", role: "super_admin", permissionGrants: [], permissionRevokes: [] });
  await db.insert(hotelUsers).values({ id: "m-owner", hotelId: "hotel-a", userId: "owner", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
});

afterEach(() => sqlite.close());

const invite = (email = EMAIL) => inviteSupportAccount(db, superAdmin, mail, { email }, "https://app.example.test");
const tokenFromMail = () => /token=([^"\s<]+)/.exec(mail.getLastEmail()!.text!)![1]!;
const accept = () => acceptStaffInvite(db, { token: tokenFromMail(), password: "password-123" }, async password => `hashed:${password}`);
const accountRow = async () => (await db.select().from(supportAccounts).where(eq(supportAccounts.email, EMAIL)))[0]!;

describe("support account invitations", () => {
  it("does nothing until the invitee accepts by email", async () => {
    await invite();
    const row = await accountRow();

    expect(mail.getLastEmail()!.to).toBe(EMAIL);
    await expect(isActiveSupportAccount(db, row.userId)).resolves.toBe(false);
    await expect(findSupportUserIdByEmail(db, EMAIL)).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(accept()).resolves.toMatchObject({ success: true });

    await expect(isActiveSupportAccount(db, row.userId)).resolves.toBe(true);
    await expect(findSupportUserIdByEmail(db, " Support@Example.test ")).resolves.toBe(row.userId);
  });

  it("takes the invite link only once", async () => {
    await invite();
    const token = tokenFromMail();
    await accept();

    await expect(acceptStaffInvite(db, { token, password: "password-123" }, async password => password)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is refused for anyone but a super admin", async () => {
    await expect(inviteSupportAccount(db, owner, mail, { email: EMAIL })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listSupportAccounts(db, owner)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mail.getSentEmails()).toEqual([]);
  });

  it("refuses an email that already has an account, so nobody loses their own hotel", async () => {
    await db.insert(user).values({ id: "owner", name: "Owner", email: "owner@example.test", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });

    await expect(invite("OWNER@example.test")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(db.select().from(supportAccounts)).resolves.toEqual([]);
  });

  it("replaces the link when a pending invite is sent again", async () => {
    await invite();
    const firstToken = tokenFromMail();
    await invite();

    await expect(db.select().from(supportAccounts)).resolves.toHaveLength(1);
    await expect(db.select().from(verification).where(eq(verification.value, firstToken))).resolves.toEqual([]);
    await expect(accept()).resolves.toMatchObject({ success: true });
  });

  it("removes the account again when the email cannot be sent", async () => {
    mail.sendInviteEmail = async () => { throw new Error("delivery failed"); };

    await expect(invite()).rejects.toThrow("delivery failed");
    await expect(db.select().from(supportAccounts)).resolves.toEqual([]);
    await expect(db.select().from(user)).resolves.toEqual([]);
    await expect(db.select().from(verification)).resolves.toEqual([]);
  });
});

describe("an accepted support account", () => {
  async function acceptedSupport() {
    await invite();
    await accept();
    const { userId } = await accountRow();
    return { userId, caller: { userId, roles: ["support"], access: "authenticated" } as any };
  }

  it("reaches a hotel only through the owner's time-limited key", async () => {
    const { userId, caller } = await acceptedSupport();

    await expect(getSupportMemberships(db, caller)).resolves.toEqual([]);
    await expect(getManagedHotel(db, caller, "hotel-a")).rejects.toMatchObject({ code: "FORBIDDEN" });

    await grantSupportAccess(db, owner, { hotelId: "hotel-a", supportUserId: userId, durationHours: 1, mode: "view" });

    await expect(getManagedHotel(db, caller, "hotel-a")).resolves.toMatchObject({ id: "hotel-a" });
    expect(await getSupportMemberships(db, caller)).toMatchObject([{ hotelId: "hotel-a", mode: "view" }]);
  });

  it("shows the owner an email, not an opaque id", async () => {
    const { userId } = await acceptedSupport();
    await grantSupportAccess(db, owner, { hotelId: "hotel-a", supportUserId: userId, durationHours: 1, mode: "view" });

    const access = await listSupportAccess(db, owner, "hotel-a");

    expect(access.supportEmails[userId]).toBe(EMAIL);
  });

  it("can no longer receive a key once disabled, while a pending invite stops working", async () => {
    const { userId } = await acceptedSupport();
    const row = await accountRow();

    await disableSupportAccount(db, superAdmin, row.id);

    await expect(isActiveSupportAccount(db, userId)).resolves.toBe(false);
    await expect(findSupportUserIdByEmail(db, EMAIL)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(grantSupportAccess(db, owner, { hotelId: "hotel-a", supportUserId: userId, durationHours: 1, mode: "view" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(db.select().from(supportAccessGrants)).resolves.toEqual([]);
  });

  it("a staff invite token cannot turn into support", async () => {
    await db.insert(user).values({ id: "staff", name: "Staff", email: "staff@example.test", emailVerified: false, createdAt: new Date(), updatedAt: new Date() });
    await db.insert(verification).values({ id: "v", identifier: "invite:staff@example.test", value: "staff-token", expiresAt: new Date(Date.now() + 3600000), createdAt: new Date(), updatedAt: new Date() });

    await acceptStaffInvite(db, { token: "staff-token", password: "password-123" }, async password => password);

    await expect(isActiveSupportAccount(db, "staff")).resolves.toBe(false);
  });
});
