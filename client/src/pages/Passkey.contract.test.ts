import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("passkey contract", () => {
  it("registers the plugin on the client and the server", () => {
    expect(read("client/src/lib/auth-client.ts")).toContain("passkeyClient()");
    expect(read("server/auth.ts")).toContain("passkey({");
    expect(read("drizzle/auth-schema.ts")).toContain("  passkey,\n};");
  });

  it("puts the passkey button and autofill hint on the login page", () => {
    const login = read("client/src/pages/Login.tsx");
    expect(login).toContain('autoComplete="username webauthn"');
    expect(login).toContain('t("passkey.signInButton")');
    expect(login).toContain("canUsePasskey");
  });

  it("shows the passkey section on the security page without the 2FA flag", () => {
    const page = read("client/src/pages/SecuritySettings.tsx");
    expect(page).toContain("<PasskeySettings />");
    expect(page).not.toContain("isMfaEnabled");
  });

  it("is not blocked by the TOTP gate, which only acts on social callbacks", () => {
    expect(read("server/auth.ts")).toContain("ASSUMPTION: a passkey sign-in is already a strong");
    expect(read("server/socialAuth.ts")).toContain('ctx?.path?.startsWith("/callback/")');
  });

  it("ships a migration for the passkey table", () => {
    expect(read("drizzle/d1/20261111060000_add_passkey.sql")).toContain("CREATE TABLE `passkey`");
    expect(read("drizzle/d1/meta/_journal.json")).toContain("20261111060000_add_passkey");
  });

  it("stacks the security page panels with one even gap and no leftover inline margins", () => {
    expect(read("client/src/pages/SecuritySettings.tsx")).toContain('className="page-content security-page"');
    expect(read("client/src/styles/auth.css")).toContain(".security-page { display: grid; gap: 16px;");
    expect(read("client/src/components/DeleteAccountSettings.tsx")).not.toContain("marginTop: 18");
  });
});
