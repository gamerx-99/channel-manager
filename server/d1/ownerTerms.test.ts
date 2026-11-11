import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema } from "../../drizzle/d1-schema";
import { user } from "../../drizzle/auth-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { acceptOwnerTerms, getTermsAcceptedAt } from "./ownerTerms";
import { authRouter } from "../routers/authRouter";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
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
    const values = params.map(value => typeof value === "boolean" ? Number(value) : value) as never[];
    if (method === "run") { statement.run(...values); return { rows: [] }; }
    const row = method === "get" ? statement.get(...values) : statement.all(...values);
    return { rows: row ? (Array.isArray(row) ? row : [row]) : [] };
  }, { schema: { ...d1Schema, user } }) as unknown as D1ScopedDatabase;
  await db.insert(user).values({ id: "owner-1", name: "Owner", email: "owner@example.test", emailVerified: true });
});
afterEach(() => sqlite.close());

describe("terms_accepted_at migration", () => {
  it("adds a nullable column to the user table, empty for existing accounts", () => {
    const columns = sqlite.prepare("PRAGMA table_info(user)").all() as Array<{ name: string; notnull: number }>;
    const column = columns.find(item => item.name === "terms_accepted_at");
    expect(column).toBeTruthy();
    expect(column!.notnull).toBe(0);
    expect(sqlite.prepare("SELECT terms_accepted_at AS value FROM user WHERE id = 'owner-1'").get()).toEqual({ value: null });
  });
});

describe("acceptOwnerTerms", () => {
  it("records the first acceptance and keeps it", async () => {
    const first = new Date("2026-11-11T09:00:00.000Z");
    expect(await getTermsAcceptedAt(db, "owner-1")).toBeNull();
    expect(await acceptOwnerTerms(db, "owner-1", first)).toEqual(first);
    expect(await acceptOwnerTerms(db, "owner-1", new Date("2026-12-01T00:00:00.000Z"))).toEqual(first);
    expect(await getTermsAcceptedAt(db, "owner-1")).toEqual(first);
  });
});

describe("auth.acceptTerms and auth.me", () => {
  const caller = (signedIn: boolean) => authRouter.createCaller({
    db,
    user: signedIn ? { id: "owner-1", email: "owner@example.test", name: "Owner", roles: ["hotel_owner"], memberships: [], accessToken: "t", session: {} } : null,
  } as never);

  it("needs a session", async () => {
    await expect(caller(false).acceptTerms()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("reports acceptance through me, only for the caller", async () => {
    await db.insert(user).values({ id: "other", name: "Other", email: "other@example.test", emailVerified: true });
    expect((await caller(true).me())?.termsAcceptedAt).toBeNull();
    const { termsAcceptedAt } = await caller(true).acceptTerms();
    expect(termsAcceptedAt).toBeInstanceOf(Date);
    expect((await caller(true).me())?.termsAcceptedAt).toEqual(termsAcceptedAt);
    expect(await getTermsAcceptedAt(db, "other")).toBeNull();
  });
});
