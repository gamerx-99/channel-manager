import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../../_core/hooks/useAuth";
import { trpc } from "../../lib/trpc";
import { HotelProvider } from "../../contexts/HotelContext";
import { getRouteScopeDecision } from "../../lib/routeScope";
import { SELECTED_HOTEL_STORAGE_KEY } from "../../contexts/HotelContext";
import { type AppRole } from "@shared/authorization";
import { isSocialPlaceholderEmail } from "@shared/socialAuth";
import { AppShell } from "../layout/AppShell";
import { useTranslation } from "@/lib/i18n";
import { HotelClosureRedirect } from "@/pages/HotelClosure";

export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading, isAuthenticated, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [location] = useLocation();
  const { data: authMe, isLoading: roleLoading, isError: roleError } = trpc.auth.me.useQuery(undefined, { refetchInterval: 15000 });
  const authRoles = (authMe?.roles?.length ? authMe.roles : authMe?.role ? [authMe.role] : []) as AppRole[];
  const {
    data: visibleHotels,
    isLoading: hotelsLoading,
    isError: hotelsError,
  } = trpc.channelManager.hotels.useQuery(undefined, { enabled: Boolean(isAuthenticated && user), refetchInterval: 15000 });

  if (loading || roleLoading || hotelsLoading) return <main className="auth-loading">{t("privateRoute.checkingSession")}</main>;
  if (!isAuthenticated || !user) return null;
  if (roleError || hotelsError) {
    return <main className="auth-loading">{t("privateRoute.verifyAccess")}</main>;
  }
  const decision = getRouteScopeDecision({
    role: authMe?.role,
    roles: authRoles,
    pathname: location,
    memberships: authMe?.memberships,
    selectedHotelId: (visibleHotels ?? []).find(h => h.id === localStorage.getItem(SELECTED_HOTEL_STORAGE_KEY))?.id ?? visibleHotels?.[0]?.id,
    visibleHotelIds: (visibleHotels ?? []).map(hotel => hotel.id),
  });

  // New personal accounts land on the dashboard route for their next step;
  // they may create a hotel or wait for a staff invitation, but have no hotel role yet.
  const canAccessAccountSetup = location === "/dashboard" && authRoles.length === 0 && authMe?.memberships?.length === 0;
  if (!decision.allowed && !canAccessAccountSetup) {
    const message = decision.reason === "hotel_not_visible"
      ? t("accessRestricted.hotelNotVisible")
      : decision.reason === "role_required"
        ? t("accessRestricted.hotelRequired")
      : decision.reason === "permission_required"
        ? t("accessRestricted.permissionRequired")
        : t("accessRestricted.platformOnly");
    return (
      <main className="auth-loading">
        <h1>{t("accessRestricted.title")}</h1>
        <p>{message}</p>
        <Link href="/dashboard" className="button primary">{t("accessRestricted.returnToDashboard")}</Link>
      </main>
    );
  }

  return (
    <HotelProvider hotels={visibleHotels} isLoading={hotelsLoading} isError={hotelsError}>
      <HotelClosureRedirect />
      <AppShell userName={user.name ?? user.email ?? "User"} userEmail={isSocialPlaceholderEmail(user.email) ? null : user.email} roles={authRoles} memberships={authMe?.memberships ?? []} onLogout={() => void logout()}>
        {children}
      </AppShell>
    </HotelProvider>
  );
}
