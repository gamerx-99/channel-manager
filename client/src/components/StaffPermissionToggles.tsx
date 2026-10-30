import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import type { AppRole, Permission } from "@shared/authorization";
import { PERMISSION_TOGGLES, applyToggle, checkPermissionEdit, getToggleStates } from "@shared/permissions";

const labels = {
  bookings_view: "View bookings", bookings_manage: "Manage bookings and guests", bookings_cancel: "Cancel bookings",
  tm30: "Export TM30", housekeeping_view: "View housekeeping", housekeeping_update: "Update housekeeping",
  rates: "Rates and availability", ota_view: "View OTA status", ota_manage: "Manage OTA connections",
  property_setup: "Property setup", reports: "Reports", financials: "Financials", staff: "Manage staff",
};

export function StaffPermissionToggles({ hotelId, target, actor, onSaved }: {
  hotelId: string;
  target: { userId: string; role: AppRole; permissions: readonly Permission[] };
  actor: { userId: string; role: AppRole; permissions: readonly Permission[] };
  onSaved: () => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const mutation = trpc.access.updateStaffPermissions.useMutation({ onSuccess: async () => { await onSaved(); setError(null); }, onError: e => setError(e.message) });
  const states = getToggleStates(target.permissions);
  return <details><summary>Permissions</summary>
    {error && <p role="alert">{error}</p>}
    <fieldset disabled={mutation.isPending}><legend>Permissions for {target.userId}</legend>
      {PERMISSION_TOGGLES.map(toggle => {
        const nextPermissions = applyToggle(target.permissions, toggle.key, !states[toggle.key]);
        const permitted = checkPermissionEdit({ actorId: actor.userId, actorRole: actor.role, actorPermissions: actor.permissions, targetId: target.userId, targetRole: target.role, targetPermissions: target.permissions, nextPermissions }).ok;
        return <label key={toggle.key} className="block"><input type="checkbox" checked={states[toggle.key]} disabled={!permitted} onChange={() => mutation.mutate({ hotelId, targetUserId: target.userId, permissions: nextPermissions })} /> {labels[toggle.key]}</label>;
      })}
    </fieldset>
  </details>;
}
