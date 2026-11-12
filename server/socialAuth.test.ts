import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { account, authSchema, session, user } from "../drizzle/auth-schema";
import { isSocialPlaceholderEmail } from "../shared/socialAuth";
import { createAuth } from "./auth";
import { MockEmailSender, ResendEmailSender } from "./email";
import { enabledSocialProviders, resolveSocialProviders, socialUserIdentity } from "./socialAuth";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
const baseURL = "http://localhost:8787";
const socialEnv = {
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  LINE_CLIENT_ID: "line-id",
  LINE_CLIENT_SECRET: "line-secret",
};

describe("social provider configuration", () => {
  it("offers a provider only when both values are set", () => {
    expect(enabledSocialProviders({})).toEqual([]);
    expect(enabledSocialProviders({ GOOGLE_CLIENT_ID: "id" })).toEqual([]);
    expect(enabledSocialProviders({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "  " })).toEqual([]);
    expect(enabledSocialProviders(socialEnv)).toEqual(["google", "line"]);
  });

  it("registers no provider that has no credentials", () => {
    expect(Object.keys(resolveSocialProviders({}))).toEqual([]);
    expect(Object.keys(resolveSocialProviders(socialEnv))).toEqual(["google", "line"]);
  });

  // Facebook's email is now asked for (owner, 2026-11-12) so the add-email step can use it or find the existing
  // account; it is still not trusted at sign-in, so the new account keeps a placeholder (see the test above).
  it("asks Facebook for the email but not LINE", () => {
    const providers = resolveSocialProviders({
      ...socialEnv,
      FACEBOOK_CLIENT_ID: "facebook-id",
      FACEBOOK_CLIENT_SECRET: "facebook-secret",
    });
    expect(providers.line?.scope).toEqual(["openid", "profile"]);
    expect(providers.facebook?.scope).toEqual(["public_profile", "email"]);
  });
});

describe("socialUserIdentity", () => {
  it("keeps only an email the provider states is verified", () => {
    expect(socialUserIdentity("google", { subject: "1", email: "Owner@Gmail.com", emailVerified: true })).toEqual({
      email: "owner@gmail.com",
      emailVerified: true,
    });
  });

  it.each([
    ["unverified", { subject: "U1", email: "victim@gmail.com", emailVerified: false }],
    ["unstated", { subject: "U1", email: "victim@gmail.com" }],
    ["missing", { subject: "U1" }],
  ])("replaces an %s email with an address nobody owns", (_label, profile) => {
    const identity = socialUserIdentity("line", profile);
    expect(identity.email).toBe("line.u1@no-email.hayhost.invalid");
    expect(identity.emailVerified).toBe(false);
    expect(isSocialPlaceholderEmail(identity.email)).toBe(true);
  });
});

