import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema } from "../drizzle/d1-schema";
import { authSchema } from "../drizzle/auth-schema";
import { socialPlaceholderEmail } from "../shared/socialAuth";
import { createAuth } from "./auth";
import { MockEmailSender } from "./email";
import { confirmRealEmail, requestRealEmail } from "./socialEmail";
import { authRouter } from "./routers/authRouter";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
const BASE = "https://app.example.test";
let sqlite: InstanceType<typeof DatabaseSync>;
let db: unknown;
let sender: MockEmailSender;
let auth: ReturnType<typeof createAuth>;

beforeEach(() => {
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
  }, { schema: { ...d1Schema, ...authSchema } });
  sender = new MockEmailSender();
  auth = createAuth({ db, baseURL: BASE, secret: "test-secret-that-is-long-enough-123456", emailSender: sender, socialEnv: {} });
});
afterEach(() => sqlite.close());

const LINE_EMAIL = socialPlaceholderEmail("line", "U123abc");

/** An account the way a LINE sign-in leaves it. Inserted directly: the user-create hook only allows placeholders from a real social callback. */
function account(email: string, verified = false) {
  const id = crypto.randomUUID();
  const now = Date.now();
  sqlite.prepare("INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, "Line User", email, verified ? 1 : 0, now, now);
  return id;
}

function readUser(userId: string) {
  return sqlite.prepare("SELECT email, email_verified AS verified FROM user WHERE id = ?").get(userId) as { email: string; verified: number };
}

const APP = "https://www.example.test";

function linkToken() {
  const text = sender.getLastEmail()?.text ?? "";
  const match = /https:\/\/www\.example\.test\/confirm-email\?token=([0-9a-f]{64})/.exec(text);
  expect(match, text).not.toBeNull();
  return match![1]!;
}

function sessionCount(userId: string) {
  return (sqlite.prepare("SELECT count(*) AS n FROM session WHERE user_id = ?").get(userId) as { n: number }).n;
}

describe("a social account adds a real email", () => {
  it("sends the link to the new address and sets the email only when the same account opens it", async () => {
    const userId = account(LINE_EMAIL);
    await expect(requestRealEmail({ auth, userId, newEmail: " Real@Example.test ", appUrl: `${APP}/` })).resolves.toEqual({ status: true });
    expect(sender.getLastEmail()?.to).toBe("real@example.test");
    expect(readUser(userId)).toEqual({ email: LINE_EMAIL, verified: 0 });

    await expect(confirmRealEmail({ auth, userId, token: linkToken() })).resolves.toEqual({ email: "real@example.test" });
    expect(readUser(userId)).toEqual({ email: "real@example.test", verified: 1 });
  });

  it("does nothing for someone else who opens the link, and the owner can still use it", async () => {
    const userId = account(LINE_EMAIL);
    const stranger = account(socialPlaceholderEmail("line", "Ustranger"));
    await requestRealEmail({ auth, userId, newEmail: "typo@example.test", appUrl: APP });
    const token = linkToken();

    await expect(confirmRealEmail({ auth, userId: stranger, token })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(readUser(userId).email).toBe(LINE_EMAIL);
    expect(readUser(stranger).email).toBe(socialPlaceholderEmail("line", "Ustranger"));
    expect(sessionCount(userId)).toBe(0);

    await confirmRealEmail({ auth, userId, token });
    expect(readUser(userId).email).toBe("typo@example.test");
  });

  it("works once, and not with a made-up token", async () => {
    const userId = account(LINE_EMAIL);
    await requestRealEmail({ auth, userId, newEmail: "real@example.test", appUrl: APP });
    const token = linkToken();
    await confirmRealEmail({ auth, userId, token });
    sqlite.prepare("UPDATE user SET email = ? WHERE id = ?").run(LINE_EMAIL, userId);
    await expect(confirmRealEmail({ auth, userId, token })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(confirmRealEmail({ auth, userId, token: "0".repeat(64) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses an expired link", async () => {
    const userId = account(LINE_EMAIL);
    await requestRealEmail({ auth, userId, newEmail: "real@example.test", appUrl: APP });
    sqlite.prepare("UPDATE verification SET expires_at = ?").run(Date.now() - 1000);
    await expect(confirmRealEmail({ auth, userId, token: linkToken() })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(readUser(userId).email).toBe(LINE_EMAIL);
  });

  it("refuses the link when the address was taken after it was sent", async () => {
    const userId = account(LINE_EMAIL);
    await requestRealEmail({ auth, userId, newEmail: "real@example.test", appUrl: APP });
    account("real@example.test", true);
    await expect(confirmRealEmail({ auth, userId, token: linkToken() })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(readUser(userId).email).toBe(LINE_EMAIL);
  });

  it("can send the link again while the placeholder is still there", async () => {
    const userId = account(LINE_EMAIL);
    await requestRealEmail({ auth, userId, newEmail: "real@example.test", appUrl: APP });
    await requestRealEmail({ auth, userId, newEmail: "real@example.test", appUrl: APP });
    expect(sender.getSentEmails().filter(mail => mail.to === "real@example.test")).toHaveLength(2);
  });

  it("never takes another account's email, and answers the same way", async () => {
    account("taken@example.test", true);
    const userId = account(LINE_EMAIL);
    await expect(requestRealEmail({ auth, userId, newEmail: "taken@example.test", appUrl: APP })).resolves.toEqual({ status: true });
    expect(sender.getSentEmails()).toHaveLength(0);
    expect(readUser(userId).email).toBe(LINE_EMAIL);
  });

  it("refuses accounts that already have a real email, so a session cannot move them elsewhere", async () => {
    const userId = account("owner@example.test", true);
    await expect(requestRealEmail({ auth, userId, newEmail: "attacker@example.test", appUrl: APP })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(sender.getSentEmails()).toHaveLength(0);
  });

  it("refuses another placeholder address", async () => {
    const userId = account(LINE_EMAIL);
    await expect(requestRealEmail({ auth, userId, newEmail: socialPlaceholderEmail("facebook", "x"), appUrl: APP })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps Better Auth's own change-email endpoint closed", async () => {
    const id = account(LINE_EMAIL);
    const context = await auth.$context;
    const session = await context.internalAdapter.createSession(id);
    await expect(auth.api.changeEmail({ body: { newEmail: "real@example.test" }, headers: new Headers({ authorization: `Bearer ${session.token}` }) })).rejects.toBeTruthy();
    expect(sender.getSentEmails()).toHaveLength(0);
  });

  it("is reached through auth.addRealEmail and auth.confirmRealEmail for the signed-in account only", async () => {
    const userId = account(LINE_EMAIL);
    const caller = authRouter.createCaller({ auth, clientIp: "127.0.0.2", publicAppUrl: APP, user: { id: userId, email: LINE_EMAIL, name: "Line User", roles: [], memberships: [], accessToken: "t", session: {} } } as never);
    await expect(caller.addRealEmail({ email: "real@example.test" })).resolves.toEqual({ status: true });
    expect(sender.getLastEmail()?.to).toBe("real@example.test");
    const token = linkToken();
    const anonymous = authRouter.createCaller({ auth, clientIp: "127.0.0.2", user: null } as never);
    await expect(anonymous.addRealEmail({ email: "real@example.test" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anonymous.confirmRealEmail({ token })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.confirmRealEmail({ token })).resolves.toEqual({ email: "real@example.test" });
  });
});
