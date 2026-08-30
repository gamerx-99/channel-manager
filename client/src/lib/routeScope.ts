import {
  isHumanRole,
  isPlatformRole,
  roleHasPermission,
  type AppRole,
  type Permission,
} from "@shared/authorization";

export type RouteScopeRole = AppRole | null | undefined;

export type RouteScopeInput = {
  role: RouteScopeRole;
  roles?: readonly AppRole[];
  pathname: string;
  routeHotelId?: string;
  visibleHotelIds: readonly string[];
};

export type RouteScopeDecision =
  | { allowed: true }
  | { allowed: false; reason: "role_required" | "permission_required" | "hotel_required" | "hotel_not_visible" };

const HOTEL_ROUTE_PATTERN = /^\/hotels\/([^/]+)/i;

export function getRequiredRoutePermission(pathname: string): Permission | null {
  if (pathname.startsWith("/settings/admin-users")) return "platform.manage_users";
  if (pathname === "/hotels") return "platform.view_all_hotels";
  if (pathname.startsWith("/dashboard/channels")) return "property.view_reports";
  if (pathname.startsWith("/dashboard/financials")) return "property.view_financials";
  if (pathname.includes("/ota")) return "ota.view_status";
  if (pathname.includes("/staff")) return "property.manage_staff";
  if (pathname.includes("/bookings")) return "operations.view_bookings";
  if (pathname.includes("/calendar")) return "property.view";
  if (pathname.startsWith("/hotels/")) return "property.view";
  return null;
}

export function getRouteScopeDecision({ role, roles, pathname, routeHotelId, visibleHotelIds }: RouteScopeInput): RouteScopeDecision {
  const effectiveRoles = roles?.length ? roles : role ? [role] : [];
  if (!effectiveRoles.some(candidate => isHumanRole(candidate))) {
    return { allowed: false, reason: "role_required" };
  }

  const requiredPermission = getRequiredRoutePermission(pathname);
  if (requiredPermission && !effectiveRoles.some(candidate => isHumanRole(candidate) && roleHasPermission(candidate, requiredPermission))) {
    return { allowed: false, reason: "permission_required" };
  }

  const hotelId = routeHotelId ?? HOTEL_ROUTE_PATTERN.exec(pathname)?.[1];
  if (!hotelId) return { allowed: true };
  // Platform roles read across every hotel; the per-route permission check above is
  // what keeps a read-only `admin` out of the write surfaces.
  if (effectiveRoles.some(candidate => isPlatformRole(candidate))) return { allowed: true };
  if (!visibleHotelIds.includes(hotelId)) return { allowed: false, reason: "hotel_not_visible" };
  return { allowed: true };
}

export function getFirstVisibleHotelId(visibleHotelIds: readonly string[]): string | undefined {
  return visibleHotelIds[0];
}
