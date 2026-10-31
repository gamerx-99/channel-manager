import { describe, expect, it } from "vitest";
import {
  APP_ROLES,
  ASSIGNABLE_STAFF_ROLES,
  HUMAN_ROLES,
  PLATFORM_ROLES,
  ROLE_PERMISSIONS,
  isHumanRole,
  isPlatformRole,
  hasHotelPermission,
  roleHasPermission,
} from "./authorization";

describe("seven-role authorization matrix", () => {
  it("declares the canonical roles and keeps api_service out of human roles", () => {
    expect(APP_ROLES).toEqual([
      "super_admin",
      "admin",
      "support",
      "hotel_owner",
      "revenue_manager",
      "front_desk",
      "housekeeping",
      "api_service",
    ]);
    expect(HUMAN_ROLES).toEqual([
      "super_admin",
      "admin",
      "support",
      "hotel_owner",
      "revenue_manager",
      "front_desk",
      "housekeeping",
    ]);
    expect(isHumanRole("api_service")).toBe(false);
    expect(isHumanRole("housekeeping")).toBe(true);
  });

  it("separates platform roles from the roles a property may assign to its staff", () => {
    expect(PLATFORM_ROLES).toEqual(["super_admin", "admin", "support"]);
    expect(ASSIGNABLE_STAFF_ROLES).toEqual([
      "hotel_owner",
      "revenue_manager",
      "front_desk",
      "housekeeping",
    ]);
    expect(isPlatformRole("admin")).toBe(true);
    expect(isPlatformRole("hotel_owner")).toBe(false);
  });

  it("keeps the platform admin role strictly read-only across every hotel", () => {
    expect(roleHasPermission("admin", "platform.view_all_hotels")).toBe(true);
    // `admin` is platform-level only (commit 2d7d067 "close admin cross-hotel read"):
    // it sees the hotel list, never hotel-internal data such as bookings (guest
    // passport data) or OTA sync logs.
    expect(roleHasPermission("admin", "property.view")).toBe(false);
    expect(roleHasPermission("admin", "operations.view_bookings")).toBe(false);
    expect(roleHasPermission("admin", "ota.view_sync_logs")).toBe(false);

    const writeCapability = /^(platform\.manage_|platform\.view_system_logs|property\.manage_|revenue\.|operations\.manage_|operations\.export_|housekeeping\.update_|ota\.manage_|ota\.trigger_|service\.)/;
    expect(ROLE_PERMISSIONS.admin.filter(permission => writeCapability.test(permission))).toEqual([]);
  });

  it("keeps platform management permissions exclusive to super_admin", () => {
    expect(roleHasPermission("super_admin", "platform.manage_hotels")).toBe(true);
    expect(roleHasPermission("admin", "platform.manage_hotels")).toBe(false);
    expect(roleHasPermission("admin", "platform.manage_users")).toBe(false);
    expect(roleHasPermission("hotel_owner", "platform.manage_hotels")).toBe(false);
    expect(roleHasPermission("revenue_manager", "platform.manage_billing")).toBe(false);
    expect(roleHasPermission("api_service", "platform.view_system_logs")).toBe(false);
  });

  it("separates functional hotel roles and machine permissions", () => {
    expect(roleHasPermission("hotel_owner", "property.manage_staff")).toBe(true);
    expect(roleHasPermission("revenue_manager", "revenue.manage_pricing_rules")).toBe(true);
    expect(roleHasPermission("front_desk", "operations.manage_checkin_checkout")).toBe(true);
    expect(roleHasPermission("front_desk", "ota.manage_ical_connection")).toBe(false);
    expect(roleHasPermission("housekeeping", "housekeeping.update_room_status")).toBe(true);
    expect(roleHasPermission("housekeeping", "operations.manage_bookings")).toBe(false);
    expect(ROLE_PERMISSIONS.api_service).toEqual(["service.ical_sync"]);
    expect(roleHasPermission("api_service", "service.ari_sync_reserved")).toBe(false);
    expect(roleHasPermission("api_service", "service.booking_push_reserved")).toBe(false);
  });

  it("keeps property.view_financials scoped to hotel_owner only, even excluding super_admin's blanket grant", () => {
    for (const role of APP_ROLES) {
      expect(roleHasPermission(role, "property.view_financials")).toBe(role === "hotel_owner");
    }
  });

  it("grants platform.manage_signup_links to super_admin only", () => {
    for (const role of APP_ROLES) {
      expect(roleHasPermission(role, "platform.manage_signup_links")).toBe(role === "super_admin");
    }
  });

  it("scopes hotel permissions to the selected hotel's membership", () => {
    const memberships = [{ hotelId: "hotel-a", role: "front_desk" as const }];
    expect(hasHotelPermission([], memberships, "hotel-a", "operations.manage_checkin_checkout")).toBe(true);
    expect(hasHotelPermission([], memberships, "hotel-b", "operations.manage_checkin_checkout")).toBe(false);
    expect(hasHotelPermission(["super_admin"], [], "hotel-b", "operations.manage_checkin_checkout")).toBe(false);
    expect(hasHotelPermission(["admin"], [], "hotel-b", "operations.manage_checkin_checkout")).toBe(false);
  });
});
