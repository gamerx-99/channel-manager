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

const BREADCRUMB_EXACT_LABELS: Record<string, string> = {
  "/dashboard": "Overview",
};

const BREADCRUMB_PREFIX_LABELS: Array<[string, string]> = [
  ["/dashboard/channels", "Channel analytics"],
  ["/dashboard/pricing", "Advanced Pricing"],
  ["/dashboard/financials", "Financials"],
  ["/housekeeping", "Housekeeping"],
  ["/communications", "Communications"],
];

const BREADCRUMB_INCLUDES_LABELS: Array<[string, string]> = [
  ["admin-users", "Admin users"],
  ["staff", "Hotel staff"],
  ["bookings", "Bookings"],
  ["calendar", "Availability"],
  ["ota", "OTA Sync"],
];

function getBreadcrumbLabel(location: string): string {
  if (BREADCRUMB_EXACT_LABELS[location]) return BREADCRUMB_EXACT_LABELS[location];
  for (const [prefix, label] of BREADCRUMB_PREFIX_LABELS) {
    if (location.startsWith(prefix)) return label;
  }
  for (const [substring, label] of BREADCRUMB_INCLUDES_LABELS) {
    if (location.includes(substring)) return label;
  }
  return "Hotels";
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
  const { selectedHotelId, selectedHotel } = useHotel();
  const selectedHotelName = selectedHotel?.name;

  return (
    <header className="topbar">
      <button className="icon-button menu-button" onClick={onOpenMenu} aria-label="Open menu">
        <Menu size={19} />
      </button>
      <Link href="/dashboard" className="topbar-brand">
        <BrandMark />
        <span>channel <em>manager</em></span>
      </Link>
      <div className="topbar-rule" />
      <div className="breadcrumbs">
        <span>Operating ledger</span>
        <span className="crumb-slash">/</span>
        <span className="current-crumb">{getBreadcrumbLabel(location)}</span>
      </div>
      <div className="topbar-actions">
        <label className="topbar-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search system</span>
          <input placeholder="Search system..." aria-label="Search system" />
        </label>
        {isSuperAdmin && (
          <div className="dropdown-anchor">
            <button
              className="button button-primary topbar-add"
              onClick={onToggleAddMenu}
              aria-expanded={addMenuOpen}
            >
              <Plus size={15} /> <span>Add new</span> <ChevronDown size={14} />
            </button>
            {addMenuOpen && (
              <div className="menu-surface menu-surface--compact menu-surface--topbar" role="menu" aria-label="Add new menu">
                <Link href="/hotels" className="menu-surface-item" onClick={onCloseAddMenu}>
                  Add new hotel / property
                </Link>
                <Link href="/settings/admin-users" className="menu-surface-item" onClick={onCloseAddMenu}>
                  Invite team member
                </Link>
              </div>
            )}
          </div>
        )}
        {isSuperAdmin && <NotificationBell hotelId={selectedHotelId} />}
        <LanguageSwitcher />
        <span className="sync-status"><i /> Synced 2 min ago</span>
        <div className="topbar-divider" />
        <div className="dropdown-anchor">
          <button
            className="user-mini"
            onClick={onToggleUserMenu}
            aria-expanded={userMenuOpen}
            aria-label="Account menu"
          >
            <span className="user-avatar small">{initials}</span>
            <ChevronDown size={14} />
          </button>
          {userMenuOpen && (
            <ProfileMenu
              isPlatformAdmin={isPlatformAdmin}
              canManageUsers={can("platform.manage_users")}
              roleLabel={roles[0] ? ROLE_LABELS[roles[0]] : "Authorized user"}
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
