import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { d1Schema, hotelPaymentSettings, hotelUsers, hotels } from "../drizzle/d1-schema";
import { user } from "../drizzle/auth-schema";
import type { D1ScopedDatabase } from "./db/scope";
import { getPaymentSetupStatus } from "./d1/payment";

const dbMocks = vi.hoisted(() => ({ getPaymentSetupStatus: vi.fn() }));
const mfaMocks = vi.hoisted(() => ({ requireRecentMfaVerification: vi.fn() }));

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
const HOTEL = "11111111-1111-4111-8111-111111111111";
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

beforeEach(async () => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(resolve(migrationFolder, file), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query); statement.setReturnArrays(true);
    const values = params.map(value => typeof value === "boolean" ? Number(value) : value) as never[];
    if (method === "run") { statement.run(...values); return { rows: [] }; }
    const row = method === "get" ? statement.get(...values) : statement.all(...values);
    return { rows: row ? (Array.isArray(row) ? row : [row]) : [] };
  }, { schema: { ...d1Schema, user } }) as unknown as D1ScopedDatabase;
  await db.insert(hotels).values({ id: HOTEL, name: "Test", slug: "test", address: "A", ownerContact: "o@example.test" });
  await db.insert(user).values({ id: "owner-1", name: "Owner", email: "owner@example.test", emailVerified: true });
  await db.insert(hotelUsers).values({ id: "mem-owner", hotelId: HOTEL, userId: "owner-1", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
});
afterEach(() => sqlite.close());

const caller = () => ({ userId: "owner-1", roles: ["hotel_owner"], access: "authenticated" }) as never;

describe("getPaymentSetupStatus", () => {
  it("reports nothing configured for a hotel with no payment settings row", async () => {
    await expect(getPaymentSetupStatus(db, caller(), HOTEL)).resolves.toEqual({ promptpay_configured: false, slipok_configured: false, slipok_problem: null });
  });

  it("sees a saved PromptPay number but not SlipOK", async () => {
    await db.insert(hotelPaymentSettings).values({ hotelId: HOTEL, promptpayId: "0812345678" });
    await expect(getPaymentSetupStatus(db, caller(), HOTEL)).resolves.toEqual({ promptpay_configured: true, slipok_configured: false, slipok_problem: null });
  });

  it("needs the SlipOK key, its branch id and the switch on", async () => {
    await db.insert(hotelPaymentSettings).values({ hotelId: HOTEL, slipokKeyEnc: "enc", slipokKeyHash: "hash", slipokBranchId: "branch", slipokEnabled: true });
    await expect(getPaymentSetupStatus(db, caller(), HOTEL)).resolves.toMatchObject({ slipok_configured: true });

    sqlite.prepare("UPDATE hotel_payment_settings SET slipok_branch_id = NULL WHERE hotel_id = ?").run(HOTEL);
    await expect(getPaymentSetupStatus(db, caller(), HOTEL)).resolves.toMatchObject({ slipok_configured: false });

    sqlite.prepare("UPDATE hotel_payment_settings SET slipok_branch_id = 'branch', slipok_enabled = 0 WHERE hotel_id = ?").run(HOTEL);
    await expect(getPaymentSetupStatus(db, caller(), HOTEL)).resolves.toMatchObject({ slipok_configured: false });
  });

  it("never returns the secrets themselves", async () => {
    await db.insert(hotelPaymentSettings).values({ hotelId: HOTEL, promptpayId: "0812345678", slipokKeyEnc: "enc-secret", slipokKeyHash: "hash-secret", slipokBranchId: "branch-secret" });
    const status = await getPaymentSetupStatus(db, caller(), HOTEL);
    expect(Object.keys(status).sort()).toEqual(["promptpay_configured", "slipok_configured", "slipok_problem"]);
    expect(JSON.stringify(status)).not.toMatch(/secret|0812345678|branch/);
  });
});

describe("slipok.paymentSetupStatus (router)", () => {
  async function appFor(role: "hotel_owner" | "front_desk", twoFactorEnabled: boolean) {
    vi.resetModules();
    vi.doMock("./d1/payment", async () => ({ ...(await vi.importActual<object>("./d1/payment")), getPaymentSetupStatus: dbMocks.getPaymentSetupStatus }));
    vi.doMock("./mfa", () => mfaMocks);
    const { appRouter } = await import("./routers");
    return appRouter.createCaller({
      req: {} as Request,
      res: {} as Response,
      user: { id: "u1", email: "u@example.test", name: "U", accessToken: "t", appMetadata: {}, userMetadata: {}, role, roles: [role], memberships: [{ hotelId: HOTEL, role }], twoFactorEnabled },
      db: {} as never,
      caller: { userId: "u1", roles: [role], access: "authenticated" } as never,
    } as never);
  }

  beforeEach(() => { dbMocks.getPaymentSetupStatus.mockReset(); mfaMocks.requireRecentMfaVerification.mockReset(); });

  it("answers the hotel owner without asking for a 2FA step-up, even with 2FA on", async () => {
    dbMocks.getPaymentSetupStatus.mockResolvedValue({ promptpay_configured: true, slipok_configured: false });
    const app = await appFor("hotel_owner", true);
    await expect(app.slipok.paymentSetupStatus({ hotel_id: HOTEL })).resolves.toEqual({ promptpay_configured: true, slipok_configured: false });
    expect(mfaMocks.requireRecentMfaVerification).not.toHaveBeenCalled();
  });

  it("denies staff who cannot manage the hotel profile", async () => {
    const app = await appFor("front_desk", false);
    await expect(app.slipok.paymentSetupStatus({ hotel_id: HOTEL })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMocks.getPaymentSetupStatus).not.toHaveBeenCalled();
  });
});
