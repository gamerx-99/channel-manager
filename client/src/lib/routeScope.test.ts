import { describe, expect, it } from "vitest";
import { getFirstVisibleHotelId, getRequiredRoutePermission, getRouteScopeDecision } from "./routeScope";

describe("route scope", () => {
  it("allows super admins to access platform and every hotel route", () => {
    expect(getRouteScopeDecision({
      role: "super_admin",
      pathname: "/settings/admin-users",
      visibleHotelIds: [],
    })).toEqual({ allowed: true });

    expect(getRouteScopeDecision({
      role: "super_admin",
      pathname: "/hotels/other-hotel/bookings",
      visibleHotelIds: [],
    })).toEqual({ allowed: true });
  });

  it("gives the read-only platform admin cross-hotel reads but no write surfaces", () => {
    expect(getRouteScopeDecision({
      role: "admin",
      pathname: "/hotels",
      visibleHotelIds: [],
    })).toEqual({ allowed: true });

    expect(getRouteScopeDecision({
      role: "admin",
      pathname: "/hotels/hotel-outside-scope/bookings",
      visibleHotelIds: [],
    })).toEqual({ allowed: true });

    expect(getRouteScopeDecision({
      role: "admin",
      pathname: "/hotels/hotel-1/staff",
      visibleHotelIds: ["hotel-1"],
    })).toEqual({ allowed: false, reason: "permission_required" });

    expect(getRouteScopeDecision({
      role: "admin",
      pathname: "/settings/admin-users",
      visibleHotelIds: [],
    })).toEqual({ allowed: false, reason: "permission_required" });
  });

  // Channel analytics page removed (UI-01, owner decision 2026-10-28); route entry dropped.

  it("denies hotel owners from platform-only routes", () => {
    expect(getRouteScopeDecision({
      role: "hotel_owner",
      pathname: "/settings/admin-users",
      visibleHotelIds: ["hotel-1"],
    })).toEqual({ allowed: false, reason: "permission_required" });

    expect(getRouteScopeDecision({
      role: "hotel_owner",
      pathname: "/hotels",
      visibleHotelIds: ["hotel-1"],
    })).toEqual({ allowed: false, reason: "permission_required" });
  });

  it("requires the property staff permission for the Hotel Staff route", () => {
    expect(getRequiredRoutePermission("/hotels/hotel-1/staff")).toBe("property.manage_staff");

    expect(getRouteScopeDecision({
      role: "hotel_owner",
      pathname: "/hotels/hotel-1/staff",
      visibleHotelIds: ["hotel-1"],
    })).toEqual({ allowed: true });

    expect(getRouteScopeDecision({
      role: "front_desk",
      pathname: "/hotels/hotel-1/staff",
      visibleHotelIds: ["hotel-1"],
    })).toEqual({ allowed: false, reason: "permission_required" });
  });

  it("denies direct URLs for hotels outside the owner scope", () => {
    expect(getRouteScopeDecision({
      role: "hotel_owner",
      pathname: "/hotels/hotel-2/calendar",
      visibleHotelIds: ["hotel-1"],
    })).toEqual({ allowed: false, reason: "hotel_not_visible" });

    expect(getRouteScopeDecision({
      role: "hotel_owner",
      pathname: "/hotels/hotel-1/calendar",
      visibleHotelIds: ["hotel-1"],
    })).toEqual({ allowed: true });
  });

  it("denies private routes when the role is missing or unsupported", () => {
    expect(getRouteScopeDecision({
      role: undefined,
      pathname: "/dashboard",
      visibleHotelIds: [],
    })).toEqual({ allowed: false, reason: "role_required" });

    // `support` used to be the example of an unknown role; spec 14 made it a real
    // platform role, so an unknown string now stands in for it.
    expect(getRouteScopeDecision({
      role: "guest" as never,
      pathname: "/hotels/hotel-1/bookings",
      visibleHotelIds: ["hotel-1"],
    })).toEqual({ allowed: false, reason: "role_required" });
  });

  it("keeps a support user out of hotel data routes without a grant", () => {
    expect(getRouteScopeDecision({
      role: "support",
      pathname: "/hotels/hotel-1/bookings",
      visibleHotelIds: [],
    })).toEqual({ allowed: false, reason: "permission_required" });
  });

  it("uses the first RLS-visible hotel as the default property context", () => {
    expect(getFirstVisibleHotelId(["hotel-1", "hotel-2"])).toBe("hotel-1");
    expect(getFirstVisibleHotelId([])).toBeUndefined();
  });
});
