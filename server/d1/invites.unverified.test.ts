import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelUsers, hotels } from "../../drizzle/d1-schema";
import { account, session, twoFactor, user, verification } from "../../drizzle/auth-schema";
import type { D1CallerContext, D1ScopedDatabase } from "../db/scope";
import { MockEmailSender } from "../email";
import { acceptStaffInvite, inviteStaffUser } from "./invites";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;
let emails: MockEmailSender;

const EMAIL = "victim@example.test";
const USER_ID = "pre-registered";
const owner: D1CallerContext = { userId: "owner", roles: ["hotel_owner"], access: "authenticated" };

async function seedPreRegisteredAccount(emailVerified = false) {
  const now = new Date();
  await db.insert(user).values({ id: USER_ID, name: "Attacker", email: EMAIL, emailVerified, twoFactorEnabled: true, createdAt: now, updatedAt: now });
  await db.insert(account).values({ id: "attacker-credential", userId: USER_ID, accountId: USER_ID, providerId: "credential", password: "attacker-hash", createdAt: now, updatedAt: now });
  await db.insert(session).values({ id: "attacker-session", userId: USER_ID, token: "attacker-token", expiresAt: new Date(Date.now() + 3600000), createdAt: now, updatedAt: now });
  await db.insert(twoFactor).values({ id: "attacker-2fa", userId: USER_ID, secret: "s", backupCodes: "b" });
}

const invite = () => inviteStaffUser(db, owner, emails, { hotel_id: "hotel-a", email: EMAIL, role: "front_desk" }, "https://app.example.test");
const membership = () => db.select().from(hotelUsers).where(and(eq(hotelUsers.hotelId, "hotel-a"), eq(hotelUsers.userId, USER_ID)));
const emailedToken = () => /token=([^"\s]+)/.exec(emails.getLastEmail()?.text ?? "")?.[1] ?? "";

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
  emails = new MockEmailSender();
  await db.insert(hotels).values({ id: "hotel-a", name: "A", slug: "a", address: "A", ownerContact: "owner@example.test", publicEnabled: true });
  await db.insert(hotelUsers).values({ hotelId: "hotel-a", userId: "owner", role: "hotel_owner" });
});

afterEach(() => sqlite.close());

describe("inviting an address that was already self-registered", () => {
  it("grants no role to an unverified account until the emailed token is used", async () => {
    await seedPreRegisteredAccount();

    await expect(invite()).resolves.toMatchObject({ membership: null, invitationSent: true, isNewUser: false });

    expect(await membership()).toHaveLength(0);
    expect(emailedToken()).not.toBe("");
  });

  it("removes every credential of the registrant when the invite is accepted", async () => {
    await seedPreRegisteredAccount();
    await invite();

    await acceptStaffInvite(db, { token: emailedToken(), password: "password-123" }, async password => `hashed:${password}`);

    const [credential] = await db.select().from(account).where(eq(account.userId, USER_ID));
    expect(credential?.password).toBe("hashed:password-123");
    expect(await db.select().from(session).where(eq(session.userId, USER_ID))).toHaveLength(0);
    expect(await db.select().from(twoFactor).where(eq(twoFactor.userId, USER_ID))).toHaveLength(0);
    const [row] = await db.select().from(user).where(eq(user.id, USER_ID));
    expect(row).toMatchObject({ emailVerified: true, twoFactorEnabled: false });
    expect(await membership()).toMatchObject([{ role: "front_desk" }]);
  });

  it("issues a single live token when the owner re-sends the invite", async () => {
    await seedPreRegisteredAccount();
    await invite();
    const firstToken = emailedToken();
    await invite();

    await expect(acceptStaffInvite(db, { token: firstToken, password: "password-123" }, async password => password)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await db.select().from(verification)).toHaveLength(1);
  });

  it("removes the pending token when the invite email fails", async () => {
    await seedPreRegisteredAccount();
    emails.sendInviteEmail = async () => { throw new Error("delivery failed"); };

    await expect(invite()).rejects.toThrow("delivery failed");

    expect(await db.select().from(verification)).toHaveLength(0);
  });

  it("still assigns a verified account immediately", async () => {
    await seedPreRegisteredAccount(true);

    await invite();

    expect(await membership()).toMatchObject([{ role: "front_desk" }]);
  });
});
