export const APP_ROLES = [
  "super_admin",
  "admin",
  "hotel_owner",
  "revenue_manager",
  "front_desk",
  "housekeeping",
  "api_service",
] as const;

export type AppRole = (typeof APP_ROLES)[number];
export type HumanRole = Exclude<AppRole, "api_service">;

export const HUMAN_ROLES = APP_ROLES.filter((role): role is HumanRole => role !== "api_service");

/**
 * Platform-level roles are not property memberships. Their `hotel_users` row still
 * carries a `hotel_id` because the column is NOT NULL, but the database gatekeeper
 * `public.is_platform_admin()` ignores which hotel the row points at.
 */
export const PLATFORM_ROLES = ["super_admin", "admin"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Roles a property may hand out to its own staff. Platform roles are never assignable per hotel. */
export type AssignableStaffRole = Exclude<HumanRole, PlatformRole>;

export const ASSIGNABLE_STAFF_ROLES = HUMAN_ROLES.filter(
  (role): role is AssignableStaffRole => !PLATFORM_ROLES.includes(role as PlatformRole),
);

export function isPlatformRole(role: string | null | undefined): role is PlatformRole {
  return PLATFORM_ROLES.includes(role as PlatformRole);
}

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Platform Admin (read-only)",
  hotel_owner: "Hotel Admin / Property Owner",
  revenue_manager: "Revenue Manager",
  front_desk: "Front Desk / Operations Staff",
  housekeeping: "Housekeeping / Maintenance",
  api_service: "API / Service Role",
};

export const PERMISSIONS = [
  "platform.view_all_hotels",
  "platform.manage_hotels",
  "platform.manage_users",
  "platform.manage_billing",
  "platform.view_system_logs",
  "property.view",
  "property.manage_profile",
  "property.manage_room_structure",
  "property.manage_staff",
  "property.view_reports",
  "property.view_financials",
  "revenue.manage_rates",
  "revenue.manage_pricing_rules",
  "revenue.manage_allotment",
  "revenue.manage_stop_sell",
  "operations.view_bookings",
  "operations.manage_bookings",
  "operations.manage_guests",
  "operations.manage_checkin_checkout",
  "operations.export_tm30",
  "housekeeping.view_room_status",
  "housekeeping.update_room_status",
  "ota.view_status",
  "ota.manage_ical_connection",
  "ota.trigger_ical_sync",
  "ota.view_sync_logs",
  "service.ical_sync",
  "service.ari_sync_reserved",
  "service.booking_push_reserved",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Canonical application authorization matrix. `api_service` deliberately keeps
 * ARI and booking-push capabilities reserved until the product's OTA scope is
 * explicitly expanded beyond the current iCal-only implementation.
 */
export const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  // Hotel revenue is the property's own business data, not platform operations data.
  // `property.view_financials` is deliberately withheld from the super_admin blanket
  // grant below (and never added to `admin`/`revenue_manager`) so that, by default,
  // only the hotel_owner can see a property's revenue — not even the platform operator.
  super_admin: PERMISSIONS.filter(
    permission => !permission.startsWith("service.") && permission !== "property.view_financials",
  ),
  // Platform operations / support: cross-hotel READ only. Every write capability is
  // withheld here and at the database layer, where `admin` is granted nothing beyond
  // the `for select` policies that route through `public.is_hotel_member()`.
  admin: [
    "platform.view_all_hotels",
    "property.view",
    "property.view_reports",
    "operations.view_bookings",
    "housekeeping.view_room_status",
    "ota.view_status",
    "ota.view_sync_logs",
  ],
  hotel_owner: [
    "property.view",
    "property.manage_profile",
    "property.manage_room_structure",
    "property.manage_staff",
    "property.view_reports",
    "property.view_financials",
    "operations.view_bookings",
    "operations.manage_bookings",
    "operations.manage_guests",
    "operations.manage_checkin_checkout",
    "operations.export_tm30",
    "housekeeping.view_room_status",
    "housekeeping.update_room_status",
    "ota.view_status",
    "ota.manage_ical_connection",
    "ota.trigger_ical_sync",
    "ota.view_sync_logs",
    "revenue.manage_rates",
    "revenue.manage_pricing_rules",
    "revenue.manage_allotment",
    "revenue.manage_stop_sell",
  ],
  revenue_manager: [
    "property.view",
    "property.view_reports",
    "revenue.manage_rates",
    "revenue.manage_pricing_rules",
    "revenue.manage_allotment",
    "revenue.manage_stop_sell",
    "ota.view_status",
    "ota.view_sync_logs",
  ],
  front_desk: [
    "property.view",
    "operations.view_bookings",
    "operations.manage_bookings",
    "operations.manage_guests",
    "operations.manage_checkin_checkout",
    "operations.export_tm30",
    "housekeeping.view_room_status",
    "ota.view_status",
    "ota.view_sync_logs",
  ],
  housekeeping: [
    "property.view",
    "housekeeping.view_room_status",
    "housekeeping.update_room_status",
  ],
  api_service: ["service.ical_sync"],
};

export const ROLE_PRIORITY: Record<AppRole, number> = {
  super_admin: 100,
  admin: 90,
  hotel_owner: 80,
  revenue_manager: 60,
  front_desk: 40,
  housekeeping: 20,
  api_service: 10,
};

export function isHumanRole(role: string | null | undefined): role is HumanRole {
  return role !== "api_service" && APP_ROLES.includes(role as AppRole);
}

export function isAppRole(role: string | null | undefined): role is AppRole {
  return APP_ROLES.includes(role as AppRole);
}

export function roleHasPermission(role: AppRole, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAnyPermission(roles: readonly AppRole[], permission: Permission) {
  return roles.some(role => roleHasPermission(role, permission));
}

export function getHighestRole(roles: readonly AppRole[]): AppRole | null {
  return roles.slice().sort((a, b) => ROLE_PRIORITY[b] - ROLE_PRIORITY[a])[0] ?? null;
}
