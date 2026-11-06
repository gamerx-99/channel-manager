import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import type { AppRole, Permission } from "@shared/authorization";
import { PERMISSION_TOGGLES, applyToggle, checkPermissionEdit, getToggleStates } from "@shared/permissions";
import { useTranslation, type TranslationKey } from "@/lib/i18n";

const labelKeys: Record<(typeof PERMISSION_TOGGLES)[number]["key"], TranslationKey> = {
  bookings_view: "hotelStaff.permBookingsView", bookings_manage: "hotelStaff.permBookingsManage", bookings_cancel: "hotelStaff.permBookingsCancel",
  tm30: "hotelStaff.permTm30", housekeeping_view: "hotelStaff.permHousekeepingView", housekeeping_update: "hotelStaff.permHousekeepingUpdate",
  staff_shifts_view: "hotelStaff.permStaffShiftsView", staff_shifts_manage: "hotelStaff.permStaffShiftsManage",
  staff_tasks_manage: "hotelStaff.permStaffTasksManage", staff_tasks_view: "hotelStaff.permStaffTasksView",
  rates: "hotelStaff.permRates", ota_view: "hotelStaff.permOtaView", ota_manage: "hotelStaff.permOtaManage",
  property_setup: "hotelStaff.permPropertySetup", reports: "hotelStaff.permReports", financials: "hotelStaff.permFinancials", staff: "hotelStaff.permStaff",
};

export function StaffPermissionToggles({ hotelId, target, targetLabel, actor, onSaved }: {
  hotelId: string;
  target: { userId: string; role: AppRole; permissions: readonly Permission[] };
  /** What the owner recognises the person by (their email); falls back to the account id. */
  targetLabel?: string | null;
  actor: { userId: string; role: AppRole; permissions: readonly Permission[] };
  onSaved: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const mutation = trpc.access.updateStaffPermissions.useMutation({ onSuccess: async () => { await onSaved(); setError(null); }, onError: e => setError(e.message) });
  const states = getToggleStates(target.permissions);
  return <details><summary>{t("hotelStaff.permissionsSummary")}</summary>
    {error && <p role="alert">{error}</p>}
    <fieldset disabled={mutation.isPending}><legend>{t("hotelStaff.permissionsFor", { name: targetLabel ?? target.userId })}</legend>
      {PERMISSION_TOGGLES.map(toggle => {
        const nextPermissions = applyToggle(target.permissions, toggle.key, !states[toggle.key]);
        const permitted = checkPermissionEdit({ actorId: actor.userId, actorRole: actor.role, actorPermissions: actor.permissions, targetId: target.userId, targetRole: target.role, targetPermissions: target.permissions, nextPermissions }).ok;
        return <label key={toggle.key} className="block"><input type="checkbox" checked={states[toggle.key]} disabled={!permitted} onChange={() => mutation.mutate({ hotelId, targetUserId: target.userId, permissions: nextPermissions })} /> {t(labelKeys[toggle.key])}</label>;
      })}
    </fieldset>
  </details>;
}
