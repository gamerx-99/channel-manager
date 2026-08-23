export const APP_ROLES = [
  "super_admin",
  "hotel_owner",
  "revenue_manager",
  "front_desk",
  "housekeeping",
  "api_service",
] as const;

export type AppRole = (typeof APP_ROLES)[number];
export type HumanRole = Exclude<AppRole, "api_service">;

export const HUMAN_ROLES = APP_ROLES.filter((role): role is HumanRole => role !== "api_service");

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  hotel_owner: "Hotel Admin / Property Owner",
  revenue_manager: "Revenue Manager",
  front_desk: "Front Desk / Operations Staff",
  housekeeping: "Housekeeping / Maintenance",
  api_service: "API / Service Role",
};

export const PERMISSIONS = [
  "platform.manage_hotels",
  "platform.manage_users",
  "platform.manage_billing",
  "platform.view_system_logs",
  "property.view",
  "property.manage_profile",
  "property.manage_room_structure",
  "property.manage_staff",
  "property.view_reports",
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
  super_admin: PERMISSIONS.filter(permission => !permission.startsWith("service.")),
  hotel_owner: [
    "property.view",
    "property.manage_profile",
    "property.manage_room_structure",
    "property.manage_staff",
    "property.view_reports",
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
