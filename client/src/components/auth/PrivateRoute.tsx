import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../../_core/hooks/useAuth";
import { trpc } from "../../lib/trpc";
import { supabase } from "@/lib/supabase";
import { shouldRedirectToMfaEnroll, MFA_ENROLL_PATH } from "@/lib/mfa";
import { HotelProvider } from "../../contexts/HotelContext";
import { getRouteScopeDecision } from "../../lib/routeScope";
import { type AppRole } from "@shared/authorization";
import { AppShell } from "../layout/AppShell";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";

export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading, isAuthenticated, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [location, navigate] = useLocation();
  const { data: authMe, isLoading: roleLoading, isError: roleError } = trpc.auth.me.useQuery();
  const completeSignup = trpc.channelManager.completeHotelOwnerSignup.useMutation();
  const utils = trpc.useUtils();
  const authRoles = (authMe?.roles?.length ? authMe.roles : authMe?.role ? [authMe.role] : []) as AppRole[];
  const {
    data: visibleHotels,
    isLoading: hotelsLoading,
    isError: hotelsError,
  } = trpc.channelManager.hotels.useQuery(undefined, { enabled: Boolean(isAuthenticated && user) });

  // T09-04's blocking MFA gate previously only ran once, inline in Login.tsx's
  // submit handler — an already-open tab, a refreshed page, or Supabase silently
  // restoring a persisted session never re-ran it, so a platform admin without a
  // verified factor was never redirected or signed out. Re-check on every mount
  // of a protected route instead, so the gate actually holds for the life of the
  // session, not just the moment of sign-in.
  const authRolesKey = authRoles.join(",");
  const [mfaChecked, setMfaChecked] = useState(false);
  const [needsMfaEnroll, setNeedsMfaEnroll] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user || roleLoading) return;
    let cancelled = false;
    setMfaChecked(false);
    (async () => {
      try {
        const { data: factorData } = await supabase.auth.mfa.listFactors();
        if (cancelled) return;
        setNeedsMfaEnroll(shouldRedirectToMfaEnroll(authRolesKey ? authRolesKey.split(",") : [], factorData));
      } catch {
        // Fail open, matching Login.tsx's existing behavior — a transient MFA
        // check failure shouldn't lock a user out of their own dashboard.
        if (!cancelled) setNeedsMfaEnroll(false);
      } finally {
        if (!cancelled) setMfaChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, user, roleLoading, authRolesKey]);

  useEffect(() => {
    if (!isAuthenticated || !user || roleLoading) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("hayhost.pendingSignupToken") : null;
    if (!token) return;
    let cancelled = false;
    completeSignup.mutateAsync({ token }).then(() => {
      if (cancelled) return;
      try { localStorage.removeItem("hayhost.pendingSignupToken"); } catch { /* ignore */ }
      void utils.channelManager.hotels.invalidate();
      void utils.auth.me.invalidate();
    }).catch((error) => {
      if (cancelled) return;
      toast.error(t("auth.pendingSignupFailed", { error: String((error as { message?: string } | null)?.message ?? error ?? "") }));
      const code = (error as { data?: { code?: string }; code?: string } | null)?.data?.code
        ?? (error as { code?: string } | null)?.code;
      const isNetworkError = !code;
      if (!isNetworkError) {
        try { localStorage.removeItem("hayhost.pendingSignupToken"); } catch { /* ignore */ }
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user, roleLoading]);

  if (loading || roleLoading || hotelsLoading || !mfaChecked) return <main className="auth-loading">Checking your secure session…</main>;
  if (!isAuthenticated || !user) return null;
  if (roleError || hotelsError) {
    return <main className="auth-loading">Unable to verify your property access. Please try again.</main>;
  }
  if (needsMfaEnroll) {
    navigate(MFA_ENROLL_PATH);
    return null;
  }

  const decision = getRouteScopeDecision({
    role: authMe?.role,
    roles: authRoles,
    pathname: location,
    visibleHotelIds: (visibleHotels ?? []).map(hotel => hotel.id),
  });

  if (!decision.allowed) {
    const message = decision.reason === "hotel_not_visible"
      ? "This property is outside your assigned hotel workspace."
      : decision.reason === "permission_required"
        ? "Your current role does not have permission to open this workspace."
        : "This area is available only to platform administrators.";
    return (
      <main className="auth-loading">
        <h1>Access restricted</h1>
        <p>{message}</p>
        <Link href="/dashboard" className="button primary">Return to dashboard</Link>
      </main>
    );
  }

  return (
    <HotelProvider hotels={visibleHotels} isLoading={hotelsLoading} isError={hotelsError}>
      <AppShell userName={user.name ?? user.email ?? "Supabase user"} userEmail={user.email} roles={authRoles} onLogout={() => void logout()}>
        {children}
      </AppShell>
    </HotelProvider>
  );
}
