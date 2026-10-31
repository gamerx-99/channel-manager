import { TRPCError } from "@trpc/server";
import { type AppRole, type Permission, isAppRole } from "@shared/authorization";
import { checkPermissionEdit, resolveMembershipPermissions } from "@shared/permissions";

type Actor = { userId: string; role: AppRole; permissions: readonly Permission[] };
type Target = { userId: string; role: string; permissionGrants: readonly string[]; permissionRevokes: readonly string[] };

/** Role templates are permission changes too; resetting overrides cannot bypass toggles. */
export function assertStaffPermissionChange(actor: Actor, targetUserId: string, nextRole: AppRole, target?: Target, nextPermissions?: readonly Permission[]) {
  const denied = () => { throw new TRPCError({ code: "FORBIDDEN", message: "This staff permission change is not allowed." }); };
  if (!target && actor.permissions.includes("property.transfer_ownership")) return;
  if (nextRole === "hotel_owner" && !actor.permissions.includes("property.transfer_ownership")) denied();
  const currentRole = target?.role ?? nextRole;
  if (!isAppRole(currentRole)) return denied();
  const result = checkPermissionEdit({
    actorId: actor.userId, actorRole: actor.role, actorPermissions: actor.permissions,
    targetId: targetUserId, targetRole: currentRole,
    targetPermissions: target ? resolveMembershipPermissions(currentRole, { grants: target.permissionGrants, revokes: target.permissionRevokes }) : [],
    nextPermissions: nextPermissions ?? resolveMembershipPermissions(nextRole),
  });
  if (!result.ok) denied();
}
