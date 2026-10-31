import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelUsers, hotels } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { appRouter } from "../routers";
import { registerOwnHotel } from "./hotel";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

const newAccount = { userId: "new-user", roles: [], access: "authenticated" } as any;
const input = { name: "Baan A", slug: "baan-a", address: "Mae Hong Son", owner_contact: "0800000000" };

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
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    if (method === "get") { const row = statement.get(...params); return { rows: row ? [row] : [] }; }
    return { rows: statement.all(...params) };
  }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
});

afterEach(() => sqlite.close());

describe("registerOwnHotel", () => {
  it("makes a new account the owner of a private hotel", async () => {
    const hotel = await registerOwnHotel(db, newAccount, input);

    const [row] = await db.select().from(hotels);
    expect(row).toMatchObject({ id: hotel.id, slug: "baan-a", publicEnabled: false });
    await expect(db.select().from(hotelUsers)).resolves.toMatchObject([{ hotelId: hotel.id, userId: "new-user", role: "hotel_owner" }]);
  });

  it("allows one hotel per account", async () => {
    await registerOwnHotel(db, newAccount, input);

    await expect(registerOwnHotel(db, newAccount, { ...input, slug: "baan-b" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(db.select().from(hotels)).resolves.toHaveLength(1);
  });

  it.each(["super_admin", "admin", "support"])("refuses a %s account", async role => {
    await expect(registerOwnHotel(db, { ...newAccount, roles: [role] }, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(db.select().from(hotels)).resolves.toEqual([]);
  });

  it.each(["login", "signup", "dashboard", "api"])("refuses the app route %s as a web address", async slug => {
    await expect(registerOwnHotel(db, newAccount, { ...input, slug })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("reports a taken web address as a conflict through the router", async () => {
    await db.insert(hotels).values({ id: "hotel-a", name: "A", slug: "baan-a", address: "A", ownerContact: "a", publicEnabled: false });
    const user = { id: "new-user", email: "new@example.test", name: "New", roles: [], appMetadata: {}, userMetadata: {}, accessToken: "" };
    const caller = appRouter.createCaller({ user, caller: newAccount, db, clientIp: "1.1.1.1" } as any);

    await expect(caller.channelManager.registerOwnHotel(input)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(db.select().from(hotelUsers)).resolves.toEqual([]);
  });

  it("requires a signed-in account", async () => {
    const caller = appRouter.createCaller({ user: null, caller: { userId: "", roles: [], access: "public" }, db, clientIp: "1.1.1.1" } as any);

    await expect(caller.channelManager.registerOwnHotel(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
