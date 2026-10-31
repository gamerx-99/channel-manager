import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelUsers, hotels, platformAdmins } from "../../drizzle/d1-schema";
import { user, verification } from "../../drizzle/auth-schema";
import { createContextFromRequest } from "../_core/context";
import { authorizeHotelAction, authorizePlatformAction, type D1ScopedDatabase } from "../db/scope";
import { isSuperAdmin } from "./auth";
import { acceptStaffInvite } from "./invites";
import { isActivePlatformAdmin } from "./platformAdmins";
import { listHotelUserAssignments } from "./staff";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

const EMAIL = "root@example.test";
const USER_ID = "root";

async function seedInvite(identifier = `platform-invite:${EMAIL}`) {
  const now = new Date();
  await db.insert(user).values({ id: USER_ID, name: "Root", email: EMAIL, emailVerified: false, createdAt: now, updatedAt: now });
  await db.insert(platformAdmins).values({ userId: USER_ID, email: EMAIL, invitedBy: "bootstrap", createdAt: now });
  await db.insert(verification).values({ id: "v", identifier, value: "token", expiresAt: new Date(Date.now() + 3600000), createdAt: now, updatedAt: now });
}

const accept = () => acceptStaffInvite(db, { token: "token", password: "password-123" }, async password => `hashed:${password}`);

async function contextForRoot() {
  const auth = { api: { getSession: async () => ({
    user: { id: USER_ID, email: EMAIL, name: "Root" },
    session: { token: "session-token" },
  }) } };
  return createContextFromRequest({ headers: { cookie: "session=1" }, db, auth: auth as any });
}

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
  await db.insert(hotels).values({ id: "hotel-a", name: "A", slug: "a", address: "A", ownerContact: "owner@example.test", publicEnabled: true });
});

afterEach(() => sqlite.close());

describe("platform super admin accounts", () => {
  it("gets no platform role until the invite is accepted", async () => {
    await seedInvite();

    await expect(isActivePlatformAdmin(db, USER_ID)).resolves.toBe(false);
    expect((await contextForRoot()).user?.roles).toEqual([]);

    await expect(accept()).resolves.toMatchObject({ success: true });

    await expect(isActivePlatformAdmin(db, USER_ID)).resolves.toBe(true);
    await expect(isSuperAdmin(db, { userId: USER_ID } as any)).resolves.toBe(true);
    const context = await contextForRoot();
    expect(context.user).toMatchObject({ role: "super_admin", roles: ["super_admin"], memberships: [] });
  });

  it("works on the platform without a hotel but never opens a hotel", async () => {
    await seedInvite();
    await accept();
    const { caller } = await contextForRoot();
    await db.insert(hotelUsers).values({ id: "m-owner", hotelId: "hotel-a", userId: "owner", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });

    await expect(authorizePlatformAction(db, caller!, "platform.manage_users")).resolves.toBeUndefined();
    await expect(listHotelUserAssignments(db, caller!)).resolves.toHaveLength(1);
    await expect(authorizeHotelAction(db, caller!, "hotel-a", "property.view", "test")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("loses the role when disabled", async () => {
    await seedInvite();
    await accept();

    await db.update(platformAdmins).set({ disabledAt: new Date() }).where(eq(platformAdmins.userId, USER_ID));

    await expect(isActivePlatformAdmin(db, USER_ID)).resolves.toBe(false);
    expect((await contextForRoot()).user?.roles).toEqual([]);
  });

  it("a staff invite token cannot turn into a super admin", async () => {
    await seedInvite(`invite:${EMAIL}`);

    await accept();

    await expect(isActivePlatformAdmin(db, USER_ID)).resolves.toBe(false);
  });
});
