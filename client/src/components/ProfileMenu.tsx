import React from "react";
import { Link } from "wouter";
import { LogOut } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export type ProfileMenuProps = {
  /** `super_admin` or `admin`: sees every property. */
  isPlatformAdmin: boolean;
  /** Only `super_admin` may reach the Admin Users console; a read-only `admin` may not. */
  canManageUsers?: boolean;
  roleLabel?: string;
  userEmail: string | null;
  userName: string;
  propertyName?: string;
  propertyId?: string | null;
  initials: string;
  onLogout: () => void;
  onClose: () => void;
  onRestartTour?: () => void;
};

export function ProfileMenu({
  isPlatformAdmin,
  canManageUsers = false,
  roleLabel,
  userEmail,
  userName,
  propertyName,
  propertyId,
  initials,
  onLogout,
  onClose,
  onRestartTour = () => {},
}: ProfileMenuProps) {
  const { t } = useTranslation();
  const propertyLabel = isPlatformAdmin
    ? t("profileMenu.manageProperties")
    : propertyId ? t("profileMenu.manageProperty", { name: propertyName ?? t("profileMenu.myProperty") }) : t("profileMenu.setupHotel");

  return (
    <div
      className="profile-menu menu-surface menu-surface--profile"
      role="menu"
      aria-label={t("profileMenu.ariaLabel")}
    >
      <div className="menu-surface-header">
        <p className="menu-surface-kicker">{t("profileMenu.signedInAs")}</p>
        <p className="menu-surface-title truncate" title={userEmail ?? userName}>
          {userEmail ?? userName}
        </p>
        <p className="menu-surface-meta">
          {isPlatformAdmin ? `${roleLabel ?? t("profileMenu.superAdmin")} · ${t("profileMenu.globalAccess")}` : propertyId ? `${propertyName ?? t("profileMenu.propertyLabel")} · ${roleLabel ?? t("profileMenu.hotelAdmin")}` : roleLabel ?? t("profileMenu.hotelAdmin")}
        </p>
      </div>
      {canManageUsers && (
        <Link
          href="/settings/admin-users"
          className="menu-surface-item"
          role="menuitem"
          onClick={onClose}
        >
          {t("profileMenu.adminUsers")}
        </Link>
      )}
      <Link href="/settings/account" className="menu-surface-item" role="menuitem" onClick={onClose}>
        {t("profileMenu.account")}
      </Link>
      <Link
        href="/settings/security"
        className="menu-surface-item"
        role="menuitem"
        onClick={onClose}
        >
        {t("profileMenu.security")}
      </Link>
      <Link
        href={isPlatformAdmin ? "/hotels" : propertyId ? `/hotels/${propertyId}` : "/dashboard"}
        className="menu-surface-item"
        role="menuitem"
        onClick={onClose}
      >
        {propertyLabel}
      </Link>
      <button type="button" className="menu-surface-item" role="menuitem" onClick={() => { onClose(); onRestartTour(); }}>{t("guidedTour.restart")}</button>
      <Link href="/help/getting-started" className="menu-surface-item" role="menuitem" onClick={onClose}>{t("guidedTour.helpTitle")}</Link>
      <div className="menu-surface-divider" />
      <button
        onClick={() => {
          onClose();
          onLogout();
        }}
        className="menu-surface-item menu-surface-item--danger"
        role="menuitem"
      >
        <LogOut size={14} /> {t("profileMenu.signOut")}
      </button>
    </div>
  );
}

export default ProfileMenu;
