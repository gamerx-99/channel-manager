import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AcceptInvite contract", () => {
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const component = readFileSync(resolve(process.cwd(), "client/src/pages/AcceptInvite.tsx"), "utf8");

  it("registers /accept-invite outside PrivateRoute, alongside /login and /signup/:token", () => {
    const loginIndex = app.indexOf('path="/login"');
    const acceptInviteIndex = app.indexOf('path="/accept-invite"');
    const firstPrivateRouteUsage = app.indexOf("<PrivateRoute>");

    expect(loginIndex).toBeGreaterThan(-1);
    expect(acceptInviteIndex).toBeGreaterThan(-1);
    expect(firstPrivateRouteUsage).toBeGreaterThan(-1);

    // Public route must be declared before the PrivateRoute-wrapped routes in the Switch
    expect(acceptInviteIndex).toBeGreaterThan(loginIndex);
    expect(acceptInviteIndex).toBeLessThan(firstPrivateRouteUsage);
  });

  it("calls acceptStaffInvite to set password and navigates to dashboard", () => {
    expect(component).toContain("acceptStaffInvite");
    expect(component).toContain('navigate("/dashboard")');
    expect(component).toContain("password !== confirmPassword");
    expect(component).toContain("password.length < 8");
  });

  it("handles loading and invalid/expired states using PageState", () => {
    expect(component).toContain("<PageState");
    expect(component).toContain('tone="loading"');
    expect(component).toContain('tone="error"');
    expect(component).toContain("searchParams.get");
  });
});
