import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3,
  BedDouble,
  Bell,
  CalendarDays,
  ChevronDown,
  FileSpreadsheet,
  Globe,
  Hotel,
  LayoutDashboard,
  LogOut,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { WorkspaceMenu } from "../WorkspaceMenu";
import { useHotel } from "../../contexts/HotelContext";
import { type Permission } from "@shared/authorization";
import { useTranslation } from "@/lib/i18n";
import { communicationsEnabled, otaSyncEnabled } from "@/lib/featureFlags";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  can: (permission: Permission) => boolean;
  isSuperAdmin: boolean;
  isPlatformAdmin: boolean;
  userName: string;
  userEmail: string | null;
  initials: string;
  onLogout: () => void;
  workspaceMenuOpen: boolean;
  onToggleWorkspaceMenu: () => void;
  onCloseWorkspaceMenu: () => void;
};

/**
 * Links under the sidebar's "Hotel settings" button. Both permissions belong only to the
 * hotel owner (and the super_admin blanket grant), so the button is owner-only.
 */
export function getHotelSettingsItems(
  selectedHotelId: string | null | undefined,
  can: (permission: Permission) => boolean,
  t: (key: string) => string,
) {
  if (!selectedHotelId) return [];
  return [
    ...(can("property.manage_staff") ? [{ href: `/hotels/${selectedHotelId}/staff`, label: t("sidebar.hotelStaff"), icon: Users }] : []),
    ...(can("property.manage_support_access") ? [{ href: `/hotels/${selectedHotelId}/support-access`, label: t("supportAccess.navLabel"), icon: ShieldCheck }] : []),
  ];
}

function getActivePath(location: string, selectedHotelId?: string | null) {
  if (!selectedHotelId) return location;
  const hotelSubPaths = ["bookings", "calendar", "ota", "staff", "support-access"];
  for (const subPath of hotelSubPaths) {
    const prefix = `/hotels/${selectedHotelId}/${subPath}`;
    if (location.startsWith(prefix)) return prefix;
  }
  const hotelRoot = `/hotels/${selectedHotelId}`;
  if (location.startsWith(hotelRoot)) return hotelRoot;
  return location;
}

