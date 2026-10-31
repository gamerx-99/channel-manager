import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { d1Schema } from "../drizzle/d1-schema";
import { authSchema } from "../drizzle/auth-schema";
import { createAuth } from "./auth";
import { MockEmailSender, type EmailSender } from "./email";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: unknown;

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
});
afterEach(() => sqlite.close());

const BASE = "https://app.example.test";
const EMAIL = "owner@example.test";

async function signUp(auth: ReturnType<typeof createAuth>) {
  await auth.api.signUpEmail({ body: { email: EMAIL, password: "old-password-1", name: "Owner" } });
}

describe("password reset email", () => {
  it("sends a reset link through the email sender and accepts the new password", async () => {
    const sender = new MockEmailSender();
    const auth = createAuth({ db, baseURL: BASE, secret: "test-secret-that-is-long-enough-123456", emailSender: sender });
    await signUp(auth);

    await auth.api.requestPasswordReset({ body: { email: EMAIL, redirectTo: `${BASE}/reset-password` } });

    const sent = sender.getLastEmail();
    expect(sent?.to).toBe(EMAIL);
    const link = /https:\/\/app\.example\.test\/api\/auth\/reset-password\/([A-Za-z0-9]+)\?callbackURL=([^\s"<]+)/.exec(sent?.text ?? "");
    expect(link).not.toBeNull();
    expect(decodeURIComponent(link![2]!)).toBe(`${BASE}/reset-password`);

    await auth.api.resetPassword({ body: { token: link![1]!, newPassword: "new-password-2" } });
    await expect(auth.api.signInEmail({ body: { email: EMAIL, password: "new-password-2" } })).resolves.toMatchObject({ user: { email: EMAIL } });
    await expect(auth.api.signInEmail({ body: { email: EMAIL, password: "old-password-1" } })).rejects.toBeTruthy();
  });

  it("answers the same for an unknown email and sends nothing", async () => {
    const sender = new MockEmailSender();
    const auth = createAuth({ db, baseURL: BASE, secret: "test-secret-that-is-long-enough-123456", emailSender: sender });

    await expect(auth.api.requestPasswordReset({ body: { email: "nobody@example.test", redirectTo: `${BASE}/reset-password` } })).resolves.toMatchObject({ status: true });
    expect(sender.getSentEmails()).toHaveLength(0);
  });

  it("does not reveal a failed send", async () => {
    const failing: EmailSender = {
      sendEmail: vi.fn(),
      sendInviteEmail: vi.fn(),
      sendPasswordResetEmail: vi.fn().mockRejectedValue(new Error("Resend down")),
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const auth = createAuth({ db, baseURL: BASE, secret: "test-secret-that-is-long-enough-123456", emailSender: failing });
    await signUp(auth);

    await expect(auth.api.requestPasswordReset({ body: { email: EMAIL, redirectTo: `${BASE}/reset-password` } })).resolves.toMatchObject({ status: true });
    expect(failing.sendPasswordResetEmail).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});

describe("email sender wiring", () => {
  it("the Worker and the request context both give createAuth an email sender", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    expect(readFileSync(resolve(root, "worker/app.ts"), "utf8")).toContain("createAuth({ db, baseURL, emailSender: createEmailSender() })");
    expect(readFileSync(resolve(root, "server/_core/context.ts"), "utf8")).toContain("createAuth({ db, baseURL: origin, emailSender: createEmailSender() })");
  });
});
