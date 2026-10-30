// Proving tests for .agent/reviews/cloud-access-review.md. Each `it.fails` documents a
// reproduced defect on agent-s/support-access: the body asserts the SAFE behaviour and
// currently fails. When a fix lands, vitest reports the `it.fails` as failing — flip it
// to `it` at that point so it becomes a regression test.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelUsers, hotels, supportAccessLog } from "../drizzle/d1-schema";
import type { D1ScopedDatabase } from "./db/scope";
import { createContextFromRequest } from "./_core/context";
import { appRouter } from "./routers";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/d1");
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
});
afterEach(() => sqlite.close());

const HOTEL_A = "11111111-1111-4111-8111-111111111111";
const HOTEL_B = "22222222-2222-4222-8222-222222222222";

async function seed() {
  await db.insert(hotels).values([
    { id: HOTEL_A, name: "A", slug: "a", address: "A", ownerContact: "A" },
    { id: HOTEL_B, name: "B", slug: "b", address: "B", ownerContact: "B" },
  ]);
  await db.insert(hotelUsers).values([
    { hotelId: HOTEL_A, userId: "owner-a", role: "hotel_owner" },
    { hotelId: HOTEL_B, userId: "owner-b", role: "hotel_owner" },
    { hotelId: HOTEL_A, userId: "support", role: "support" },
  ]);
}

/** A caller built through the real session context, exactly as a request would be. */
async function callerFor(userId: string) {
  const auth = { api: { getSession: async () => ({ user: { id: userId, email: `${userId}@test` }, session: { token: "session" } }) } };
  const ctx = await createContextFromRequest({ headers: { cookie: "session=test" }, db, auth: auth as any });
  return appRouter.createCaller(ctx);
}

describe("cloud access review: support audit log", () => {
  beforeEach(seed);

  // Finding 1: logSupportProcedure stores raw, pre-Zod input values. A support account
  // with no grant for hotel B writes arbitrary, unbounded text into B's audit history.
  it.fails("does not store unvalidated or unbounded request values in another hotel's audit log", async () => {
    const app = await callerFor("support");
    const forged = `OWNER APPROVED THIS BY PHONE ${"x".repeat(20_000)}`;
    await expect(app.payment.manualVerify({ hotel_id: HOTEL_B, booking_id: forged, approved: true } as any))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    const log = await db.select().from(supportAccessLog);
    for (const row of log) {
      expect(row.action).not.toContain("OWNER APPROVED THIS BY PHONE");
      expect(row.action.length).toBeLessThan(1_000);
    }
  });

  // Finding 2: denials of procedures whose input carries no hotel id are dropped by
  // logSupportProcedure (`typeof hotelId !== "string"`), so these attempts leave no trace.
  it.fails("records support denials of platform and cross-hotel procedures", async () => {
    const app = await callerFor("support");
    await expect(app.access.platformSummary()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(app.channelManager.financials()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(app.staff.adminUsers()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(app.notifications.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    const actions = (await db.select().from(supportAccessLog)).map(row => row.action);
    for (const path of ["access.platformSummary", "channelManager.financials", "staff.adminUsers", "notifications.list"]) {
      expect(actions.some(action => action.startsWith(`denied:${path}`))).toBe(true);
    }
  });
});
