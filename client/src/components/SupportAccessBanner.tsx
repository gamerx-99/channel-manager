import React from "react";
import { useHotel } from "@/contexts/HotelContext";
import type { PermissionMembership } from "@shared/authorization";

export function SupportAccessBanner({ memberships }: { memberships: readonly (PermissionMembership & { expiresAt?: Date | string; mode?: "view" | "edit" })[] }) {
  const { selectedHotelId } = useHotel();
  const membership = memberships.find(m => m.hotelId === selectedHotelId && m.role === "support");
  if (!membership?.expiresAt) return null;
  const active = new Date(membership.expiresAt).getTime() > Date.now();
  return <div className="page-alert" role="status" aria-live="polite">
    {active ? `Support access · ${membership.mode === "edit" ? "Edit" : "View only"} · expires ${new Date(membership.expiresAt).toLocaleString()}` : "Support access expired. Ask the owner to approve a new key."}
  </div>;
}
