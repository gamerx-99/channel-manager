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

  it("explains a duplicate email without a generic failure", () => {
    expect(socialErrorKey("account_not_linked")).toBe("socialAuth.accountExists");
    expect(socialErrorKey("access_denied")).toBe("socialAuth.cancelled");
    expect(socialErrorKey("anything_else")).toBe("socialAuth.failed");
    expect(socialErrorKey(null)).toBeNull();
  });
});
