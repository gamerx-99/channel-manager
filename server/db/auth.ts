import type { SupabaseClient } from '@supabase/supabase-js';
import { throwOnError } from './utils';
import type { LegacyTemplateUser } from './types';

export async function getUserByOpenId(_openId: string): Promise<LegacyTemplateUser | undefined> {
  return undefined;
}

export async function upsertUser(_user: Partial<LegacyTemplateUser> & { openId: string }): Promise<void> {
  // Intentionally no-op: Supabase Auth owns Channel Manager identity.
}

export async function isSuperAdmin(client: SupabaseClient) {
  const { data, error } = await client.rpc('is_super_admin');
  throwOnError(error);
  return data === true;
}
