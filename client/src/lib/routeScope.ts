import {
  isHumanRole,
  isPlatformRole,
  roleHasPermission,
  type AppRole,
  type Permission,
  type PermissionMembership,
} from "@shared/authorization";

export type RouteScopeRole = AppRole | null | undefined;

export type RouteScopeInput = {
  role: RouteScopeRole;
  roles?: readonly AppRole[];
  pathname: string;
  routeHotelId?: string;
  visibleHotelIds: readonly string[];
  memberships?: readonly (PermissionMembership & { expiresAt?: Date | string })[];
  selectedHotelId?: string | null;
  now?: Date;
};

export type RouteScopeDecision =
  | { allowed: true }
  | { allowed: false; reason: "role_required" | "permission_required" | "hotel_required" | "hotel_not_visible" };

const HOTEL_ROUTE_PATTERN = /^\/hotels\/([^/]+)/i;

export function getRequiredRoutePermission(pathname: string): Permission | null {
  if (pathname.startsWith("/settings/admin-users")) return "platform.manage_users";
  if (pathname === "/platform") return "platform.view_system_logs";
  if (pathname.includes("/support-access")) return "property.manage_support_access";
  if (pathname === "/hotels") return "platform.view_all_hotels";
  if (pathname.startsWith("/dashboard/pricing")) return "revenue.manage_pricing_rules";
  if (pathname.startsWith("/dashboard/financials")) return "property.view_financials";
  if (pathname.startsWith("/communications")) return "operations.view_bookings";
  if (pathname.startsWith("/housekeeping") || pathname.startsWith("/dashboard/housekeeping")) return "housekeeping.view_room_status";
  if (pathname.includes("/ota")) return "ota.view_status";
  if (pathname.includes("/staff")) return "property.manage_staff";
  if (pathname.includes("/bookings")) return "operations.view_bookings";
  if (pathname.includes("/calendar")) return "property.view";
  if (pathname.startsWith("/hotels/")) return "property.view";
  return null;
}

export function getRouteScopeDecision({ role, roles, pathname, routeHotelId, visibleHotelIds, memberships, selectedHotelId, now = new Date() }: RouteScopeInput): RouteScopeDecision {
  const effectiveRoles = roles?.length ? roles : role ? [role] : [];
  if (!effectiveRoles.some(candidate => isHumanRole(candidate))) return { allowed: false, reason: "role_required" };
  const requiredPermission = getRequiredRoutePermission(pathname);
  // Staff reach the financial dashboard through the owner's per-person switch, which the
  // membership check below reads. A support key carries the permission but never opens it.
  if (requiredPermission === "property.view_financials" && effectiveRoles.includes("support")) {
    return { allowed: false, reason: "permission_required" };
  }
  if (requiredPermission?.startsWith("platform.")) {
    return effectiveRoles.some(candidate => roleHasPermission(candidate, requiredPermission))
      ? { allowed: true } : { allowed: false, reason: "permission_required" };
  }
  // Dashboard and security are entry surfaces. Hotel data always uses a hotel scope.
  const hotelId = routeHotelId ?? HOTEL_ROUTE_PATTERN.exec(pathname)?.[1] ?? selectedHotelId ?? undefined;
  if (!requiredPermission && !hotelId) return { allowed: true };
  const scoped = memberships?.filter(m => m.hotelId === hotelId && (!m.expiresAt || new Date(m.expiresAt).getTime() > now.getTime()));
  const permitted = !effectiveRoles.includes("super_admin") && (memberships !== undefined
    ? scoped?.some(m => (m.permissions ?? []).includes(requiredPermission ?? "property.view"))
    : effectiveRoles.some(candidate => !isPlatformRole(candidate) && roleHasPermission(candidate, requiredPermission ?? "property.view")));
  if (!permitted) return { allowed: false, reason: "permission_required" };
  if (!hotelId) return { allowed: true };
  if (!visibleHotelIds.includes(hotelId)) return { allowed: false, reason: "hotel_not_visible" };
  return { allowed: true };
}

export function getFirstVisibleHotelId(visibleHotelIds: readonly string[]): string | undefined {
  return visibleHotelIds[0];
}
