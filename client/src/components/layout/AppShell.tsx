// Quiet Ledger reminder: global shell uses rail-and-canvas navigation, charcoal ink, warm paper, and pine signal color.
import React, { useEffect, useState } from "react";
import { hasAnyPermission, isPlatformRole, type AppRole, type Permission, type PermissionMembership } from "@shared/authorization";
import { Sidebar } from "./Sidebar";
import { useHotel } from "../../contexts/HotelContext";
import { SupportAccessBanner } from "../SupportAccessBanner";
import { Topbar } from "./Topbar";
import { useTranslation } from "@/lib/i18n";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getTourProgress } from "@/lib/tour/tourProgress";
import { GuidedTour } from "@/components/tour/GuidedTour";

export function AppShell({ children, userName, userEmail, onLogout, roles, memberships = [] }: { children: React.ReactNode; userName: string; userEmail: string | null; onLogout: () => void; roles: readonly AppRole[]; memberships?: readonly (PermissionMembership & { expiresAt?: Date | string; mode?: "view" | "edit" })[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [tourRequested, setTourRequested] = useState(false);
  const { selectedHotelId } = useHotel();
  const [location, navigate] = useLocation();
  const onboarding = trpc.auth.onboardingStatus.useQuery();
  const hotelQuery = trpc.channelManager.hotel.useQuery(selectedHotelId ?? "", { enabled: Boolean(selectedHotelId) });
  const setTourState = trpc.auth.setOnboardingTourState.useMutation({ onSuccess: () => void onboarding.refetch() });
  const progress = getTourProgress({ hotel: hotelQuery.data ? { name: hotelQuery.data.name, address: hotelQuery.data.address, ownerContact: hotelQuery.data.owner_contact } : null, roomTypes: hotelQuery.data?.room_types ?? [], rooms: (hotelQuery.data?.rooms ?? []).map((room: any) => ({ roomTypeId: room.room_type_id })), skippedAt: onboarding.data?.tourSkippedAt ? new Date(onboarding.data.tourSkippedAt).getTime() : null, completedAt: onboarding.data?.tourCompletedAt ? new Date(onboarding.data.tourCompletedAt).getTime() : null });
  // Only someone who can set up the hotel and its rooms gets the setup tour: not front desk,
  // housekeeping, support or platform roles.
  const canSetUpHotel = Boolean(selectedHotelId) && memberships.some(m => m.hotelId === selectedHotelId
    && (!m.expiresAt || new Date(m.expiresAt).getTime() > Date.now())
    && m.permissions?.includes("property.manage_profile") && m.permissions?.includes("property.manage_room_structure"))
    && !roles.some(role => isPlatformRole(role));
  const autoStart = canSetUpHotel && !onboarding.isLoading && !hotelQuery.isLoading && progress.shouldAutoStart;
  const tourActive = location === `/hotels/${selectedHotelId}` && autoStart;
  useEffect(() => {
    if (location === "/dashboard" && autoStart) navigate(`/hotels/${selectedHotelId}`);
  }, [location, selectedHotelId, autoStart, navigate]);
  const tourSteps = [
    { target: "hotel-settings", title: t("guidedTour.hotelTitle"), body: t("guidedTour.hotelBody"), action: t("guidedTour.hotelAction") },
    { target: "room-settings", title: t("guidedTour.roomTitle"), body: t("guidedTour.roomBody"), action: t("guidedTour.roomAction") },
    // Only say "done" when it is true; otherwise list what is still missing.
    progress.hotelSettingsDone && progress.roomsDone
      ? { title: t("guidedTour.finishTitle"), body: t("guidedTour.finishBody") }
      : { title: t("guidedTour.pendingTitle"), body: [!progress.hotelSettingsDone && t("guidedTour.pendingHotel"), !progress.roomsDone && t("guidedTour.pendingRooms"), t("guidedTour.pendingFooter")].filter(Boolean).join(" ") },
  ];
  const can = (permission: Permission) => permission.startsWith("platform.")
    ? hasAnyPermission(roles, permission)
    : (permission !== "property.view_financials" || !roles.includes("support")) && !roles.includes("super_admin") && memberships.some(m => m.hotelId === selectedHotelId && (!m.expiresAt || new Date(m.expiresAt).getTime() > Date.now()) && (m.permissions?.includes(permission) ?? false));
  const isSuperAdmin = roles.includes("super_admin");
  const isPlatformAdmin = roles.some(role => isPlatformRole(role));
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "U";

  return (
    <div className="app-shell">
      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
        can={can}
        isSuperAdmin={isSuperAdmin}
        isPlatformAdmin={isPlatformAdmin}
        userName={userName}
        userEmail={userEmail}
        initials={initials}
        onLogout={onLogout}
        workspaceMenuOpen={workspaceMenuOpen}
        onToggleWorkspaceMenu={() => { setWorkspaceMenuOpen(prev => !prev); setAddMenuOpen(false); setUserMenuOpen(false); }}
        onCloseWorkspaceMenu={() => setWorkspaceMenuOpen(false)}
      />

      {open && <button className="mobile-scrim" aria-label={t("common.closeMenu")} onClick={() => setOpen(false)} />}

      <main className="main-canvas">
        <Topbar
          onOpenMenu={() => setOpen(true)}
          can={can}
          isSuperAdmin={isSuperAdmin}
          isPlatformAdmin={isPlatformAdmin}
          userName={userName}
          userEmail={userEmail}
          initials={initials}
          onLogout={onLogout}
          roles={roles}
          addMenuOpen={addMenuOpen}
          onToggleAddMenu={() => { setAddMenuOpen(prev => !prev); setUserMenuOpen(false); setWorkspaceMenuOpen(false); }}
          onCloseAddMenu={() => setAddMenuOpen(false)}
          userMenuOpen={userMenuOpen}
          onToggleUserMenu={() => { setUserMenuOpen(prev => !prev); setAddMenuOpen(false); setWorkspaceMenuOpen(false); }}
          onCloseUserMenu={() => setUserMenuOpen(false)}
          onRestartTour={() => { setUserMenuOpen(false); if (selectedHotelId) navigate(`/hotels/${selectedHotelId}`); setTourRequested(true); setTourState.mutate({ state: "reset" }); }}
        />
        <SupportAccessBanner memberships={memberships} />
        <div className="page-wrap">{children}</div>
        {location === `/hotels/${selectedHotelId}` && <GuidedTour steps={tourSteps} active={tourActive || tourRequested} onFinish={skipped => { setTourRequested(false); setTourState.mutate({ state: skipped ? "skipped" : "completed" }); }} onRestart={() => { setTourRequested(true); setTourState.mutate({ state: "reset" }); }} />}
      </main>
    </div>
  );
}