describe("social sign-in through Better Auth", () => {
  let sqlite: InstanceType<typeof DatabaseSync>;
  let db: any;
  let auth: ReturnType<typeof createAuth>;

  function idToken(claims: Record<string, unknown>) {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "none" })}.${encode(claims)}.signature`;
  }

  function stubProviderProfile(claims: Record<string, unknown>) {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ access_token: "access", id_token: idToken(claims), token_type: "Bearer" })));
  }

  async function signInWith(provider: "google" | "line", callbackURL = "/signup") {
    const start = await auth.handler(new Request(`${baseURL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify({ provider, callbackURL, errorCallbackURL: "/login" }),
    }));
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get("state");
    const cookie = start.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    return auth.handler(new Request(`${baseURL}/api/auth/callback/${provider}?code=code&state=${state}`, { headers: { cookie } }));
  }

  async function sessionCount() {
    return (await db.select().from(session)).length;
  }

  async function addUser(id: string, email: string, values: Partial<typeof user.$inferInsert> = {}) {
    await db.insert(user).values({ id, name: id, email, ...values });
  }

  beforeEach(() => {
    sqlite = new DatabaseSync(":memory:");
    for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
      for (const statement of readFileSync(resolve(migrationFolder, file), "utf8").split("--> statement-breakpoint")) {
        if (statement.trim()) sqlite.exec(statement);
      }
    }
    db = sqliteProxy(
      async (query, params, method) => {
        const statement = sqlite.prepare(query);
        statement.setReturnArrays(true);
        if (method === "run") {
          statement.run(...(params as never[]));
          return { rows: [] };
        }
        const rows = method === "get" ? statement.get(...(params as never[])) : statement.all(...(params as never[]));
        return { rows: rows ? (rows as never[]) : [] };
      },
      { schema: authSchema },
    );
    auth = createAuth({ db, baseURL, secret: "test-secret-with-at-least-32-characters!", socialEnv });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sqlite.close();
  });

  it("creates a Google account with its verified email and a session", async () => {
    stubProviderProfile({ sub: "g-1", email: "owner@gmail.com", email_verified: true, name: "Owner" });

    const response = await signInWith("google");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/signup");
    const [created] = await db.select().from(user).where(eq(user.email, "owner@gmail.com"));
    expect(created.emailVerified).toBe(true);
    expect(await sessionCount()).toBe(1);
  });

  it("creates a LINE account on a placeholder even when LINE shares an email", async () => {
    stubProviderProfile({ sub: "U123", email: "victim@gmail.com", name: "Guest" });

    const response = await signInWith("line");

    expect(response.status).toBe(302);
    expect((await db.select().from(user)).map((row: { email: string }) => row.email)).toEqual([
      "line.u123@no-email.hayhost.invalid",
    ]);
  });

  it("creates a LINE account when LINE shares no email at all", async () => {
    stubProviderProfile({ sub: "U456", name: "Guest" });

    const response = await signInWith("line");

    expect(response.headers.get("location")).toBe("/signup");
    expect(await sessionCount()).toBe(1);
  });

  it("joins a verified Google login to the verified account with that email", async () => {
    await addUser("existing", "owner@gmail.com", { emailVerified: true });
    stubProviderProfile({ sub: "g-1", email: "Owner@gmail.com", email_verified: true, name: "Owner" });

    const response = await signInWith("google");

    expect(response.headers.get("location")).toBe("/signup");
    expect(await db.select().from(user)).toHaveLength(1);
    const [linked] = await db.select().from(account);
    expect(linked).toMatchObject({ userId: "existing", providerId: "google", accountId: "g-1" });
    const [opened] = await db.select().from(session);
    expect(opened.userId).toBe("existing");
  });

  it("refuses to join an existing account whose own email is unverified", async () => {
    await addUser("squatter", "victim@gmail.com", { emailVerified: false });
    stubProviderProfile({ sub: "g-1", email: "victim@gmail.com", email_verified: true, name: "Victim" });

    const response = await signInWith("google");

    expect(response.headers.get("location")).toContain("error=account_not_linked");
    expect(await sessionCount()).toBe(0);
    expect(await db.select().from(account)).toEqual([]);
  });

  it("refuses to join when Google does not state the email is verified", async () => {
    await addUser("existing", "owner@gmail.com", { emailVerified: true });
    stubProviderProfile({ sub: "g-1", email: "owner@gmail.com", email_verified: false, name: "Stranger" });

    await signInWith("google");

    const [created] = (await db.select().from(account)) as Array<{ userId: string }>;
    expect(created.userId).not.toBe("existing");
    expect(await db.select().from(user)).toHaveLength(2);
  });

  it("never joins a LINE login by email, even a trusted provider sharing a matching one", async () => {
    await addUser("existing", "owner@gmail.com", { emailVerified: true });
    stubProviderProfile({ sub: "U123", email: "owner@gmail.com", name: "Stranger" });

    await signInWith("line");

    const [created] = (await db.select().from(account)) as Array<{ userId: string }>;
    expect(created.userId).not.toBe("existing");
  });

  it("still asks for 2FA the first time a verified login joins a protected account", async () => {
    await addUser("protected", "owner@gmail.com", { emailVerified: true, twoFactorEnabled: true });
    stubProviderProfile({ sub: "g-1", email: "owner@gmail.com", email_verified: true, name: "Owner" });

    const response = await signInWith("google");

    expect(response.headers.get("location")).toBe("/login?two_factor=1");
    expect(await sessionCount()).toBe(0);
  });

  it("lets a signed-in person connect LINE, which then opens the same account", async () => {
    const signUp = await auth.handler(new Request(`${baseURL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify({ email: "owner@gmail.com", password: "long-enough-password", name: "Owner" }),
    }));
    const signedIn = signUp.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const [owner] = await db.select().from(user);
    stubProviderProfile({ sub: "U123", name: "Owner" });

    const start = await auth.handler(new Request(`${baseURL}/api/auth/link-social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL, cookie: signedIn },
      body: JSON.stringify({ provider: "line", callbackURL: "/settings/security", errorCallbackURL: "/settings/security" }),
    }));
    const { url } = (await start.json()) as { url: string };
    const cookie = [signedIn, ...start.headers.getSetCookie().map(value => value.split(";")[0])].join("; ");
    const linked = await auth.handler(new Request(
      `${baseURL}/api/auth/callback/line?code=code&state=${new URL(url).searchParams.get("state")}`,
      { headers: { cookie } },
    ));

    expect(linked.headers.get("location")).toBe("/settings/security");
    await db.delete(session);
    await signInWith("line");
    const [opened] = await db.select().from(session);
    expect(opened.userId).toBe(owner.id);
    expect(await db.select().from(user)).toHaveLength(1);
  });

  it("refuses to connect a provider account that already belongs to someone else", async () => {
    await addUser("other", "other@gmail.com");
    await db.insert(account).values({ id: "a-1", accountId: "U123", providerId: "line", userId: "other", updatedAt: new Date() });
    const signUp = await auth.handler(new Request(`${baseURL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify({ email: "owner@gmail.com", password: "long-enough-password", name: "Owner" }),
    }));
    const signedIn = signUp.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    stubProviderProfile({ sub: "U123", name: "Owner" });

    const start = await auth.handler(new Request(`${baseURL}/api/auth/link-social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL, cookie: signedIn },
      body: JSON.stringify({ provider: "line", callbackURL: "/settings/security", errorCallbackURL: "/settings/security" }),
    }));
    const { url } = (await start.json()) as { url: string };
    const cookie = [signedIn, ...start.headers.getSetCookie().map(value => value.split(";")[0])].join("; ");
    const refused = await auth.handler(new Request(
      `${baseURL}/api/auth/callback/line?code=code&state=${new URL(url).searchParams.get("state")}`,
      { headers: { cookie } },
    ));

    expect(refused.headers.get("location")?.toLowerCase()).toContain("error=account_already_linked_to_different_user");
    expect((await db.select().from(account)).filter((row: { providerId: string }) => row.providerId === "line")).toHaveLength(1);
  });

  it("challenges a linked account with 2FA instead of opening a session", async () => {
    await addUser("protected", "owner@gmail.com", { emailVerified: true, twoFactorEnabled: true });
    await db.insert(account).values({
      id: "a-1",
      accountId: "g-1",
      providerId: "google",
      userId: "protected",
      updatedAt: new Date(),
    });
    stubProviderProfile({ sub: "g-1", email: "owner@gmail.com", email_verified: true, name: "Owner" });

    const response = await signInWith("google");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?two_factor=1");
    expect(await sessionCount()).toBe(0);
    const cookies = response.headers.getSetCookie().join("\n");
    expect(cookies).toContain("two_factor=");
    expect(cookies).not.toContain("session_token=");
    const pending = sqlite.prepare("SELECT value FROM verification WHERE identifier LIKE '2fa-%'").all() as Array<{ value: string }>;
    expect(pending.map(row => row.value).sort()).toEqual(["0", "protected"]);
  });

  it("opens a session only after the authenticator code from the challenge", async () => {
    const jsonPost = (path: string, body: object, cookie = "") => auth.handler(new Request(`${baseURL}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL, cookie },
      body: JSON.stringify(body),
    }));
    const cookiesOf = (response: Response) => response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const totp = (secret: string) => {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      const bits = [...secret.replace(/=+$/, "")].map(char => alphabet.indexOf(char).toString(2).padStart(5, "0")).join("");
      const key = Buffer.from(bits.match(/.{8}/g)!.map(byte => parseInt(byte, 2)));
      const counter = Buffer.alloc(8);
      counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
      const hash = createHmac("sha1", key).update(counter).digest();
      const offset = hash[hash.length - 1] & 15;
      return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
    };

    const password = "long-enough-password";
    const signUp = await jsonPost("/sign-up/email", { email: "owner@gmail.com", password, name: "Owner" });
    const signedIn = cookiesOf(signUp);
    const enabled = (await (await jsonPost("/two-factor/enable", { password }, signedIn)).json()) as { totpURI: string };
    const secret = new URL(enabled.totpURI).searchParams.get("secret")!;
    await jsonPost("/two-factor/verify-totp", { code: totp(secret) }, signedIn);
    const [owner] = await db.select().from(user);
    expect(owner.twoFactorEnabled).toBe(true);
    await db.insert(account).values({ id: "a-1", accountId: "g-1", providerId: "google", userId: owner.id, updatedAt: new Date() });
    await db.delete(session);
    stubProviderProfile({ sub: "g-1", email: "owner@gmail.com", email_verified: true, name: "Owner" });

    const challenge = cookiesOf(await signInWith("google"));
    expect(await sessionCount()).toBe(0);

    expect((await jsonPost("/two-factor/verify-totp", { code: "000000" }, challenge)).status).toBe(401);
    expect(await sessionCount()).toBe(0);
    const verified = await jsonPost("/two-factor/verify-totp", { code: totp(secret) }, challenge);
    expect(verified.status).toBe(200);
    expect(await sessionCount()).toBe(1);
  });

  describe("email verification", () => {
    const password = "long-enough-password";
    let mail: MockEmailSender;

    const post = (path: string, body: object) => auth.handler(new Request(`${baseURL}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify(body),
    }));
    const lastLink = () => /https?:\/\/\S+/.exec(mail.getLastEmail()!.text!)![0];
    const signIn = (email: string) => post("/sign-in/email", { email, password });

    beforeEach(() => {
      mail = new MockEmailSender();
      auth = createAuth({ db, baseURL, secret: "test-secret-with-at-least-32-characters!", socialEnv, emailSender: mail, requireEmailVerification: true });
    });

    it("is enforced only with a real mail provider", async () => {
      auth = createAuth({ db, baseURL, secret: "test-secret-with-at-least-32-characters!", emailSender: new MockEmailSender() });
      await post("/sign-up/email", { email: "owner@gmail.com", password, name: "Owner" });
      expect((await signIn("owner@gmail.com")).status).toBe(200);

      const context = await createAuth({
        db, baseURL, secret: "test-secret-with-at-least-32-characters!", emailSender: new ResendEmailSender("key"),
      }).$context;
      expect(context.options.emailAndPassword?.requireEmailVerification).toBe(true);
    });

    it("emails a link and opens no session until it is used", async () => {
      const signUp = await post("/sign-up/email", { email: "owner@gmail.com", password, name: "Owner" });

      expect(((await signUp.json()) as { token: string | null }).token).toBeNull();
      expect(mail.getLastEmail()?.to).toBe("owner@gmail.com");
      expect(lastLink()).toContain("callbackURL=%2Flogin%3Fverified%3D1");
      expect((await signIn("owner@gmail.com")).status).toBe(403);
      expect(await sessionCount()).toBe(0);
    });

    it("marks the email without logging in, so the link cannot skip the password or 2FA", async () => {
      await post("/sign-up/email", { email: "owner@gmail.com", password, name: "Owner" });

      const opened = await auth.handler(new Request(lastLink()));

      expect(opened.status).toBe(302);
      expect(opened.headers.get("location")).toBe("/login?verified=1");
      expect(opened.headers.getSetCookie().join("\n")).not.toContain("session_token=");
      expect(await sessionCount()).toBe(0);
      expect((await db.select().from(user))[0].emailVerified).toBe(true);
      expect((await signIn("owner@gmail.com")).status).toBe(200);
    });

    it("joins a matching Google login once the password account is confirmed", async () => {
      await post("/sign-up/email", { email: "owner@gmail.com", password, name: "Owner" });
      await auth.handler(new Request(lastLink()));
      const [owner] = await db.select().from(user);
      stubProviderProfile({ sub: "g-1", email: "owner@gmail.com", email_verified: true, name: "Owner" });

      await signInWith("google");

      const [linked] = await db.select().from(account).where(eq(account.providerId, "google"));
      expect(linked.userId).toBe(owner.id);
      expect(await db.select().from(user)).toHaveLength(1);
    });

    it("refuses that Google login while the password account is unconfirmed", async () => {
      await post("/sign-up/email", { email: "owner@gmail.com", password, name: "Owner" });
      stubProviderProfile({ sub: "g-1", email: "owner@gmail.com", email_verified: true, name: "Owner" });

      const response = await signInWith("google");

      expect(response.headers.get("location")).toContain("error=account_not_linked");
      expect(await db.select().from(account).where(eq(account.providerId, "google"))).toEqual([]);
    });

    it("does not lock out an existing unverified superadmin", async () => {
      await post("/sign-up/email", { email: "root@gmail.com", password, name: "Root" });
      await auth.handler(new Request(lastLink().replace(/token=[^&]+/, "token=expired")));
      mail.clear();

      expect((await signIn("root@gmail.com")).status).toBe(403);
      await auth.handler(new Request(lastLink()));

      expect((await signIn("root@gmail.com")).status).toBe(200);
    });
  });

  it("rejects an email signup on the placeholder domain", async () => {
    const response = await auth.handler(new Request(`${baseURL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify({ email: "line.u123@no-email.hayhost.invalid", password: "long-enough-password", name: "x" }),
    }));

    expect(response.status).toBe(400);
    expect(await db.select().from(user)).toEqual([]);
  });
});
