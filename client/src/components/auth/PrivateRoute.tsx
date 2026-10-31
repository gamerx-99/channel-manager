import React, { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../../_core/hooks/useAuth";
import { trpc } from "../../lib/trpc";
import { shouldRedirectToMfaEnroll, MFA_ENROLL_PATH } from "@/lib/mfa";
import { HotelProvider } from "../../contexts/HotelContext";
import { getRouteScopeDecision } from "../../lib/routeScope";
import { SELECTED_HOTEL_STORAGE_KEY } from "../../contexts/HotelContext";
import { type AppRole } from "@shared/authorization";
import { AppShell } from "../layout/AppShell";
import { useTranslation } from "@/lib/i18n";

export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading, isAuthenticated, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [location, navigate] = useLocation();
  const { data: authMe, isLoading: roleLoading, isError: roleError } = trpc.auth.me.useQuery(undefined, { refetchInterval: 15000 });
  const authRoles = (authMe?.roles?.length ? authMe.roles : authMe?.role ? [authMe.role] : []) as AppRole[];
  const {
    data: visibleHotels,
    isLoading: hotelsLoading,
    isError: hotelsError,
  } = trpc.channelManager.hotels.useQuery(undefined, { enabled: Boolean(isAuthenticated && user), refetchInterval: 15000 });

  // Derives MFA requirement from Better Auth session / tRPC authMe without raw Supabase calls.
  const twoFactorEnabled = Boolean(authMe?.twoFactorEnabled);
  const needsMfaEnroll = Boolean(
    isAuthenticated &&
    user &&
    !roleLoading &&
    !roleError &&
    shouldRedirectToMfaEnroll(authRoles, twoFactorEnabled),
  );

  useEffect(() => {
    if (needsMfaEnroll) {
      navigate(MFA_ENROLL_PATH);
    }
  }, [needsMfaEnroll, navigate]);

  if (loading || roleLoading || hotelsLoading) return <main className="auth-loading">Checking your secure session…</main>;
  if (!isAuthenticated || !user) return null;
  if (roleError || hotelsError) {
    return <main className="auth-loading">Unable to verify your property access. Please try again.</main>;
  }
  if (needsMfaEnroll) {
    return null;
  }

  const decision = getRouteScopeDecision({
    role: authMe?.role,
    roles: authRoles,
    pathname: location,
    memberships: authMe?.memberships,
    selectedHotelId: (visibleHotels ?? []).find(h => h.id === localStorage.getItem(SELECTED_HOTEL_STORAGE_KEY))?.id ?? visibleHotels?.[0]?.id,
    visibleHotelIds: (visibleHotels ?? []).map(hotel => hotel.id),
  });

  if (!decision.allowed) {
    const message = decision.reason === "hotel_not_visible"
      ? t("accessRestricted.hotelNotVisible")
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
      <AppShell userName={user.name ?? user.email ?? "User"} userEmail={user.email} roles={authRoles} memberships={authMe?.memberships ?? []} onLogout={() => void logout()}>
        {children}
      </AppShell>
    </HotelProvider>
  );
}
