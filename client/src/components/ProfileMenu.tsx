import React from "react";
import { Link } from "wouter";
import { LogOut } from "lucide-react";

export type ProfileMenuProps = {
  isSuperAdmin: boolean;
  roleLabel?: string;
  userEmail: string | null;
  userName: string;
  propertyName?: string;
  initials: string;
  onLogout: () => void;
  onClose: () => void;
};

export function ProfileMenu({
  isSuperAdmin,
  roleLabel,
  userEmail,
  userName,
  propertyName,
  initials,
  onLogout,
  onClose,
}: ProfileMenuProps) {
  const propertyLabel = isSuperAdmin
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
          {isSuperAdmin ? "Super Admin · Global access" : `${propertyName ?? "My property"} · ${roleLabel ?? "Hotel Admin"}`}
        </p>
      </div>
      {isSuperAdmin && (
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
        href={isSuperAdmin ? "/hotels" : "/dashboard"}
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
