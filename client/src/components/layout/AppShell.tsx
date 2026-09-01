// Quiet Ledger reminder: global shell uses rail-and-canvas navigation, charcoal ink, warm paper, and pine signal color.
import { Link, useLocation } from "wouter";
import React, { useState } from "react";
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
import { hasAnyPermission, isPlatformRole, ROLE_LABELS, type AppRole, type Permission } from "@shared/authorization";
import { Sidebar } from "./Sidebar";
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

export function AppShell({ children, userName, userEmail, onLogout, roles }: { children: React.ReactNode; userName: string; userEmail: string | null; onLogout: () => void; roles: readonly AppRole[] }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const { selectedHotelId, selectedHotel } = useHotel();
  const can = (permission: Permission) => hasAnyPermission(roles, permission);
  const selectedHotelName = selectedHotel?.name;
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

      {open && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}

      <main className="main-canvas">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Open menu">
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
                  onClick={() => { setAddMenuOpen(prev => !prev); setUserMenuOpen(false); setWorkspaceMenuOpen(false); }}
                  aria-expanded={addMenuOpen}
                >
                  <Plus size={15} /> <span>Add new</span> <ChevronDown size={14} />
                </button>
                {addMenuOpen && (
                  <div className="menu-surface menu-surface--compact menu-surface--topbar" role="menu" aria-label="Add new menu">
                    <Link href="/hotels" className="menu-surface-item" onClick={() => setAddMenuOpen(false)}>
                      Add new hotel / property
                    </Link>
                    <Link href="/settings/admin-users" className="menu-surface-item" onClick={() => setAddMenuOpen(false)}>
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
                onClick={() => { setUserMenuOpen(prev => !prev); setAddMenuOpen(false); setWorkspaceMenuOpen(false); }}
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
                  onClose={() => setUserMenuOpen(false)}
                  onLogout={onLogout}
                />
              )}
            </div>
          </div>
        </header>
        <div className="page-wrap">{children}</div>
      </main>
    </div>
  );
}
