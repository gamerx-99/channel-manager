import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Hotel owner signup link contract", () => {
  const routerText = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const staffRouterText = readFileSync(resolve(process.cwd(), "server/routers/staffRouter.ts"), "utf8");
  const router = routerText + staffRouterText;
  const component = readFileSync(resolve(process.cwd(), "client/src/pages/HotelOwnerSignup.tsx"), "utf8");
  const hotelStaff = readFileSync(resolve(process.cwd(), "client/src/pages/HotelStaff.tsx"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const authorization = readFileSync(resolve(process.cwd(), "shared/authorization.ts"), "utf8");

  it("registers /signup/:token outside PrivateRoute, alongside /login", () => {
    const loginIndex = app.indexOf('path="/login"');
    const signupIndex = app.indexOf('path="/signup/:token"');
    // PrivateRoute's definition site is no longer in App.tsx after Phase 4's
    // extraction, so this contract checks the registration order in the Switch
    // by looking for the first usage of <PrivateRoute> instead.
    const firstPrivateRouteUsage = app.indexOf("<PrivateRoute>");
    expect(loginIndex).toBeGreaterThan(-1);
    expect(signupIndex).toBeGreaterThan(-1);
    // Both public routes are declared before the PrivateRoute-wrapped routes further down the Switch.
    expect(signupIndex).toBeGreaterThan(loginIndex);
    expect(signupIndex).toBeLessThan(firstPrivateRouteUsage);
  });

  it("exposes the public validate/complete procedures and the super_admin-only generation procedure", () => {
    expect(router).toMatch(/validateSignupLink\s*[:=]\s*rateLimitedProcedure/);
    expect(router).toMatch(/completeHotelOwnerSignup\s*[:=]\s*rateLimitedProcedure/);
    expect(router).toMatch(/createSignupLink\s*[:=]\s*protectedProcedure/);
    expect(router).toContain("requireHotelPermission(ctx.user, input.hotel_id, 'platform.manage_signup_links')");
    expect(router).toContain("assertSingleHotelAdmin(assignments, input.hotel_id)");
  });

  it("grants platform.manage_signup_links to super_admin's blanket permission set", () => {
    expect(authorization).toContain('"platform.manage_signup_links"');
  });

  it("handles the invalid/expired-or-used link state without leaking which", () => {
    expect(component).toContain("This signup link is no longer valid");
    expect(component).toContain("authClient.signUp.email");
    expect(component).toContain("completeHotelOwnerSignup");
  });

  it("gates the signup-link generator to super_admin, and only when the hotel has no admin yet", () => {
    expect(hotelStaff).toContain("isSuperAdmin && !hotelAdminAlreadyAssigned");
    expect(hotelStaff).toContain("navigator.clipboard.writeText");
  });
});
