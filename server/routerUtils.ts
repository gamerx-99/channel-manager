import { TRPCError } from '@trpc/server';
import { hasAnyPermission, isPlatformRole, roleHasPermission, type AppRole, type Permission } from '@shared/authorization';
import { createRlsSupabaseClient } from './supabase';
import { isSuperAdmin, getManagedHotel } from './db';

export function addIsoDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function rlsClient(accessToken?: string) {
  return createRlsSupabaseClient(accessToken);
}

export function getIdentityRoles(user: { role?: AppRole | null; roles?: readonly AppRole[] | null }) {
  return user.roles?.length ? user.roles : user.role ? [user.role] : [];
}

export function requirePermission(user: { role?: AppRole | null; roles?: readonly AppRole[] | null }, permission: Permission) {
  if (!hasAnyPermission(getIdentityRoles(user), permission)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `Missing permission: ${permission}` });
  }
}

export function requireHotelPermission(
  user: { id: string; role?: AppRole | null; roles?: readonly AppRole[] | null; memberships?: readonly { hotelId: string; role: AppRole }[] | null },
  hotelId: string,
  permission: Permission,
) {
  const roles = getIdentityRoles(user);
  const memberships = user.memberships ?? [];
  // Platform roles are not property memberships, so they bypass the membership check.
  // `super_admin` bypasses unconditionally; `admin` only for capabilities the matrix
  // actually grants it, which is what keeps its cross-hotel access read-only.
  const allowed = roles.includes('super_admin')
    || roles.some(role => isPlatformRole(role) && roleHasPermission(role, permission))
    || memberships.some(
      membership => membership.hotelId === hotelId && roleHasPermission(membership.role, permission),
    );
  if (!allowed) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `Missing permission for hotel: ${permission}` });
  }
}

export async function requireSuperAdmin(accessToken: string) {
  const client = rlsClient(accessToken);
  if (!(await isSuperAdmin(client))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only super administrators can manage users.' });
  }
  return client;
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

export async function assertHotelExists(client: ReturnType<typeof rlsClient>, hotelId: string) {
  const hotel = await getManagedHotel(client, hotelId);
  if (!hotel) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel is not available to your account.' });
  }
  return hotel;
}

export async function assertHotelAndRoomTypeExist(client: ReturnType<typeof rlsClient>, hotelId: string, roomTypeId: string) {
  const hotel = await getManagedHotel(client, hotelId);
  if (!hotel || !hotel.room_types.some(rt => rt.id === roomTypeId)) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'This room type is not available to your account.' });
  }
  return hotel;
}
