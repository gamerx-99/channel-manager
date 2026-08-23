import { describe, expect, it } from "vitest";
import {
  APP_ROLES,
  HUMAN_ROLES,
  ROLE_PERMISSIONS,
  isHumanRole,
  roleHasPermission,
} from "./authorization";

describe("six-role authorization matrix", () => {
  it("declares the six canonical roles and keeps api_service out of human roles", () => {
    expect(APP_ROLES).toEqual([
      "super_admin",
      "hotel_owner",
      "revenue_manager",
      "front_desk",
      "housekeeping",
      "api_service",
    ]);
    expect(HUMAN_ROLES).toEqual([
      "super_admin",
      "hotel_owner",
      "revenue_manager",
      "front_desk",
      "housekeeping",
    ]);
    expect(isHumanRole("api_service")).toBe(false);
    expect(isHumanRole("housekeeping")).toBe(true);
  });

  it("keeps platform permissions exclusive to super_admin", () => {
    expect(roleHasPermission("super_admin", "platform.manage_hotels")).toBe(true);
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
});
