import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { socialErrorKey } from "@/components/auth/SocialSignIn";
import en from "@/lib/i18n/en";
import th from "@/lib/i18n/th";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Social sign-in contract", () => {
  const app = read("client/src/App.tsx");
  const login = read("client/src/pages/Login.tsx");
  const signup = read("client/src/pages/Signup.tsx");
  const ownerSignup = read("client/src/pages/HotelOwnerSignup.tsx");
  const button = read("client/src/components/auth/SocialSignIn.tsx");

  it("keeps the signup routes public", () => {
    const firstPrivateRoute = app.indexOf("<PrivateRoute>");
    expect(app.indexOf('path="/signup"')).toBeLessThan(firstPrivateRoute);
    expect(app.indexOf('path="/signup/:token"')).toBeLessThan(firstPrivateRoute);
  });

  it("shows the buttons on all three pages", () => {
    for (const page of [login, signup, ownerSignup]) expect(page).toContain("<SocialSignIn");
  });

  it("draws only the providers the server reports", () => {
    expect(button).toContain("trpc.auth.socialProviders.useQuery");
    expect(button).toContain("if (!providers.data?.length) return null;");
    expect(button).toContain("providers.data.map");
  });

  it("finishes a social signup on the page that sets up the hotel", () => {
    expect(login).toContain('callbackURL="/signup"');
    expect(signup).toContain('callbackURL="/signup"');
    expect(ownerSignup).toContain("callbackURL={signupPath}");
    expect(ownerSignup).toContain("completeHotelOwnerSignup");
    expect(ownerSignup).toContain("owner-signup-connect");
  });

  it("resumes the authenticator step after a social redirect", () => {
    expect(login).toContain('get("two_factor") === "1"');
    expect(login).toContain("login-totp-form");
  });

  it("translates every social and owner signup string", () => {
    expect(Object.keys(th.socialAuth).sort()).toEqual(Object.keys(en.socialAuth).sort());
    expect(Object.keys(th.ownerSignup).sort()).toEqual(Object.keys(en.ownerSignup).sort());
  });

  it("sends new accounts to confirm their email before the hotel step", () => {
    const checkEmail = read("client/src/components/auth/CheckEmail.tsx");
    expect(signup).toContain("data.token === null");
    expect(signup).toContain("<CheckEmail");
    expect(ownerSignup).toContain("<CheckEmail");
    expect(login).toContain('"EMAIL_NOT_VERIFIED"');
    expect(checkEmail).toContain("authClient.sendVerificationEmail");
    expect(Object.keys(th.verifyEmail).sort()).toEqual(Object.keys(en.verifyEmail).sort());
    expect(socialErrorKey("INVALID_TOKEN")).toBe("verifyEmail.linkInvalid");
  });

  it("offers manual linking in Security settings, only for configured providers", () => {
    const linked = read("client/src/components/LinkedAccountsSettings.tsx");
    expect(read("client/src/pages/SecuritySettings.tsx")).toContain("<LinkedAccountsSettings />");
    expect(linked).toContain("authClient.linkSocial");
    expect(linked).toContain("trpc.auth.socialProviders.useQuery");
    expect(linked).toContain("if (!providers.data?.length) return null;");
  });

  it("styles the buttons so a provider icon stays small", () => {
    const css = read("client/src/index.css");
    expect(css).toContain(".social-button svg{width:20px;height:20px;flex:none}");
    expect(css).toContain(".social-button{");
  });

  it("links sign-in to signup outside the authenticator step", () => {
    expect(login).toContain('className="login-signup-prompt"');
    expect(login).toContain('href="/signup"');
  });

  it("explains a duplicate email without a generic failure", () => {
    expect(socialErrorKey("account_not_linked")).toBe("socialAuth.accountExists");
    expect(socialErrorKey("ACCOUNT_ALREADY_LINKED_TO_DIFFERENT_USER")).toBe("socialAuth.alreadyLinked");
    expect(socialErrorKey("access_denied")).toBe("socialAuth.cancelled");
    expect(socialErrorKey("anything_else")).toBe("socialAuth.failed");
    expect(socialErrorKey(null)).toBeNull();
  });
});
