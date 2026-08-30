import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';
import { APP_ROLES, getHighestRole, isAppRole, isHumanRole, type AppRole, type HumanRole } from '@shared/authorization';

// The configured VITE values are the approved publishable browser credentials.
// Keep the same URL/key pair on the server so request-scoped clients remain
// RLS-constrained and never fall back to a service role credential.
const DEFAULT_SUPABASE_URL = "https://roznxbvhflwrfvybmhtm.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvem54YnZoZmx3cmZ2eWJtaHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MDM3OTAsImV4cCI6MjEwMzA3OTc5MH0.83pUMuyqSh8Bit6GkwbGcJDTZg2Zmaot0XiASrfbMwU";

function getSupabaseUrl(): string {
  return (
    process.env.CHANNEL_MANAGER_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    DEFAULT_SUPABASE_URL
  );
}

function getSupabaseAnonKey(): string {
  return (
    process.env.CHANNEL_MANAGER_SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    DEFAULT_SUPABASE_ANON_KEY
  );
}

function assertSupabaseConfig() {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) {
    console.error("[Auth] Supabase URL and anon key must be configured.");
    throw new Error("Supabase URL and anon key must be configured.");
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
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  return createClient(url, anonKey, {
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
  const authorization = req.header("authorization") ?? (req.headers["authorization"] as string | undefined);
  if (!authorization) {
    console.warn("[Auth] No Authorization header received in request");
    return null;
  }

  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;

  if (!accessToken) {
    console.warn("[Auth] Authorization header is not a Bearer token");
    return null;
  }

  let userResult;
  try {
    userResult = await createRlsSupabaseClient(accessToken).auth.getUser(accessToken);
  } catch (clientErr) {
    console.error(
      "[Auth] createRlsSupabaseClient or network error during getUser:",
      clientErr instanceof Error ? clientErr.message : String(clientErr)
    );
    return null;
  }

  const { data, error } = userResult;
  if (error || !data.user) {
    console.error(
      "[Auth] Supabase auth.getUser failed:",
      error ? `${error.name} (${error.status ?? "no-status"}): ${error.message}` : "User data is missing"
    );
    return null;
  }

  const metadata = data.user.user_metadata ?? {};
  const metadataName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : null;

  // `api_service` is a machine identity, not a browser session. It must use a
  // separate server-to-server credential and is rejected from the human app.
  if (data.user.app_metadata?.role === "api_service" || data.user.user_metadata?.role === "api_service") {
    console.warn("[Auth] Rejected api_service machine identity from human app session");
    return null;
  }

  const client = createRlsSupabaseClient(accessToken);
  const { data: membershipRows, error: membershipError } = await client
    .from("hotel_users")
    .select("hotel_id,role")
    .eq("user_id", data.user.id);
  if (membershipError) {
    console.error(
      "[Auth] hotel_users membership query failed:",
      membershipError.code,
      membershipError.message
    );
    return null;
  }

  const memberships = (membershipRows ?? [])
    .filter(row => typeof row.hotel_id === "string" && isHumanRole(typeof row.role === "string" ? row.role : null))
    .map(row => ({ hotelId: row.hotel_id as string, role: row.role as HumanRole }));
  const roles = APP_ROLES.filter(role => memberships.some(membership => membership.role === role));
  try {
    const { data: isSa, error: saError } = await client.rpc("is_super_admin");
    if (!saError && isSa && !roles.includes("super_admin")) {
      roles.push("super_admin");
    }
  } catch (rpcErr) {
    console.warn("[Auth] is_super_admin RPC check failed or unavailable:", rpcErr instanceof Error ? rpcErr.message : String(rpcErr));
  }
  const resolvedRole = getHighestRole(roles);
  if (resolvedRole && !isAppRole(resolvedRole)) {
    console.warn("[Auth] Resolved role is invalid app role");
    return null;
  }

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

function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function assertSupabaseAdminConfig() {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server administration credentials are not configured.");
  }
}

/**
 * Creates the server-only Supabase Admin API client. This function must never be
 * imported by browser code or used for request-scoped hotel data. It exists only
 * for Auth user administration, which cannot be performed with an anon client.
 */
export function createSupabaseAdminClient() {
  assertSupabaseAdminConfig();
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey()!;

  return createClient(url, serviceRoleKey, {
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

/**
 * The hotel_signup_links table is never granted to anon/authenticated at the RLS
 * layer (see 20260830_add_hotel_signup_links.sql) - every access below goes
 * through the service-role admin client, the same pattern as the auth.admin.*
 * helpers above.
 */
export type SignupLinkRecord = {
  id: string;
  hotel_id: string;
  token: string;
  created_by: string;
  expires_at: string;
  used_at: string | null;
  used_by_user_id: string | null;
  created_at: string;
};

function throwOnSupabaseError(error: { message: string; code?: string } | null) {
  if (error) throw new Error(error.code ? `${error.code}: ${error.message}` : error.message);
}

export async function createSignupLink(hotelId: string, createdBy: string, token: string, expiresAt: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from('hotel_signup_links')
    .insert({ hotel_id: hotelId, created_by: createdBy, token, expires_at: expiresAt })
    .select('id,hotel_id,token,created_by,expires_at,used_at,used_by_user_id,created_at')
    .single();
  throwOnSupabaseError(error);
  if (!data) throw new Error('Signup link insert did not return a record.');
  return data as SignupLinkRecord;
}

export async function listSignupLinksForHotel(hotelId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from('hotel_signup_links')
    .select('id,hotel_id,token,created_by,expires_at,used_at,used_by_user_id,created_at')
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: false });
  throwOnSupabaseError(error);
  return (data ?? []) as SignupLinkRecord[];
}

/** Returns the link with its hotel's name if it's currently redeemable, else null. */
export async function getValidSignupLink(token: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from('hotel_signup_links')
    .select('id,hotel_id,token,expires_at,used_at,hotels(name)')
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  throwOnSupabaseError(error);
  if (!data) return null;
  const hotels = data.hotels as unknown;
  const hotel = Array.isArray(hotels) ? (hotels[0] as { name: string } | undefined) ?? null : (hotels as { name: string } | null);
  return { id: data.id, hotel_id: data.hotel_id, token: data.token, hotelName: hotel?.name ?? '' };
}

/** Atomically marks a link used; returns null if it was already used/expired (guards concurrent redemption). */
export async function redeemSignupLink(token: string, usedByUserId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from('hotel_signup_links')
    .update({ used_at: new Date().toISOString(), used_by_user_id: usedByUserId })
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id,hotel_id')
    .maybeSingle();
  throwOnSupabaseError(error);
  return data as { id: string; hotel_id: string } | null;
}

/** Binds a brand-new self-registered user as hotel_owner. Uses the admin client since the caller has no RLS-visible membership yet. */
export async function createHotelOwnerMembership(hotelId: string, userId: string) {
  const { error } = await createSupabaseAdminClient()
    .from('hotel_users')
    .insert({ hotel_id: hotelId, user_id: userId, role: 'hotel_owner' });
  throwOnSupabaseError(error);
}
