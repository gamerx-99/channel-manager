import { Link, useLocation } from "wouter";
import {
  BarChart3,
  BedDouble,
  Bell,
  CalendarDays,
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
import { BrandMark } from "./BrandMark";
import { useTranslation } from "@/lib/i18n";

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

function getActivePath(location: string, selectedHotelId?: string | null) {
  if (!selectedHotelId) return location;
  const hotelSubPaths = ["bookings", "calendar", "ota", "staff"];
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
      ...(can("ota.view_status") ? [{ href: `/hotels/${selectedHotelId}/ota`, label: t("sidebar.otaSync"), icon: Globe }] : []),
      ...(can("property.manage_staff") ? [{ href: `/hotels/${selectedHotelId}/staff`, label: t("sidebar.hotelStaff"), icon: ShieldCheck }] : []),
    ]
    : [];
  const navItems = [
    { href: "/dashboard", label: isPlatformAdmin ? t("sidebar.overview") : t("sidebar.overview"), icon: LayoutDashboard },
    ...(can("property.view_reports") ? [{ href: "/dashboard/channels", label: t("sidebar.channelAnalytics"), icon: BarChart3 }] : []),
    ...(can("platform.view_all_hotels") ? [{ href: "/hotels", label: t("sidebar.hotelsManagement"), icon: Hotel }] : []),
    ...(can("platform.manage_users") ? [{ href: "/settings/admin-users", label: t("sidebar.adminUsers"), icon: ShieldCheck }] : []),
    ...hotelNavItems,
  ];
  const activePath = getActivePath(location, selectedHotelId);

  return (
    <aside className={`sidebar ${open ? "is-open" : ""}`}>
      <div className="sidebar-head">
        <Link href="/dashboard" className="brand-lockup" onClick={() => onClose()}>
          <BrandMark />
          <span>
            <strong>channel</strong>
            <em>manager</em>
          </span>
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

      <nav className="nav-list" aria-label="Main navigation">
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
        {can("operations.view_bookings") && (
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
          href="/website-builder"
          className={`nav-link ${location === "/website-builder" ? "active" : ""}`}
          onClick={() => onClose()}
        >
          <Globe size={17} strokeWidth={location === "/website-builder" ? 2.3 : 1.8} />
          <span>{t("sidebar.websiteBuilder")}</span>
        </Link>
        <button
          type="button"
          className="nav-link w-full text-left bg-transparent border-0 cursor-pointer"
          onClick={() => {
            const hotel = visibleHotels?.find(h => h.id === selectedHotelId) || visibleHotels?.[0];
            if (hotel?.slug) {
              window.open(`/${hotel.slug}#book`, '_blank');
            } else {
              toast.info(t("sidebar.bookingEnginesSelectPrompt"));
            }
          }}
        >
          <CalendarDays size={17} strokeWidth={1.8} />
          <span>{t("sidebar.bookingEngines")}</span>
        </button>
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
        <p className="nav-label nav-label-spaced">{t("sidebar.system")}</p>
        {can("operations.export_tm30") && <a className="nav-link" href="#" onClick={(event) => { event.preventDefault(); toast.info(t("sidebar.exportsPrompt")); }}>
          <FileSpreadsheet size={17} strokeWidth={1.8} />
          <span>{t("sidebar.exports")}</span>
        </a>}
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
