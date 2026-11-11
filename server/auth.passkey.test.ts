import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema } from "../drizzle/d1-schema";
import { authSchema } from "../drizzle/auth-schema";
import { createAuth } from "./auth";
import { MockEmailSender } from "./email";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: unknown;

beforeEach(() => {
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
  }, { schema: { ...d1Schema, ...authSchema } });
});
afterEach(() => sqlite.close());

const SECRET = "test-secret-that-is-long-enough-123456";

function makeAuth(baseURL: string) {
  return createAuth({ db, baseURL, secret: SECRET, emailSender: new MockEmailSender() });
}

async function signedIn(auth: ReturnType<typeof makeAuth>, email: string) {
  await auth.api.signUpEmail({ body: { email, password: "password-1234", name: email.split("@")[0]! } });
  const { headers, response } = await auth.api.signInEmail({ body: { email, password: "password-1234" }, returnHeaders: true });
  const cookie = headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  return { headers: new Headers({ cookie }), userId: response.user.id };
}

function insertPasskey(id: string, userId: string, name: string) {
  sqlite.prepare(`INSERT INTO passkey (id, name, public_key, user_id, credential_id, counter, device_type, backed_up, transports, created_at, aaguid)
    VALUES (?, ?, 'pk', ?, ?, 0, 'multiDevice', 1, 'internal', 1794376800000, NULL)`).run(id, name, userId, `cred-${id}`);
}

describe("passkey plugin wiring", () => {
  it("offers sign-in options for the host the site runs on, without a session", async () => {
    const auth = makeAuth("https://app.example.test");
    const options = await auth.api.generatePasskeyAuthenticationOptions({ headers: new Headers() });
    expect(options.rpId).toBe("app.example.test");
    expect(options.challenge).toBeTruthy();
  });

  it("uses the apex domain as the relying party when the site is served from www", async () => {
    const auth = makeAuth("https://www.hayhostth.com");
    const options = await auth.api.generatePasskeyAuthenticationOptions({ headers: new Headers() });
    expect(options.rpId).toBe("hayhostth.com");
  });

  it("makes registration options named hayhost only for a signed-in user", async () => {
    const auth = makeAuth("https://app.example.test");
    await expect(auth.api.generatePasskeyRegistrationOptions({ headers: new Headers() })).rejects.toBeTruthy();

    const { headers } = await signedIn(auth, "owner@example.test");
    const options = await auth.api.generatePasskeyRegistrationOptions({ headers });
    expect(options.rp).toMatchObject({ name: "hayhost", id: "app.example.test" });
    expect(options.user.name).toBe("owner@example.test");
  });

  it("lists and deletes only the caller's own passkeys", async () => {
    const auth = makeAuth("https://app.example.test");
    const owner = await signedIn(auth, "owner@example.test");
    const other = await signedIn(auth, "other@example.test");
    insertPasskey("pk-owner", owner.userId, "iPhone");
    insertPasskey("pk-other", other.userId, "Laptop");

    const mine = await auth.api.listPasskeys({ headers: owner.headers });
    expect(mine.map(item => item.id)).toEqual(["pk-owner"]);

    await expect(auth.api.deletePasskey({ headers: owner.headers, body: { id: "pk-other" } })).rejects.toBeTruthy();
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM passkey").get()).toEqual({ n: 2 });

    await auth.api.deletePasskey({ headers: owner.headers, body: { id: "pk-owner" } });
    expect(sqlite.prepare("SELECT id FROM passkey").all()).toEqual([{ id: "pk-other" }]);
  });

  it("removes a user's passkeys when the user is deleted", async () => {
    const auth = makeAuth("https://app.example.test");
    const owner = await signedIn(auth, "owner@example.test");
    insertPasskey("pk-owner", owner.userId, "iPhone");
    sqlite.prepare("DELETE FROM user WHERE id = ?").run(owner.userId);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM passkey").get()).toEqual({ n: 0 });
  });
});
