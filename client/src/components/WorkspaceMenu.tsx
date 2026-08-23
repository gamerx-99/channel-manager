import React from "react";
import { ChevronDown, Hotel } from "lucide-react";
import { Link } from "wouter";

type VisibleHotel = {
  id: string;
  name: string;
  slug: string;
};

type WorkspaceMenuProps = {
  hotels?: VisibleHotel[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  isSuperAdmin?: boolean;
  activeHotelName?: string;
};

export function WorkspaceMenu({
  hotels,
  open,
  onToggle,
  onClose,
  isSuperAdmin = false,
  activeHotelName,
}: WorkspaceMenuProps) {
  const workspaceName = isSuperAdmin ? "Support console" : activeHotelName ?? hotels?.[0]?.name ?? "Hotel workspace";
  const workspaceLabel = isSuperAdmin ? "Workspace" : "Property workspace";
  const overviewLabel = isSuperAdmin ? "All properties overview" : "Property overview";
  const visibleHotels = isSuperAdmin ? hotels : hotels?.slice(0, 1);

  return (
    <div className="workspace-menu-anchor">
      <button
        className="workspace-switcher interactive"
        onClick={onToggle}
        title={isSuperAdmin ? "Current active workspace" : `Current property: ${workspaceName}`}
        aria-label={isSuperAdmin ? "เลือก workspace และโรงแรม" : `เลือกโรงแรม ${workspaceName}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="workspace-menu"
        type="button"
      >
        <div className="workspace-avatar" aria-hidden="true">{isSuperAdmin ? "S" : workspaceName.slice(0, 1).toUpperCase()}</div>
        <div>
          <small>{workspaceLabel}</small>
          <strong>{workspaceName}</strong>
        </div>
        <span className="muted-icon" aria-hidden="true">
          <ChevronDown size={15} />
        </span>
      </button>
      {open && (
        <div id="workspace-menu" className="workspace-dropdown menu-surface menu-surface--workspace" role="menu" aria-label="Workspace options">
          <div className="workspace-dropdown-header menu-surface-header">
            <p className="workspace-dropdown-label">Active workspace</p>
            <p className="workspace-dropdown-name">{workspaceName}</p>
          </div>
          <Link href="/dashboard" className="workspace-dropdown-item menu-surface-item" role="menuitem" onClick={onClose}>
            {overviewLabel}
          </Link>
          <div className="workspace-dropdown-section-label menu-surface-kicker">{isSuperAdmin ? "Visible hotel workspaces" : "Assigned property"}</div>
          {visibleHotels?.length ? visibleHotels.map(hotel => (
            <Link
              key={hotel.id}
              href={`/hotels/${hotel.id}`}
              className="workspace-dropdown-item workspace-dropdown-hotel"
              role="menuitem"
              onClick={onClose}
            >
              <Hotel size={14} aria-hidden="true" />
              <span>
                <strong>{hotel.name}</strong>
                <small>/{hotel.slug}</small>
              </span>
            </Link>
          )) : (
            <div className="workspace-dropdown-empty menu-surface-empty">Loading assigned properties…</div>
          )}
        </div>
      )}
    </div>
  );
}
