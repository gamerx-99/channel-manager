import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelUsers, hotels } from "../drizzle/d1-schema";
import type { D1ScopedDatabase } from "./db/scope";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

beforeEach(async () => {
  sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(resolve(migrationFolder, file), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query); statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    const row = method === "get" ? statement.get(...params) : statement.all(...params);
    return { rows: row ? (Array.isArray(row) ? row : [row]) : [] };
  }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
  await db.insert(hotels).values([
    { id: "live", name: "Live Hotel", slug: "live-hotel", address: "A", ownerContact: "o", publicEnabled: true },
    { id: "private", name: "Private Hotel", slug: "private-hotel", address: "B", ownerContact: "o", publicEnabled: false },
  ]);
  await db.insert(hotelUsers).values({ id: "m", hotelId: "live", userId: "owner", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
});
afterEach(() => sqlite.close());

async function signedInOwner(index: number) {
  const { appRouter } = await import("./routers");
  return appRouter.createCaller({
    clientIp: `public-caller-${index}`,
    db,
    caller: { userId: "owner", roles: ["hotel_owner"], access: "authenticated" },
    user: { id: "owner", email: null, name: null, accessToken: "t", appMetadata: {}, userMetadata: {}, role: "hotel_owner", roles: ["hotel_owner"], memberships: [{ hotelId: "live", role: "hotel_owner" }] },
  } as never);
}

describe("guest-facing hotel procedures for a signed-in viewer", () => {
  it("shows an owner their own published page as a guest sees it", async () => {
    const app = await signedInOwner(1);
    await expect(app.channelManager.publicHotel("live-hotel")).resolves.toMatchObject({ hotel: { slug: "live-hotel" } });
    await expect(app.channelManager.listPublicHotelServices({ slug: "live-hotel" })).resolves.toEqual([]);
  });

  it("still hides a private hotel", async () => {
    const app = await signedInOwner(2);
    await expect(app.channelManager.publicHotel("private-hotel")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("guest-facing procedures never forward the signed-in caller", () => {
  it("uses the public caller in every slug-based procedure", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "routers");
    for (const file of ["bookingRouter.ts", "hotelRouter.ts"]) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source).not.toContain("ctx.caller ?? { userId: '', roles: [], access: 'public' }");
    }
  });
});
