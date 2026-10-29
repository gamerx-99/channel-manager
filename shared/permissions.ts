import { PERMISSIONS, ROLE_PERMISSIONS, type AppRole, type Permission } from "./authorization";

/**
 * Per-person hotel permissions (spec 14). A staff member's role is only a starting
 * template; the owner switches whole groups on or off per person. The stored overrides
 * are the difference from the role template, so a permission added to a role later
 * reaches existing staff automatically.
 */

/** Permissions that live inside one hotel. Platform and service permissions never do. */
export const HOTEL_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  permission => !permission.startsWith("platform.") && !permission.startsWith("service."),
);

/** Every hotel member can open the property; it is not a switch. */
export const BASE_MEMBER_PERMISSION: Permission = "property.view";

export type PermissionToggle = {
  key: string;
  permissions: readonly Permission[];
  /** Toggles that must be on for this one to work; switching this on turns them on. */
  requires?: readonly string[];
  /** Only the hotel owner may switch it on or off for someone. */
  ownerGrantOnly?: boolean;
};

export const PERMISSION_TOGGLES = [
  { key: "bookings_view", permissions: ["operations.view_bookings"] },
  {
    key: "bookings_manage",
    permissions: ["operations.manage_bookings", "operations.manage_guests", "operations.manage_checkin_checkout"],
    requires: ["bookings_view"],
  },
  { key: "bookings_cancel", permissions: ["operations.cancel_bookings"], requires: ["bookings_view"] },
  { key: "tm30", permissions: ["operations.export_tm30"], requires: ["bookings_view"] },
  { key: "housekeeping_view", permissions: ["housekeeping.view_room_status"] },
  { key: "housekeeping_update", permissions: ["housekeeping.update_room_status"], requires: ["housekeeping_view"] },
  {
    key: "rates",
    permissions: [
      "revenue.manage_rates",
      "revenue.manage_pricing_rules",
      "revenue.manage_allotment",
      "revenue.manage_stop_sell",
    ],
  },
  { key: "ota_view", permissions: ["ota.view_status", "ota.view_sync_logs"] },
  { key: "ota_manage", permissions: ["ota.manage_ical_connection", "ota.trigger_ical_sync"], requires: ["ota_view"] },
  { key: "property_setup", permissions: ["property.manage_profile", "property.manage_room_structure"] },
  { key: "reports", permissions: ["property.view_reports"] },
  { key: "financials", permissions: ["property.view_financials"], ownerGrantOnly: true },
  { key: "staff", permissions: ["property.manage_staff"], ownerGrantOnly: true },
] as const satisfies readonly PermissionToggle[];

export type PermissionToggleKey = (typeof PERMISSION_TOGGLES)[number]["key"];

const TOGGLES: readonly PermissionToggle[] = PERMISSION_TOGGLES;
const TOGGLE_BY_KEY = new Map(TOGGLES.map(toggle => [toggle.key, toggle]));

/** Roles whose hotel permissions an owner can adjust per person. */
export const ADJUSTABLE_STAFF_ROLES = ["revenue_manager", "front_desk", "housekeeping"] as const satisfies readonly AppRole[];

function isAdjustableRole(role: AppRole) {
  return (ADJUSTABLE_STAFF_ROLES as readonly AppRole[]).includes(role);
}

export type PermissionOverrides = {
  grants?: readonly string[] | null;
  revokes?: readonly string[] | null;
};

function isHotelPermission(value: string): value is Permission {
  return (HOTEL_PERMISSIONS as readonly string[]).includes(value);
}

function toggleIsOn(toggle: PermissionToggle, permissions: ReadonlySet<Permission>) {
  return toggle.permissions.every(permission => permissions.has(permission));
}

/** Drops any toggle whose requirement is off (fails closed) and keeps the base permission. */
function closeOver(permissions: Set<Permission>) {
  permissions.add(BASE_MEMBER_PERMISSION);
  let changed = true;
  while (changed) {
    changed = false;
    for (const toggle of TOGGLES) {
      if (!toggle.requires || !toggle.permissions.some(permission => permissions.has(permission))) continue;
      const missing = toggle.requires.some(key => !toggleIsOn(TOGGLE_BY_KEY.get(key)!, permissions));
      if (!missing) continue;
      for (const permission of toggle.permissions) permissions.delete(permission);
      changed = true;
    }
  }
  return permissions;
}

function sortPermissions(permissions: Iterable<Permission>): Permission[] {
  const set = new Set(permissions);
  return HOTEL_PERMISSIONS.filter(permission => set.has(permission));
}

/**
 * Effective hotel permissions for one membership. The owner always holds every hotel
 * permission; platform and service roles never take overrides; unknown strings stored in
 * the database are ignored.
 */
export function resolveMembershipPermissions(role: AppRole, overrides: PermissionOverrides = {}): Permission[] {
  if (role === "hotel_owner") return [...HOTEL_PERMISSIONS];
  if (!isAdjustableRole(role)) return [...ROLE_PERMISSIONS[role]];

  const permissions = new Set<Permission>(ROLE_PERMISSIONS[role]);
  for (const grant of overrides.grants ?? []) if (isHotelPermission(grant)) permissions.add(grant);
  for (const revoke of overrides.revokes ?? []) if (isHotelPermission(revoke)) permissions.delete(revoke);
  return sortPermissions(closeOver(permissions));
}

export function getToggleStates(permissions: readonly Permission[]): Record<PermissionToggleKey, boolean> {
  const set = new Set(permissions);
  return Object.fromEntries(TOGGLES.map(toggle => [toggle.key, toggleIsOn(toggle, set)])) as Record<
    PermissionToggleKey,
    boolean
  >;
}

