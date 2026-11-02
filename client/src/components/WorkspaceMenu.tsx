import React from "react";
import { ChevronDown, Hotel } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "@/lib/i18n";

type VisibleHotel = {
  id: string;
  name: string;
  slug: string;
  [key: string]: any;
};

type WorkspaceMenuProps = {
  hotels?: VisibleHotel[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  isPlatformAdmin?: boolean;
  activeHotelName?: string;
  onSelectHotel?: (hotel: VisibleHotel) => void;
  onSelectHotelId?: (hotelId: string) => void;
};

export function WorkspaceMenu({
  hotels,
  open,
  onToggle,
  onClose,
  isPlatformAdmin = false,
  activeHotelName,
  onSelectHotel,
  onSelectHotelId,
}: WorkspaceMenuProps) {
  const { t } = useTranslation();
  const workspaceName = isPlatformAdmin ? t("workspaceMenu.supportConsole") : activeHotelName ?? hotels?.[0]?.name ?? t("workspaceMenu.hotelWorkspace");
  const workspaceLabel = isPlatformAdmin ? t("workspaceMenu.workspace") : t("workspaceMenu.propertyWorkspace");
  const overviewLabel = isPlatformAdmin ? t("workspaceMenu.allPropertiesOverview") : t("workspaceMenu.propertyOverview");
  const visibleHotels = isPlatformAdmin ? hotels : hotels?.slice(0, 1);

  return (
    <div className="workspace-menu-anchor">
      <button
        className="workspace-switcher interactive"
        onClick={onToggle}
        title={isPlatformAdmin ? t("workspaceMenu.currentActiveWorkspace") : t("workspaceMenu.currentProperty", { name: workspaceName })}
        aria-label={isPlatformAdmin ? "เลือก workspace และโรงแรม" : `เลือกโรงแรม ${workspaceName}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="workspace-menu"
        type="button"
      >
        <div className="workspace-avatar" aria-hidden="true">{isPlatformAdmin ? "S" : workspaceName.slice(0, 1).toUpperCase()}</div>
        <div>
          <small>{workspaceLabel}</small>
          <strong>{workspaceName}</strong>
        </div>
        <span className="muted-icon" aria-hidden="true">
          <ChevronDown size={15} />
        </span>
      </button>
      {open && (
        <div id="workspace-menu" className="workspace-dropdown menu-surface menu-surface--workspace" role="menu" aria-label={t("workspaceMenu.workspaceOptions")}>
          <div className="workspace-dropdown-header menu-surface-header">
            <p className="workspace-dropdown-label">{t("workspaceMenu.activeWorkspace")}</p>
            <p className="workspace-dropdown-name">{workspaceName}</p>
          </div>
          <Link href="/dashboard" className="workspace-dropdown-item menu-surface-item" role="menuitem" onClick={onClose}>
            {overviewLabel}
          </Link>
          <div className="workspace-dropdown-section-label menu-surface-kicker">{isPlatformAdmin ? t("workspaceMenu.visibleHotelWorkspaces") : t("workspaceMenu.assignedProperty")}</div>
          {visibleHotels?.length ? visibleHotels.map(hotel => (
            <Link
              key={hotel.id}
              href={`/hotels/${hotel.id}`}
              className="workspace-dropdown-item workspace-dropdown-hotel"
              role="menuitem"
              onClick={() => {
                if (onSelectHotel) {
                  onSelectHotel(hotel);
                } else if (onSelectHotelId) {
                  onSelectHotelId(hotel.id);
                } else {
                  localStorage.setItem("selected-hotel-id", hotel.id);
                }
                onClose();
              }}
            >
              <Hotel size={14} aria-hidden="true" />
              <span>
                <strong>{hotel.name}</strong>
                <small>/{hotel.slug}</small>
              </span>
            </Link>
          )) : (
            <div className="workspace-dropdown-empty menu-surface-empty">{hotels === undefined ? t("workspaceMenu.loadingAssignedProperties") : t("workspaceMenu.emptyHotels")}</div>
          )}
        </div>
      )}
    </div>
  );
}
