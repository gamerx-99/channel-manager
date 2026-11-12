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
import OwnerTerms from "@/pages/OwnerTerms";
import { mustAcceptOwnerTerms } from "@/lib/ownerTermsGate";
import AddRealEmail from "@/pages/AddRealEmail";
import { hasLinkAfterSignIn, mustAddRealEmail, takeLinkAfterSignIn } from "@/lib/realEmailGate";
import { authClient } from "@/lib/auth-client";

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

  // After "yes, sign in with this account" on the add-email screen: once signed in to the existing account,
  // link Facebook to it (the person approves Facebook again; nothing is joined without that).
  const readyToLink = Boolean(authMe) && !mustAddRealEmail(authMe);
  React.useEffect(() => {
    if (!readyToLink || !hasLinkAfterSignIn()) return;
    const provider = takeLinkAfterSignIn();
    if (provider) void authClient.linkSocial({ provider, callbackURL: "/settings/account", errorCallbackURL: "/settings/security" });
  }, [readyToLink]);

  if (loading || roleLoading || hotelsLoading) return <main className="auth-loading">{t("privateRoute.checkingSession")}</main>;
  if (!isAuthenticated || !user) return null;
  if (roleError || hotelsError) {
    return <main className="auth-loading">{t("privateRoute.verifyAccess")}</main>;
  }
  // Owner decision 2026-11-11: a LINE / Facebook account adds and confirms a real email first,
  // then a hotel owner accepts the platform terms, before using the app.
  if (mustAddRealEmail(authMe)) {
    return <AddRealEmail />;
  }
  if (mustAcceptOwnerTerms(authMe)) {
    return <OwnerTerms />;
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
