import type { SupabaseClient } from '@supabase/supabase-js';
import type { HumanRole } from '@shared/authorization';
import { throwOnError } from './utils';
import type {
  HotelOptionRecord,
  HotelUserAssignmentRecord,
  CreateHotelUserInput,
  HotelAdminAuditLogRecord,
  HotelStaffRecord,
} from './types';

/** Lists hotel choices for a super-admin assignment form under the caller JWT. */
export async function listHotelOptions(client: SupabaseClient) {
  const { data, error } = await client
    .from('hotels')
    .select('id,name')
    .order('name', { ascending: true });
  throwOnError(error);
  return (data ?? []) as HotelOptionRecord[];
}

/** Lists memberships with hotel names; RLS limits this to records visible to the caller. */
export async function listHotelUserAssignments(client: SupabaseClient) {
  const { data, error } = await client
    .from('hotel_users')
    .select('id,hotel_id,user_id,role,created_at,hotels(name)')
    .order('created_at', { ascending: false });
  throwOnError(error);
  return (data ?? []).map(row => ({
    ...row,
    hotels: Array.isArray(row.hotels) ? row.hotels[0] ?? null : row.hotels,
  })) as unknown as HotelUserAssignmentRecord[];
}

/** Creates a membership through the authenticated caller's RLS client. */
export async function createHotelUserAssignment(client: SupabaseClient, input: CreateHotelUserInput) {
  const { data, error } = await client
    .from('hotel_users')
    .insert(input)
    .select('id,hotel_id,user_id,role,created_at,hotels(name)')
    .single();
  throwOnError(error);
  if (!data) throw new Error('Hotel membership insert did not return a record.');
  return {
    ...data,
    hotels: Array.isArray(data.hotels) ? data.hotels[0] ?? null : data.hotels,
  } as unknown as HotelUserAssignmentRecord;
}

/** Transfers Hotel Admin ownership through the Postgres transaction function. */
export async function transferHotelAdmin(
  client: SupabaseClient,
  input: { hotel_id: string; target_membership_id: string },
) {
  const { data, error } = await client
    .rpc('transfer_hotel_admin', {
      target_hotel_id: input.hotel_id,
      target_membership_id: input.target_membership_id,
    })
    .maybeSingle();
  throwOnError(error);
  if (!data) return null;
  const membership = data as unknown as HotelUserAssignmentRecord;
  return { ...membership, hotels: membership.hotels ?? null };
}

/** Lists property-scoped Hotel Admin audit events; RLS remains the source of truth. */
export async function listHotelAdminAuditLogs(client: SupabaseClient, hotelId: string, limit = 50) {
  const { data, error } = await client
    .from('hotel_admin_audit_logs')
    .select('id,hotel_id,actor_user_id,actor_email,action,previous_admin_membership_id,previous_admin_user_id,new_admin_membership_id,new_admin_user_id,details,created_at')
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  throwOnError(error);
  return (data ?? []) as unknown as HotelAdminAuditLogRecord[];
}

/** Removes a membership through the authenticated caller's RLS client. */
export async function deleteHotelUserAssignment(client: SupabaseClient, membershipId: string) {
  const { data, error } = await client
    .from('hotel_users')
    .delete()
    .eq('id', membershipId)
    .select('id')
    .maybeSingle();
  throwOnError(error);
  return data?.id ? { id: data.id as string } : null;
}

/** Returns only memberships for one hotel; the caller's RLS client remains the source of truth. */
export async function listHotelStaff(client: SupabaseClient, hotelId: string, authUsers: Array<{
  id: string;
  email: string | null;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
}>) {
  const assignments = await listHotelUserAssignments(client);
  const usersById = new Map(authUsers.map(user => [user.id, user]));
  return assignments
    .filter(assignment => assignment.hotel_id === hotelId)
    .map(assignment => ({
      ...assignment,
      email: usersById.get(assignment.user_id)?.email ?? null,
      confirmed_at: usersById.get(assignment.user_id)?.confirmed_at ?? null,
      last_sign_in_at: usersById.get(assignment.user_id)?.last_sign_in_at ?? null,
    })) as HotelStaffRecord[];
}

/** Updates one property membership through the authenticated caller's RLS client. */
export async function updateHotelUserAssignmentRole(
  client: SupabaseClient,
  input: { membership_id: string; hotel_id: string; role: HumanRole },
) {
  const { data, error } = await client
    .from('hotel_users')
    .update({ role: input.role })
    .eq('id', input.membership_id)
    .eq('hotel_id', input.hotel_id)
    .select('id,hotel_id,user_id,role,created_at,hotels(name)')
    .maybeSingle();
  throwOnError(error);
  if (!data) return null;
  return {
    ...data,
    hotels: Array.isArray(data.hotels) ? data.hotels[0] ?? null : data.hotels,
  } as unknown as HotelUserAssignmentRecord;
}
