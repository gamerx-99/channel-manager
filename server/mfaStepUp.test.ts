import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { d1Schema, hotelUsers, hotels } from "../drizzle/d1-schema";
import { authSchema, user } from "../drizzle/auth-schema";
import type { D1ScopedDatabase } from "./db/scope";
import { createContextFromRequest } from "./_core/context";
import { checkMfaStepUpStatus, requireRecentMfaVerification } from "./mfa";
import { getMfaStepUpVerifiedAt, recordMfaStepUp, verifyMfaStepUp } from "./mfaStepUp";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(resolve(migrationFolder, file), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query); statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    const row = method === "get" ? statement.get(...params) : statement.all(...params);
    return { rows: row ? (Array.isArray(row) ? row : [row]) : [] };
  }, { schema: { ...d1Schema, ...authSchema } }) as unknown as D1ScopedDatabase;
});
afterEach(() => sqlite.close());

const NOW = new Date("2026-10-31T10:00:00.000Z");

describe("MFA step-up record", () => {
  it("is bound to one session and one user, and ends with its window", async () => {
    await recordMfaStepUp(db, "sess-1", "user-1", NOW);

    await expect(getMfaStepUpVerifiedAt(db, "sess-1", "user-1", NOW)).resolves.toEqual(NOW);
    await expect(getMfaStepUpVerifiedAt(db, "sess-2", "user-1", NOW)).resolves.toBeNull();
    await expect(getMfaStepUpVerifiedAt(db, "sess-1", "user-2", NOW)).resolves.toBeNull();
    await expect(getMfaStepUpVerifiedAt(db, "sess-1", "user-1", new Date(NOW.getTime() + 11 * 60_000))).resolves.toBeNull();
  });

  it("replaces an earlier step-up for the same session", async () => {
    await recordMfaStepUp(db, "sess-1", "user-1", NOW);
    const later = new Date(NOW.getTime() + 5 * 60_000);
    await recordMfaStepUp(db, "sess-1", "user-1", later);

    await expect(getMfaStepUpVerifiedAt(db, "sess-1", "user-1", later)).resolves.toEqual(later);
    expect(sqlite.prepare("select count(*) as n from verification").get()).toEqual({ n: 1 });
  });
});

describe("verifyMfaStepUp", () => {
  const headers = new Headers({ cookie: "session=abc" });

  it("checks the code with Better Auth for this session, then records the step-up", async () => {
    const verifyTOTP = vi.fn().mockResolvedValue({ token: "t" });
    await verifyMfaStepUp({ auth: { api: { verifyTOTP } } as never, db, headers, sessionId: "sess-1", userId: "user-1", code: "123456", now: NOW });

    expect(verifyTOTP).toHaveBeenCalledWith({ headers, body: { code: "123456" } });
    await expect(getMfaStepUpVerifiedAt(db, "sess-1", "user-1", NOW)).resolves.toEqual(NOW);
  });

  it("records nothing for a wrong code", async () => {
    const verifyTOTP = vi.fn().mockRejectedValue(Object.assign(new Error("Invalid code"), { status: "UNAUTHORIZED" }));
    await expect(verifyMfaStepUp({ auth: { api: { verifyTOTP } } as never, db, headers, sessionId: "sess-1", userId: "user-1", code: "000000", now: NOW }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(getMfaStepUpVerifiedAt(db, "sess-1", "user-1", NOW)).resolves.toBeNull();
  });

  it("passes on Better Auth's lockout", async () => {
    const verifyTOTP = vi.fn().mockRejectedValue(Object.assign(new Error("locked"), { status: "TOO_MANY_REQUESTS" }));
    await expect(verifyMfaStepUp({ auth: { api: { verifyTOTP } } as never, db, headers, sessionId: "sess-1", userId: "user-1", code: "000000", now: NOW }))
      .rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

describe("requireRecentMfaVerification on a Better Auth session", () => {
  async function contextFor(twoFactorEnabled: boolean) {
    await db.insert(hotels).values({ id: "h", name: "H", slug: "h", address: "A", ownerContact: "o" });
    await db.insert(user).values({ id: "owner", name: "Owner", email: "owner@test.example", emailVerified: true, createdAt: NOW, updatedAt: NOW });
    await db.insert(hotelUsers).values({ id: "m", hotelId: "h", userId: "owner", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
    const auth = { api: { getSession: async () => ({
      user: { id: "owner", email: "owner@test.example", name: "Owner", twoFactorEnabled },
      session: { id: "sess-owner", token: "plain-session-token", userId: "owner", createdAt: NOW },
    }) } };
    return () => createContextFromRequest({ authorization: "Bearer plain-session-token", db, auth: auth as never });
  }

  it("cannot be satisfied before a step-up, even right after sign-in", async () => {
    const ctx = await (await contextFor(true))();
    expect(() => requireRecentMfaVerification(ctx.user)).toThrow(expect.objectContaining({ code: "PRECONDITION_FAILED" }));
  });

  it("is satisfied by a recorded step-up for the same session", async () => {
    const context = await contextFor(true);
    await recordMfaStepUp(db, "sess-owner", "owner");

    const ctx = await context();
    expect(() => requireRecentMfaVerification(ctx.user)).not.toThrow();
    expect(checkMfaStepUpStatus(ctx.user).status).toBe("verified");
  });

  it("tells an owner without an authenticator to set one up", async () => {
    const context = await contextFor(false);
    await recordMfaStepUp(db, "sess-owner", "owner");

    const ctx = await context();
    expect(checkMfaStepUpStatus(ctx.user).status).toBe("needs_enroll");
  });
});
