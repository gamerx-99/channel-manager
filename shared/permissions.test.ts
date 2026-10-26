import { describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS, hasHotelPermission, type Permission } from "./authorization";
import {
  ADJUSTABLE_STAFF_ROLES,
  HOTEL_PERMISSIONS,
  OWNER_GRANT_ONLY_PERMISSIONS,
  PERMISSION_TOGGLES,
  SUPPORT_EXCLUDED_PERMISSIONS,
  SUPPORT_GRANT_MAX_HOURS,
  SUPPORT_VIEW_PERMISSIONS,
  applyToggle,
  checkPermissionEdit,
  getToggleStates,
  isSupportGrantActive,
  resolveMembershipPermissions,
  resolveSupportGrantPermissions,
  toOverrides,
} from "./permissions";

describe("permission toggles", () => {
  it("cover every hotel permission except the base one exactly once", () => {
    const covered = PERMISSION_TOGGLES.flatMap(toggle => toggle.permissions);
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual(HOTEL_PERMISSIONS.filter(permission => permission !== "property.view").sort());
  });

  it("only require toggles that exist", () => {
    const keys = new Set<string>(PERMISSION_TOGGLES.map(toggle => toggle.key));
    for (const toggle of PERMISSION_TOGGLES) {
      for (const required of ("requires" in toggle ? toggle.requires : []) ?? []) expect(keys.has(required)).toBe(true);
    }
  });

  it("express every staff role template as whole toggles, so the switches never show half on", () => {
    for (const role of ADJUSTABLE_STAFF_ROLES) {
      const template = new Set<Permission>(ROLE_PERMISSIONS[role]);
      for (const toggle of PERMISSION_TOGGLES) {
        const held = toggle.permissions.filter(permission => template.has(permission)).length;
        expect([0, toggle.permissions.length], `${role} / ${toggle.key}`).toContain(held);
      }
    }
  });

  it("keep the owner-only switches to staff management and revenue", () => {
    expect([...OWNER_GRANT_ONLY_PERMISSIONS].sort()).toEqual(["property.manage_staff", "property.view_financials"]);
  });
});

describe("resolveMembershipPermissions", () => {
  it("returns the role template when nothing is overridden", () => {
    expect(resolveMembershipPermissions("front_desk")).toEqual(
      HOTEL_PERMISSIONS.filter(permission => ROLE_PERMISSIONS.front_desk.includes(permission)),
    );
  });

  it("gives the owner every hotel permission regardless of stored overrides", () => {
    expect(resolveMembershipPermissions("hotel_owner", { revokes: ["operations.view_bookings"] })).toEqual([...HOTEL_PERMISSIONS]);
    expect(resolveMembershipPermissions("hotel_owner")).toContain("operations.cancel_bookings");
  });

  it("adds grants and removes revokes for staff", () => {
    const permissions = resolveMembershipPermissions("housekeeping", {
      grants: ["operations.view_bookings"],
      revokes: ["housekeeping.update_room_status"],
    });
    expect(permissions).toContain("operations.view_bookings");
    expect(permissions).not.toContain("housekeeping.update_room_status");
    expect(permissions).toContain("housekeeping.view_room_status");
  });

  it("fails closed when a requirement is revoked", () => {
    const permissions = resolveMembershipPermissions("front_desk", { revokes: ["operations.view_bookings"] });
    expect(permissions).not.toContain("operations.manage_bookings");
    expect(permissions).not.toContain("operations.export_tm30");
    expect(permissions).toContain("property.view");
  });

  it("ignores platform, service and unknown permissions in stored grants", () => {
    const permissions = resolveMembershipPermissions("front_desk", {
      grants: ["platform.manage_hotels", "service.ical_sync", "made.up"],
    });
    expect(permissions.some(permission => permission.startsWith("platform.") || permission.startsWith("service."))).toBe(false);
  });

  it("never applies overrides to platform roles", () => {
    expect(resolveMembershipPermissions("support", { grants: ["operations.view_bookings"] })).toEqual([
      ...ROLE_PERMISSIONS.support,
    ]);
  });
});

describe("applyToggle and toOverrides", () => {
  it("switching a toggle on also switches on what it requires", () => {
    const next = applyToggle(resolveMembershipPermissions("housekeeping"), "bookings_cancel", true);
    expect(next).toEqual(expect.arrayContaining(["operations.cancel_bookings", "operations.view_bookings"]));
  });

  it("switching a toggle off also switches off what depends on it", () => {
    const next = applyToggle(resolveMembershipPermissions("front_desk"), "bookings_view", false);
    expect(getToggleStates(next)).toMatchObject({ bookings_view: false, bookings_manage: false, tm30: false });
    expect(next).toContain("property.view");
  });

  it("stores only the difference from the role template and round-trips", () => {
    const desired = applyToggle(resolveMembershipPermissions("front_desk"), "rates", true);
    const overrides = toOverrides("front_desk", desired);
    expect(overrides).toEqual({
      grants: ["revenue.manage_rates", "revenue.manage_pricing_rules", "revenue.manage_allotment", "revenue.manage_stop_sell"],
      revokes: [],
    });
    expect(resolveMembershipPermissions("front_desk", overrides)).toEqual(desired);
  });

  it("stores no overrides for roles that cannot be adjusted", () => {
    expect(toOverrides("hotel_owner", [])).toEqual({ grants: [], revokes: [] });
  });
});

