import { TRPCError } from '@trpc/server';
import { hasAnyPermission, hasHotelPermission, type AppRole, type Permission, type PermissionMembership } from '@shared/authorization';

export function addIsoDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function getIdentityRoles(user: { role?: AppRole | null; roles?: readonly AppRole[] | null }) {
  return user.roles?.length ? user.roles : user.role ? [user.role] : [];
}

export function requirePermission(user: { role?: AppRole | null; roles?: readonly AppRole[] | null }, permission: Permission) {
  if (!hasAnyPermission(getIdentityRoles(user), permission)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `Missing permission: ${permission}` });
  }
}

/**
 * The financial report spans the caller's hotels, so it needs the owner's per-person
 * switch on at least one of them. Support keys and super_admin never open it.
 */
export function requireFinancialsAccess(user: { role?: AppRole | null; roles?: readonly AppRole[] | null; memberships?: readonly PermissionMembership[] | null }) {
  const roles = getIdentityRoles(user);
  const blocked = roles.includes('support') || roles.includes('super_admin');
  if (blocked || !user.memberships?.some(membership => membership.permissions?.includes('property.view_financials'))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Missing permission: property.view_financials' });
  }
}

export function requireHotelPermission(
  user: { id: string; role?: AppRole | null; roles?: readonly AppRole[] | null; memberships?: readonly PermissionMembership[] | null },
  hotelId: string,
  permission: Permission,
) {
  const roles = getIdentityRoles(user);
  if (!hasHotelPermission(roles, user.memberships ?? [], hotelId, permission)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `Missing permission for hotel: ${permission}` });
  }
}

export function assertSingleHotelAdmin(
  assignments: Array<{ id: string; hotel_id: string; role: AppRole }>,
  hotelId: string,
  membershipId?: string,
) {
  const hasOtherHotelAdmin = assignments.some(
    assignment => assignment.hotel_id === hotelId
      && assignment.role === 'hotel_owner'
      && assignment.id !== membershipId,
  );
  if (hasOtherHotelAdmin) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'This hotel already has one Hotel Admin. Reassign the existing Hotel Admin before assigning another.',
    });
  }
}

export function rethrowDomainError(error: unknown): never {
  if (error instanceof TRPCError) {
    throw error;
  }
  if (!(error instanceof Error)) {
    console.error(JSON.stringify({ errorType: typeof error, errorValue: error }, null, 2));
  }
  const message = error instanceof Error ? error.message : 'Unexpected database error';
  if (message.includes('prevent_rate_override_overlap') || (message.includes('overlapping') && message.includes('rate override'))) {
    throw new TRPCError({ code: 'CONFLICT', message: 'This room type already has a rate override overlapping the selected dates.' });
  }
  if (message.startsWith('23P01:')) {
    throw new TRPCError({ code: 'CONFLICT', message: 'The selected room already has an overlapping booking.' });
  }
  if (message.startsWith('42501:')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this hotel.' });
  }
  if (message.startsWith('P0002:')) {
    throw new TRPCError({ code: 'NOT_FOUND', message: message.replace(/^P0002:\s*/, '') });
  }
  if (message.startsWith('23505:')) {
    throw new TRPCError({ code: 'CONFLICT', message: 'A hotel or room type with the same unique details already exists.' });
  }
  if (message.startsWith('23514:') || message.startsWith('22P02:')) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'The submitted values are not valid for this record.' });
  }
  if (message.includes('TM.30') || message.startsWith('Booking ')) {
    throw new TRPCError({ code: 'BAD_REQUEST', message });
  }
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
}