export function Sidebar({
  open,
  onClose,
  can,
  isSuperAdmin,
  isPlatformAdmin,
  userName,
  userEmail,
  initials,
  onLogout,
  workspaceMenuOpen,
  onToggleWorkspaceMenu,
  onCloseWorkspaceMenu,
}: SidebarProps) {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { hotels: visibleHotels, selectedHotelId, selectedHotel, setSelectedHotelId } = useHotel();
  const selectedHotelName = selectedHotel?.name;
  const hotelNavItems = selectedHotelId
    ? [
      ...(can("property.manage_room_structure") ? [{ href: `/hotels/${selectedHotelId}`, label: t("sidebar.roomOperations"), icon: BedDouble }] : []),
      ...(can("operations.view_bookings") ? [{ href: `/hotels/${selectedHotelId}/bookings`, label: t("sidebar.bookings"), icon: Users }] : []),
      ...(can("property.view") ? [{ href: `/hotels/${selectedHotelId}/calendar`, label: t("sidebar.availability"), icon: CalendarDays }] : []),
      ...(otaSyncEnabled && can("ota.view_status") ? [{ href: `/hotels/${selectedHotelId}/ota`, label: t("sidebar.otaSync"), icon: Globe }] : []),
    ]
    : [];
  const settingsItems = getHotelSettingsItems(selectedHotelId, can, t);
  const onSettingsPage = settingsItems.some(item => location.startsWith(item.href));
  const [settingsOpen, setSettingsOpen] = useState(onSettingsPage);
  useEffect(() => {
    if (onSettingsPage) setSettingsOpen(true);
  }, [onSettingsPage]);
  // On a phone the group sits at the bottom of the scrolling menu, so its links open
  // below the fold. Bring them into view when the owner opens the group themselves.
  const settingsListRef = useRef<HTMLDivElement>(null);
  const revealSettings = useRef(false);
  useEffect(() => {
    if (!settingsOpen || !revealSettings.current) return;
    revealSettings.current = false;
    settingsListRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [settingsOpen]);
  const navItems = [
    ...(can("platform.view_system_logs") ? [{ href: "/platform", label: t("sidebar.platformOverview"), icon: LayoutDashboard }] : []),
    { href: "/dashboard", label: isPlatformAdmin ? t("sidebar.overview") : t("sidebar.overview"), icon: LayoutDashboard },
    ...(can("platform.view_all_hotels") ? [{ href: "/hotels", label: t("sidebar.hotelsManagement"), icon: Hotel }] : []),
    ...(can("platform.manage_users") ? [{ href: "/settings/admin-users", label: t("sidebar.adminUsers"), icon: ShieldCheck }] : []),
    ...hotelNavItems,
  ];
  const activePath = getActivePath(location, selectedHotelId);

  return (
    <aside className={`sidebar ${open ? "is-open" : ""}`}>
      <div className="sidebar-head">
        <Link href="/dashboard" className="brand-lockup" aria-label="hayhost" onClick={() => onClose()}>
          <img className="sidebar-logo" src="/logo-wide.png" alt="hayhost" width={126} height={32} />
        </Link>
        <button className="icon-button sidebar-close" onClick={() => onClose()} aria-label={t("sidebar.closeMenu")}>
          <X size={17} />
        </button>
      </div>

      <WorkspaceMenu
        hotels={visibleHotels}
        open={workspaceMenuOpen}
        onToggle={onToggleWorkspaceMenu}
        onClose={onCloseWorkspaceMenu}
        isPlatformAdmin={isPlatformAdmin}
        activeHotelName={selectedHotelName}
        onSelectHotelId={setSelectedHotelId}
      />

      <nav className="nav-list" aria-label={t("common.mainNavigation")}>
        <p className="nav-label">{t("sidebar.workspace")}</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = Boolean(item.href && activePath === item.href);
          if (!item.href) {
            return (
              <span key={item.label} className="nav-link" aria-disabled="true" title={t("sidebar.selectHotelFirst")} style={{ opacity: 0.48, cursor: "not-allowed" }}>
                <Icon size={17} strokeWidth={1.8} />
                <span>{item.label}</span>
              </span>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive ? "active" : ""}`}
              onClick={() => onClose()}
            >
              <Icon size={17} strokeWidth={isActive ? 2.3 : 1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <p className="nav-label nav-label-spaced">{t("sidebar.operationsModules")}</p>
        {can("property.view_financials") && (
          <Link
            href="/dashboard/financials"
            className={`nav-link ${location === "/dashboard/financials" ? "active" : ""}`}
            onClick={() => onClose()}
          >
            <BarChart3 size={17} strokeWidth={location === "/dashboard/financials" ? 2.3 : 1.8} />
            <span>{t("sidebar.financials")}</span>
          </Link>
        )}
        {isSuperAdmin && <button type="button" className="nav-link w-full text-left bg-transparent border-0 cursor-pointer" onClick={() => toast.info(t("sidebar.paymentsComingSoon"))}>
          <FileSpreadsheet size={17} strokeWidth={1.8} />
          <span>{t("sidebar.payments")}</span>
        </button>}
        {communicationsEnabled && can("operations.view_bookings") && (
          <Link
            href="/communications"
            className={`nav-link ${location === "/communications" || location.startsWith("/communications") ? "active" : ""}`}
            onClick={() => onClose()}
          >
            <Bell size={17} strokeWidth={location.startsWith("/communications") ? 2.3 : 1.8} />
            <span>{t("sidebar.communications")}</span>
          </Link>
        )}
        {can("housekeeping.view_room_status") && (
          <Link
            href="/housekeeping"
            className={`nav-link ${location === "/housekeeping" || location.startsWith("/housekeeping/") ? "active" : ""}`}
            onClick={() => onClose()}
          >
            <Users size={17} strokeWidth={location === "/housekeeping" ? 2.3 : 1.8} />
            <span>{t("sidebar.housekeeping")}</span>
          </Link>
        )}
        <Link
          href={selectedHotelId ? "/website-builder" : "/dashboard"}
          className={`nav-link ${location === "/website-builder" ? "active" : ""}`}
          onClick={() => onClose()}
        >
          <Globe size={17} strokeWidth={location === "/website-builder" ? 2.3 : 1.8} />
          <span>{t("sidebar.websiteBuilder")}</span>
        </Link>
        {can("revenue.manage_pricing_rules") && (
          <Link
            href="/dashboard/pricing"
            className={`nav-link ${location === "/dashboard/pricing" ? "active" : ""}`}
            onClick={() => onClose()}
          >
            <BarChart3 size={17} strokeWidth={location === "/dashboard/pricing" ? 2.3 : 1.8} />
            <span>{t("sidebar.advancedPricing")}</span>
          </Link>
        )}
        {(settingsItems.length > 0 || can("platform.manage_users")) && <p className="nav-label nav-label-spaced">{t("sidebar.system")}</p>}
        {settingsItems.length > 0 && (
          <>
            <button
              type="button"
              className={`nav-link nav-group-toggle w-full text-left bg-transparent border-0 cursor-pointer ${onSettingsPage ? "is-current" : ""}`}
              aria-expanded={settingsOpen}
              aria-controls="sidebar-hotel-settings"
              onClick={() => { revealSettings.current = !settingsOpen; setSettingsOpen(open => !open); }}
            >
              <Settings2 size={17} strokeWidth={onSettingsPage ? 2.3 : 1.8} />
              <span>{t("sidebar.hotelSettings")}</span>
              <ChevronDown size={15} className={`nav-group-chevron ${settingsOpen ? "is-open" : ""}`} aria-hidden="true" />
            </button>
            {settingsOpen && (
              <div id="sidebar-hotel-settings" className="nav-sublist" ref={settingsListRef}>
                {settingsItems.map(item => {
                  const Icon = item.icon;
                  const isActive = location.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href} className={`nav-link nav-sublink ${isActive ? "active" : ""}`} onClick={() => onClose()}>
                      <Icon size={16} strokeWidth={isActive ? 2.3 : 1.8} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
        {/* Exports returns when the system export page is built; TM.30 remains on Bookings. */}
        {can("platform.manage_users") && (
          <Link
            href="/settings/admin-users"
            className={`nav-link ${location === "/settings/admin-users" ? "active" : ""}`}
            onClick={() => onClose()}
          >
            <Settings2 size={17} strokeWidth={1.8} />
            <span>{t("sidebar.settings")}</span>
          </Link>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="support-note">
          <ShieldCheck size={16} />
          <div>
            <strong>{t("sidebar.supportMode")}</strong>
            <span>{t("sidebar.supportModeDesc")}</span>
          </div>
        </div>
        <div className="user-chip">
          <div className="user-avatar">{initials}</div>
          <div>
            <strong>{userName}</strong>
            <span>{userEmail ?? t("sidebar.supabaseUser")}</span>
          </div>
          <button
            className="icon-button"
            onClick={onLogout}
            title={t("sidebar.signOut")}
            aria-label={t("sidebar.signOut")}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