describe("checkPermissionEdit", () => {
  const owner = { actorId: "o", actorRole: "hotel_owner" as const, actorPermissions: resolveMembershipPermissions("hotel_owner") };
  const frontDesk = resolveMembershipPermissions("front_desk");
  const target = { targetId: "t", targetRole: "front_desk" as const, targetPermissions: frontDesk };

  it("lets the owner change any staff switch, including owner-only ones", () => {
    expect(checkPermissionEdit({ ...owner, ...target, nextPermissions: applyToggle(frontDesk, "financials", true) })).toEqual({ ok: true });
  });

  it("never lets anyone edit the owner, or edit themselves", () => {
    expect(
      checkPermissionEdit({ ...owner, targetId: "x", targetRole: "hotel_owner", targetPermissions: [], nextPermissions: [] }),
    ).toEqual({ ok: false, reason: "OWNER_LOCKED" });
    expect(checkPermissionEdit({ ...owner, ...target, targetId: "o", nextPermissions: frontDesk })).toEqual({
      ok: false,
      reason: "SELF_EDIT",
    });
  });

  it("requires the staff-management permission", () => {
    expect(
      checkPermissionEdit({ actorId: "a", actorRole: "front_desk", actorPermissions: frontDesk, ...target, nextPermissions: frontDesk }),
    ).toEqual({ ok: false, reason: "NOT_ALLOWED" });
  });

  describe("a manager who is not the owner", () => {
    const managerPermissions = applyToggle(applyToggle(frontDesk, "staff", true), "rates", true);
    const manager = { actorId: "m", actorRole: "front_desk" as const, actorPermissions: managerPermissions };

    it("can hand out a switch they hold", () => {
      expect(checkPermissionEdit({ ...manager, ...target, nextPermissions: applyToggle(frontDesk, "rates", true) })).toEqual({ ok: true });
    });

    it("cannot hand out a switch they do not hold", () => {
      expect(checkPermissionEdit({ ...manager, ...target, nextPermissions: applyToggle(frontDesk, "ota_manage", true) })).toEqual({
        ok: false,
        reason: "BEYOND_ACTOR_PERMISSIONS",
      });
    });

    it("cannot touch owner-only switches even when they hold them", () => {
      expect(checkPermissionEdit({ ...manager, ...target, nextPermissions: applyToggle(frontDesk, "staff", true) })).toEqual({
        ok: false,
        reason: "OWNER_ONLY",
      });
    });

    it("cannot edit someone who holds more than they do", () => {
      const stronger = applyToggle(frontDesk, "property_setup", true);
      expect(
        checkPermissionEdit({ ...manager, ...target, targetPermissions: stronger, nextPermissions: frontDesk }),
      ).toEqual({ ok: false, reason: "TARGET_OUTRANKS_ACTOR" });
    });
  });
});

describe("support grants", () => {
  const now = new Date("2026-10-27T12:00:00Z");

  it("are active only before expiry and while not revoked", () => {
    expect(isSupportGrantActive({ hotelId: "h", canEdit: false, expiresAt: "2026-10-27T13:00:00Z" }, now)).toBe(true);
    expect(isSupportGrantActive({ hotelId: "h", canEdit: false, expiresAt: "2026-10-27T11:59:59Z" }, now)).toBe(false);
    expect(
      isSupportGrantActive({ hotelId: "h", canEdit: false, expiresAt: "2026-10-28T00:00:00Z", revokedAt: "2026-10-27T11:00:00Z" }, now),
    ).toBe(false);
  });

  it("show everything but change nothing when read-only", () => {
    const permissions = resolveSupportGrantPermissions({ canEdit: false });
    expect(permissions).toEqual([...SUPPORT_VIEW_PERMISSIONS]);
    expect(permissions).toContain("property.view_financials");
    expect(permissions.some(permission => /\.(manage|update|trigger|export|cancel)_/.test(permission))).toBe(false);
  });

  it("allow changes when the owner allowed edits, but never staff management", () => {
    const permissions = resolveSupportGrantPermissions({ canEdit: true });
    expect(permissions).toContain("operations.manage_bookings");
    for (const excluded of SUPPORT_EXCLUDED_PERMISSIONS) expect(permissions).not.toContain(excluded);
  });

  it("cap a grant at seven days", () => {
    expect(SUPPORT_GRANT_MAX_HOURS).toBe(168);
  });
});

describe("hasHotelPermission with resolved permissions", () => {
  it("uses a membership's resolved permissions instead of the role template", () => {
    const memberships = [{ hotelId: "h1", role: "housekeeping" as const, permissions: resolveMembershipPermissions("housekeeping", { grants: ["operations.view_bookings"] }) }];
    expect(hasHotelPermission([], memberships, "h1", "operations.view_bookings")).toBe(true);
    expect(hasHotelPermission([], memberships, "h2", "operations.view_bookings")).toBe(false);
  });

  it("falls back to the role template when permissions are not resolved", () => {
    expect(hasHotelPermission([], [{ hotelId: "h1", role: "front_desk" }], "h1", "operations.manage_bookings")).toBe(true);
    expect(hasHotelPermission([], [{ hotelId: "h1", role: "front_desk" }], "h1", "operations.cancel_bookings")).toBe(false);
  });

  it("gives a support user nothing in a hotel without a grant", () => {
    expect(hasHotelPermission(["support"], [], "h1", "operations.view_bookings")).toBe(false);
    expect(hasHotelPermission(["support"], [], "h1", "platform.view_all_hotels")).toBe(true);
  });
});
