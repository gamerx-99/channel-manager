import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { account, user } from "../../drizzle/auth-schema";
import { d1Schema, hotelSubscriptions, hotelUsers, hotels } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { getAccountProfile } from "./accountProfile";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

const NOW = new Date("2026-11-10T00:00:00.000Z");
const DAY = 86_400_000;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const name of readdirSync(migrationFolder).filter(file => file.endsWith(".sql")).sort()) {
    const source = readFileSync(resolve(migrationFolder, name), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    if (method === "get") { const row = statement.get(...params); return { rows: row ? [row] : [] }; }
    return { rows: statement.all(...params) };
  }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
});

afterEach(() => sqlite.close());

async function seed() {
  // u1 signed up 20 days ago (trial over) and owns two hotels; u2 signed up today and owns a third, where u1 is front desk.
  await db.insert(user).values({ id: "u1", name: "Anan Rakthai", firstName: "Anan", lastName: "Rakthai", phone: "0812345678", email: "anan@example.test", emailVerified: true, createdAt: new Date(NOW.getTime() - 20 * DAY) });
  await db.insert(user).values({ id: "u2", name: "Boon", email: "boon@example.test", createdAt: NOW });
  await db.insert(account).values([
    { id: "a1", accountId: "u1", providerId: "credential", userId: "u1", password: "hash-never-returned", accessToken: "token-never-returned" },
    { id: "a2", accountId: "google-1", providerId: "google", userId: "u1", accessToken: "token-never-returned" },
    { id: "a3", accountId: "u2", providerId: "credential", userId: "u2" },
  ]);
  for (const [id, name, owner] of [["h-a", "Baan Ruam", "u1"], ["h-b", "Doi View", "u1"], ["h-c", "Other Hotel", "u2"]] as const) {
    await db.insert(hotels).values({ id, name, slug: id, address: "address", ownerContact: owner, publicEnabled: id === "h-b" });
    await db.insert(hotelUsers).values({ id: `m-${id}`, hotelId: id, userId: owner, role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
  }
  await db.insert(hotelUsers).values({ id: "m-staff", hotelId: "h-c", userId: "u1", role: "front_desk", permissionGrants: [], permissionRevokes: [] });
  await db.insert(hotelSubscriptions).values({ hotelId: "h-b", paidUntil: new Date(NOW.getTime() + 10 * DAY) });
}

describe("getAccountProfile", () => {
  it("returns the personal details of the signed-in account", async () => {
    await seed();
    const profile = await getAccountProfile(db, { userId: "u1" }, "u1", NOW);
    expect(profile).toMatchObject({ id: "u1", name: "Anan Rakthai", firstName: "Anan", lastName: "Rakthai", phone: "0812345678", email: "anan@example.test", emailVerified: true });
  });

  it("lists the sign-in methods by provider only, never tokens or password hashes", async () => {
    await seed();
    const profile = await getAccountProfile(db, { userId: "u1" }, "u1", NOW);
    expect(profile.linkedAccounts).toEqual(["credential", "google"]);
    expect(JSON.stringify(profile)).not.toContain("never-returned");
  });

  it("gives each owned hotel its own plan: the plan belongs to the hotel, not the account", async () => {
    await seed();
    const profile = await getAccountProfile(db, { userId: "u1" }, "u1", NOW);
    expect(profile.ownedHotels.map(hotel => [hotel.name, hotel.plan])).toEqual([["Baan Ruam", "free"], ["Doi View", "pro"]]);
    const pro = profile.ownedHotels.find(hotel => hotel.id === "h-b");
    expect(pro?.daysLeft).toBe(10);
    expect(pro?.planEndsAt?.getTime()).toBe(NOW.getTime() + 10 * DAY);
    expect(profile.ownedHotels.find(hotel => hotel.id === "h-a")).toMatchObject({ plan: "free", planEndsAt: null, publicEnabled: false });
  });

  it("lists only hotels the account owns, not hotels where it is staff, and never another account's hotels", async () => {
    await seed();
    const u1 = await getAccountProfile(db, { userId: "u1" }, "u1", NOW);
    expect(u1.ownedHotels.map(hotel => hotel.id)).toEqual(["h-a", "h-b"]);
    const u2 = await getAccountProfile(db, { userId: "u2" }, "u2", NOW);
    expect(u2.ownedHotels.map(hotel => [hotel.id, hotel.plan])).toEqual([["h-c", "trial"]]);
    expect(u2.linkedAccounts).toEqual(["credential"]);
    expect(u2.phone).toBeNull();
  });

  it("returns an empty hotel list for an account that owns none", async () => {
    await db.insert(user).values({ id: "u3", name: "No Hotel", email: "none@example.test" });
    const profile = await getAccountProfile(db, { userId: "u3" }, "u3", NOW);
    expect(profile.ownedHotels).toEqual([]);
    expect(profile.linkedAccounts).toEqual([]);
  });

  it("rejects an account that does not exist", async () => {
    await expect(getAccountProfile(db, { userId: "ghost" }, "ghost", NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
