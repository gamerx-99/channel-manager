import { Link, useLocation } from "wouter";
import React from "react";
import {
  ChevronDown,
  Menu,
  Plus,
  Search,
} from "lucide-react";
import ProfileMenu from "../ProfileMenu";
import NotificationBell from "../NotificationBell";
import LanguageSwitcher from "../LanguageSwitcher";
import { useHotel } from "../../contexts/HotelContext";
import { ROLE_LABELS, type AppRole, type Permission } from "@shared/authorization";
import { BrandMark } from "./BrandMark";
import { useTranslation, type TranslationKey } from "@/lib/i18n";

const BREADCRUMB_EXACT_KEYS: Record<string, TranslationKey> = {
  "/dashboard": "breadcrumb.overview",
};

const BREADCRUMB_PREFIX_KEYS: Array<[string, TranslationKey]> = [
  ["/dashboard/channels", "breadcrumb.channelAnalytics"],
  ["/dashboard/pricing", "breadcrumb.advancedPricing"],
  ["/dashboard/financials", "breadcrumb.financials"],
  ["/housekeeping", "breadcrumb.housekeeping"],
  ["/communications", "breadcrumb.communications"],
];

const BREADCRUMB_INCLUDES_KEYS: Array<[string, TranslationKey]> = [
  ["admin-users", "breadcrumb.adminUsers"],
  ["staff", "breadcrumb.hotelStaff"],
  ["bookings", "breadcrumb.bookings"],
  ["calendar", "breadcrumb.availability"],
  ["ota", "breadcrumb.otaSync"],
];

function getBreadcrumbKey(location: string): TranslationKey {
  if (BREADCRUMB_EXACT_KEYS[location]) return BREADCRUMB_EXACT_KEYS[location];
  for (const [prefix, key] of BREADCRUMB_PREFIX_KEYS) {
    if (location.startsWith(prefix)) return key;
  }
  for (const [substring, key] of BREADCRUMB_INCLUDES_KEYS) {
    if (location.includes(substring)) return key;
  }
  return "breadcrumb.hotels";
}

type TopbarProps = {
  onOpenMenu: () => void;
  can: (permission: Permission) => boolean;
  isSuperAdmin: boolean;
  isPlatformAdmin: boolean;
  userName: string;
  userEmail: string | null;
  initials: string;
  onLogout: () => void;
  roles: readonly AppRole[];
  addMenuOpen: boolean;
  onToggleAddMenu: () => void;
  onCloseAddMenu: () => void;
  userMenuOpen: boolean;
  onToggleUserMenu: () => void;
  onCloseUserMenu: () => void;
};

export function Topbar({
  onOpenMenu,
  can,
  isSuperAdmin,
  isPlatformAdmin,
  userName,
  userEmail,
  initials,
  onLogout,
  roles,
  addMenuOpen,
  onToggleAddMenu,
  onCloseAddMenu,
  userMenuOpen,
  onToggleUserMenu,
  onCloseUserMenu,
}: TopbarProps) {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { selectedHotelId, selectedHotel } = useHotel();
  const selectedHotelName = selectedHotel?.name;

  return (
    <header className="topbar">
      <button className="icon-button menu-button" onClick={onOpenMenu} aria-label={t("topbar.openMenu")}>
        <Menu size={19} />
      </button>
      <Link href="/dashboard" className="topbar-brand">
        <BrandMark />
        <span>hay<em>host</em></span>
      </Link>
      <div className="topbar-rule" />
      <div className="breadcrumbs">
        <span>{t("topbar.operatingLedger")}</span>
        <span className="crumb-slash">/</span>
        <span className="current-crumb">{t(getBreadcrumbKey(location))}</span>
      </div>
      <div className="topbar-actions">
        <label className="topbar-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">{t("topbar.searchSystemSr")}</span>
          <input placeholder={t("topbar.searchSystem")} aria-label={t("topbar.searchSystemSr")} />
        </label>
        {isSuperAdmin && (
          <div className="dropdown-anchor">
            <button
              className="button button-primary topbar-add"
              onClick={onToggleAddMenu}
              aria-expanded={addMenuOpen}
            >
              <Plus size={15} /> <span>{t("topbar.addNew")}</span> <ChevronDown size={14} />
            </button>
            {addMenuOpen && (
              <div className="menu-surface menu-surface--compact menu-surface--topbar" role="menu" aria-label="Add new menu">
                <Link href="/hotels" className="menu-surface-item" onClick={onCloseAddMenu}>
                  {t("topbar.addNewHotel")}
                </Link>
                <Link href="/settings/admin-users" className="menu-surface-item" onClick={onCloseAddMenu}>
                  {t("topbar.inviteTeamMember")}
                </Link>
              </div>
            )}
          </div>
        )}
        {isSuperAdmin && <NotificationBell hotelId={selectedHotelId} />}
        <LanguageSwitcher />
        <div className="topbar-divider" />
        <div className="dropdown-anchor">
          <button
            className="user-mini"
            onClick={onToggleUserMenu}
            aria-expanded={userMenuOpen}
            aria-label={t("topbar.accountMenu")}
          >
            <span className="user-avatar small">{initials}</span>
            <ChevronDown size={14} />
          </button>
          {userMenuOpen && (
            <ProfileMenu
              isPlatformAdmin={isPlatformAdmin}
              canManageUsers={can("platform.manage_users")}
              roleLabel={roles[0] ? ROLE_LABELS[roles[0]] : t("topbar.authorizedUser")}
              userEmail={userEmail}
              userName={userName}
              propertyName={selectedHotelName}
              initials={initials}
              onClose={onCloseUserMenu}
              onLogout={onLogout}
            />
          )}
        </div>
      </div>
    </header>
  );
}
