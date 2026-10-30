import { describe, expect, it } from "vitest";
import { getRouteScopeDecision } from "./routeScope";
import { resolveMembershipPermissions, resolveSupportGrantPermissions } from "@shared/permissions";

describe("hotel-scoped permission routing", () => {
  const common = { role: "front_desk" as const, visibleHotelIds: ["a", "b"], pathname: "/hotels/a/bookings" };
  it("honours stored revokes and uses the target membership rather than another hotel's role", () => {
    const memberships = [
      { hotelId: "a", role: "front_desk" as const, permissions: resolveMembershipPermissions("front_desk", { revokes: ["operations.view_bookings"] }) },
      { hotelId: "b", role: "hotel_owner" as const, permissions: resolveMembershipPermissions("hotel_owner") },
    ];
    expect(getRouteScopeDecision({ ...common, memberships })).toEqual({ allowed: false, reason: "permission_required" });
    expect(getRouteScopeDecision({ ...common, pathname: "/hotels/b/bookings", memberships })).toEqual({ allowed: true });
  });
  it("allows granted capabilities for the selected hotel on global pages", () => {
    const memberships = [{ hotelId: "a", role: "front_desk" as const, permissions: resolveMembershipPermissions("front_desk", { grants: ["revenue.manage_pricing_rules"] }) }];
    expect(getRouteScopeDecision({ ...common, pathname: "/dashboard/pricing", selectedHotelId: "a", memberships })).toEqual({ allowed: true });
    expect(getRouteScopeDecision({ ...common, pathname: "/dashboard/pricing", selectedHotelId: "b", memberships })).toEqual({ allowed: false, reason: "permission_required" });
  });
  it("support uses only its active hotel key and never opens staff or owner approval", () => {
    const now = new Date("2026-10-30T12:00Z");
    const memberships = [{ hotelId: "a", role: "support" as const, permissions: resolveSupportGrantPermissions({ canEdit: true }), expiresAt: new Date(now.getTime() + 1000) }];
    expect(getRouteScopeDecision({ ...common, role: "support", memberships, now })).toEqual({ allowed: true });
    for (const pathname of ["/hotels/b/bookings", "/hotels/a/staff", "/hotels/a/support-access"]) expect(getRouteScopeDecision({ ...common, role: "support", pathname, memberships, now }).allowed).toBe(false);
    expect(getRouteScopeDecision({ ...common, role: "support", memberships, now: memberships[0].expiresAt }).allowed).toBe(false);
    expect(getRouteScopeDecision({ ...common, role: "support", memberships: [], now }).allowed).toBe(false);
  });
  it("mirrors the owner-only financial dashboard even when staff can view financial amounts", () => {
    expect(getRouteScopeDecision({ ...common, pathname: "/dashboard/financials", selectedHotelId: "a", memberships: [{ hotelId: "a", role: "front_desk", permissions: resolveMembershipPermissions("front_desk", { grants: ["property.view_financials"] }) }] })).toEqual({ allowed: false, reason: "permission_required" });
  });
  it("super admin cannot use a mixed owner identity to enter hotel data", () => {
    expect(getRouteScopeDecision({ ...common, role: "super_admin", roles: ["super_admin", "hotel_owner"], memberships: [{ hotelId: "a", role: "hotel_owner", permissions: resolveMembershipPermissions("hotel_owner") }] }).allowed).toBe(false);
  });
});
