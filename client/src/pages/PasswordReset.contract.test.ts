import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("password reset pages", () => {
  const app = read("client/src/App.tsx");
  const forgot = read("client/src/pages/ForgotPassword.tsx");
  const reset = read("client/src/pages/ResetPassword.tsx");
  const login = read("client/src/pages/Login.tsx");

  it("registers both public routes before the /:slug hotel page", () => {
    expect(app).toContain('<Route path="/forgot-password" component={ForgotPassword} />');
    expect(app).toContain('<Route path="/reset-password" component={ResetPassword} />');
    expect(app.indexOf('path="/reset-password"')).toBeLessThan(app.indexOf('path="/:slug"'));
  });

  it("asks Better Auth to email a link back to /reset-password", () => {
    expect(forgot).toContain("authClient.requestPasswordReset({");
    expect(forgot).toContain("redirectTo: `${window.location.origin}/reset-password`");
  });

  it("resets with the token from the link and handles an expired link", () => {
    expect(reset).toContain('params.get("token")');
    expect(reset).toContain('params.get("error") === "INVALID_TOKEN"');
    expect(reset).toContain("authClient.resetPassword({ newPassword: password, token: token! })");
  });

  it("links to the request page from sign in", () => {
    expect(login).toContain('href="/forgot-password"');
  });

  it("keeps the pages out of search and out of the hotel slug space", () => {
    const headers = read("client/public/_headers");
    expect(headers).toContain("/forgot-password\n  X-Robots-Tag: noindex");
    expect(headers).toContain("/reset-password\n  X-Robots-Tag: noindex");
    const hotel = read("server/d1/hotel.ts");
    expect(hotel).toContain('"forgot-password"');
    expect(hotel).toContain('"reset-password"');
  });
});
