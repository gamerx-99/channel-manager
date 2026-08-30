import React from "react";
import { Link } from "wouter";
import { LogOut } from "lucide-react";

export type ProfileMenuProps = {
  /** `super_admin` or `admin`: sees every property. */
  isPlatformAdmin: boolean;
  /** Only `super_admin` may reach the Admin Users console; a read-only `admin` may not. */
  canManageUsers?: boolean;
  roleLabel?: string;
  userEmail: string | null;
  userName: string;
  propertyName?: string;
  initials: string;
  onLogout: () => void;
  onClose: () => void;
};

export function ProfileMenu({
  isPlatformAdmin,
  canManageUsers = false,
  roleLabel,
  userEmail,
  userName,
  propertyName,
  initials,
  onLogout,
  onClose,
}: ProfileMenuProps) {
  const propertyLabel = isPlatformAdmin
    ? "Manage Properties"
    : `Manage ${propertyName ? `${propertyName} property` : "My Property"}`;

  return (
    <div
      className="profile-menu menu-surface menu-surface--profile"
      role="menu"
      aria-label="เมนูบัญชีผู้ใช้"
    >
      <div className="menu-surface-header">
        <p className="menu-surface-kicker">Signed in as</p>
        <p className="menu-surface-title truncate" title={userEmail ?? userName}>
          {userEmail ?? userName}
        </p>
        <p className="menu-surface-meta">
          {isPlatformAdmin ? `${roleLabel ?? "Super Admin"} · Global access` : `${propertyName ?? "My property"} · ${roleLabel ?? "Hotel Admin"}`}
        </p>
      </div>
      {canManageUsers && (
        <Link
          href="/settings/admin-users"
          className="menu-surface-item"
          role="menuitem"
          onClick={onClose}
        >
          Admin Users &amp; Access
        </Link>
      )}
      <Link
        href="/settings/security"
        className="menu-surface-item"
        role="menuitem"
        onClick={onClose}
      >
        Security &amp; MFA
      </Link>
      <Link
        href={isPlatformAdmin ? "/hotels" : "/dashboard"}
        className="menu-surface-item"
        role="menuitem"
        onClick={onClose}
      >
        {propertyLabel}
      </Link>
      <div className="menu-surface-divider" />
      <button
        onClick={() => {
          onClose();
          onLogout();
        }}
        className="menu-surface-item menu-surface-item--danger"
        role="menuitem"
      >
        <LogOut size={14} /> Sign out
      </button>
    </div>
  );
}

export default ProfileMenu;