/** Stores only the difference from the role template. */
export function toOverrides(role: AppRole, desired: readonly Permission[]): { grants: Permission[]; revokes: Permission[] } {
  if (!isAdjustableRole(role)) return { grants: [], revokes: [] };
  const template = new Set<Permission>(ROLE_PERMISSIONS[role]);
  const wanted = closeOver(new Set(desired.filter(isHotelPermission)));
  return {
    grants: sortPermissions(Array.from(wanted).filter(permission => !template.has(permission))),
    revokes: sortPermissions(Array.from(template).filter(permission => !wanted.has(permission))),
  };
}

/**
 * The permissions after switching one toggle. Switching on also switches on what it
 * requires; switching off also switches off everything that requires it.
 */
export function applyToggle(current: readonly Permission[], key: PermissionToggleKey, on: boolean): Permission[] {
  const permissions = new Set(current);
  const toggle = TOGGLE_BY_KEY.get(key)!;
  if (on) {
    const pending = [toggle];
    while (pending.length) {
      const next = pending.pop()!;
      for (const permission of next.permissions) permissions.add(permission);
      for (const required of next.requires ?? []) pending.push(TOGGLE_BY_KEY.get(required)!);
    }
  } else {
    const removed = new Set<string>([key]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const candidate of TOGGLES) {
        if (!removed.has(candidate.key) && candidate.requires?.some(required => removed.has(required))) {
          removed.add(candidate.key);
          grew = true;
        }
      }
    }
    removed.forEach(removedKey => {
      for (const permission of TOGGLE_BY_KEY.get(removedKey)!.permissions) permissions.delete(permission);
    });
  }
  return sortPermissions(closeOver(permissions));
}

export const OWNER_GRANT_ONLY_PERMISSIONS: readonly Permission[] = TOGGLES.filter(toggle => toggle.ownerGrantOnly).flatMap(
  toggle => toggle.permissions,
);

export type PermissionEditCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "NOT_ALLOWED" | "OWNER_LOCKED" | "ROLE_NOT_ADJUSTABLE" | "SELF_EDIT" | "TARGET_OUTRANKS_ACTOR" | "BEYOND_ACTOR_PERMISSIONS" | "OWNER_ONLY";
    };

/**
 * Whether `actor` may change `target`'s hotel permissions to `next`. A non-owner can
 * only hand out or take away what they hold themselves, cannot edit someone who holds
 * more than they do, and never touches owner-only switches.
 */
export function checkPermissionEdit(input: {
  actorId: string;
  actorRole: AppRole;
  actorPermissions: readonly Permission[];
  targetId: string;
  targetRole: AppRole;
  targetPermissions: readonly Permission[];
  nextPermissions: readonly Permission[];
}): PermissionEditCheck {
  const actor = new Set(input.actorPermissions);
  if (!actor.has("property.manage_staff")) return { ok: false, reason: "NOT_ALLOWED" };
  if (input.targetRole === "hotel_owner") return { ok: false, reason: "OWNER_LOCKED" };
  if (!isAdjustableRole(input.targetRole)) return { ok: false, reason: "ROLE_NOT_ADJUSTABLE" };
  if (input.actorId === input.targetId) return { ok: false, reason: "SELF_EDIT" };
  if (input.actorRole === "hotel_owner") return { ok: true };

  if (input.targetPermissions.some(permission => !actor.has(permission))) {
    return { ok: false, reason: "TARGET_OUTRANKS_ACTOR" };
  }
  const before = new Set(input.targetPermissions);
  const after = new Set(input.nextPermissions);
  const changed = HOTEL_PERMISSIONS.filter(permission => before.has(permission) !== after.has(permission));
  if (changed.some(permission => OWNER_GRANT_ONLY_PERMISSIONS.includes(permission))) {
    return { ok: false, reason: "OWNER_ONLY" };
  }
  if (changed.some(permission => !actor.has(permission))) return { ok: false, reason: "BEYOND_ACTOR_PERMISSIONS" };
  return { ok: true };
}

/* ── Support grants ─────────────────────────────────────────────────────────── */

/** Durations the owner can pick, in hours. Longer cases ask again. */
export const SUPPORT_GRANT_DURATION_HOURS = [1, 24, 72, 168] as const;
export const SUPPORT_GRANT_MAX_HOURS = 168;

/** Even with a key, support never changes who runs the hotel. */
export const SUPPORT_EXCLUDED_PERMISSIONS: readonly Permission[] = ["property.manage_staff"];

/** What a read-only support grant shows: everything, changing nothing. */
export const SUPPORT_VIEW_PERMISSIONS: readonly Permission[] = [
  "property.view",
  "property.view_reports",
  "property.view_financials",
  "operations.view_bookings",
  "housekeeping.view_room_status",
  "ota.view_status",
  "ota.view_sync_logs",
];

export type SupportGrant = {
  hotelId: string;
  canEdit: boolean;
  expiresAt: string | Date;
  revokedAt?: string | Date | null;
};

export function isSupportGrantActive(grant: SupportGrant, now: Date = new Date()) {
  return !grant.revokedAt && new Date(grant.expiresAt).getTime() > now.getTime();
}

export function resolveSupportGrantPermissions(grant: Pick<SupportGrant, "canEdit">): Permission[] {
  if (!grant.canEdit) return [...SUPPORT_VIEW_PERMISSIONS];
  return HOTEL_PERMISSIONS.filter(permission => !SUPPORT_EXCLUDED_PERMISSIONS.includes(permission));
}
