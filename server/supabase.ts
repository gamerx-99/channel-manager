import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';
import { APP_ROLES, getHighestRole, isAppRole, isHumanRole, type AppRole, type HumanRole } from '@shared/authorization';

// The configured VITE values are the approved publishable browser credentials.
// Keep the same URL/key pair on the server so request-scoped clients remain
// RLS-constrained and never fall back to a service role credential.
const supabaseUrl =
  process.env.CHANNEL_MANAGER_SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.CHANNEL_MANAGER_SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY;

function assertSupabaseConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL and anon key must be configured.');
  }
}

/**
 * Creates a server-side PostgREST client constrained by the supplied end-user
 * access token. It deliberately uses the anon key, so every domain query
 * remains subject to the PostgreSQL RLS policies installed by the approved
 * migration. Never use a service-role client for request-scoped hotel data.
 */
export function createRlsSupabaseClient(accessToken?: string) {
  assertSupabaseConfig();

  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}

export type SupabaseMembership = {
  hotelId: string;
  role: HumanRole;
};

export type SupabaseIdentity = {
  id: string;
  email: string | null;
  name: string | null;
  role: AppRole | null;
  roles: AppRole[];
  memberships: SupabaseMembership[];
  accessToken: string;
  appMetadata: Record<string, unknown>;
  userMetadata: Record<string, unknown>;
};

export async function getSupabaseIdentity(req: Request): Promise<SupabaseIdentity | null> {
  const authorization = req.header('authorization');
  const accessToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;

  if (!accessToken) return null;

  const { data, error } = await createRlsSupabaseClient(accessToken).auth.getUser(accessToken);
  if (error || !data.user) return null;

  const metadata = data.user.user_metadata ?? {};
  const metadataName =
    typeof metadata.full_name === 'string'
      ? metadata.full_name
      : typeof metadata.name === 'string'
        ? metadata.name
        : null;

  // `api_service` is a machine identity, not a browser session. It must use a
  // separate server-to-server credential and is rejected from the human app.
  if (data.user.app_metadata?.role === 'api_service' || data.user.user_metadata?.role === 'api_service') {
    return null;
  }

  const client = createRlsSupabaseClient(accessToken);
  const { data: membershipRows, error: membershipError } = await client
    .from('hotel_users')
    .select('hotel_id,role')
    .eq('user_id', data.user.id);
  if (membershipError) return null;

  const memberships = (membershipRows ?? [])
    .filter(row => typeof row.hotel_id === 'string' && isHumanRole(typeof row.role === 'string' ? row.role : null))
    .map(row => ({ hotelId: row.hotel_id as string, role: row.role as HumanRole }));
  const roles = APP_ROLES.filter(role => memberships.some(membership => membership.role === role));
  try {
    const { data: isSa } = await client.rpc('is_super_admin');
    if (isSa && !roles.includes('super_admin')) roles.push('super_admin');
  } catch {
    // Keep the role set empty on an unavailable helper; protected routes fail closed.
  }
  const resolvedRole = getHighestRole(roles);
  if (resolvedRole && !isAppRole(resolvedRole)) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    name: metadataName ?? data.user.email ?? null,
    role: resolvedRole,
    roles,
    memberships,
    accessToken,
    appMetadata: data.user.app_metadata ?? {},
    userMetadata: data.user.user_metadata ?? {},
  };
}

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertSupabaseAdminConfig() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase server administration credentials are not configured.');
  }
}

/**
 * Creates the server-only Supabase Admin API client. This function must never be
 * imported by browser code or used for request-scoped hotel data. It exists only
 * for Auth user administration, which cannot be performed with an anon client.
 */
export function createSupabaseAdminClient() {
  assertSupabaseAdminConfig();

  return createClient(supabaseUrl!, supabaseServiceRoleKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export type AuthAdminUser = {
  id: string;
  email: string | null;
  created_at: string;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
};

export async function listAuthUsers() {
  const { data, error } = await createSupabaseAdminClient().auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw new Error(`${error.code ?? 'AUTH_ERROR'}: ${error.message}`);
  return (data.users ?? []).map(user => ({
    id: user.id,
    email: user.email ?? null,
    created_at: user.created_at,
    confirmed_at: user.confirmed_at ?? null,
    last_sign_in_at: user.last_sign_in_at ?? null,
  })) satisfies AuthAdminUser[];
}

export async function inviteAuthUser(email: string) {
  const { data, error } = await createSupabaseAdminClient().auth.admin.inviteUserByEmail(email);
  if (error || !data.user) {
    throw new Error(`${error?.code ?? 'AUTH_INVITE_ERROR'}: ${error?.message ?? 'Invitation did not return a user.'}`);
  }
  return {
    id: data.user.id,
    email: data.user.email ?? email,
  };
}

export async function getAuthUser(userId: string) {
  const { data, error } = await createSupabaseAdminClient().auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
}

export async function deleteAuthUser(userId: string) {
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(userId);
  if (error) throw new Error(`${error.code ?? 'AUTH_DELETE_ERROR'}: ${error.message}`);
}
