import type { SupabaseClient } from '@supabase/supabase-js';
import { throwOnError, isMissingTableError } from './utils';
import type { CancellationPolicyRecord, UpsertCancellationPolicyInput } from './types';
import { getPolicyValidationError, snapshotPolicy } from '@shared/cancellationPolicy';

/** Current cancellation policy for a hotel. Null when the table is missing or no row yet. */
export async function getCancellationPolicy(
  client: SupabaseClient,
  hotelId: string,
): Promise<CancellationPolicyRecord | null> {
  try {
    const { data, error } = await client
      .from('hotel_cancellation_policies')
      .select('id,hotel_id,free_cancellation_days,partial_keep_percent,partial_cutoff_days,deposit_percent,no_show_keep_percent,policy_text_th,policy_text_en,version,created_at,updated_at')
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (error) {
      if (isMissingTableError('hotel_cancellation_policies', error)) return null;
      throw error;
    }
    return (data ?? null) as CancellationPolicyRecord | null;
  } catch (error) {
    if (isMissingTableError('hotel_cancellation_policies', error)) return null;
    throw error;
  }
}

/**
 * Create or replace the hotel's policy. Version auto-bumps (+1) on every edit
 * so bookings can pin the version they accepted. Throws on invalid input.
 */
export async function saveCancellationPolicy(
  client: SupabaseClient,
  hotelId: string,
  input: UpsertCancellationPolicyInput,
): Promise<CancellationPolicyRecord> {
  const current = await getCancellationPolicy(client, hotelId);
  const nextVersion = (current?.version ?? 0) + 1;
  const candidate = { ...input, version: nextVersion };
  const validationError = getPolicyValidationError(candidate);
  if (validationError) throw new Error(validationError);
  const { data, error } = await client
    .from('hotel_cancellation_policies')
    .upsert(
      {
        hotel_id: hotelId,
        free_cancellation_days: input.free_cancellation_days,
        partial_keep_percent: input.partial_keep_percent,
        partial_cutoff_days: input.partial_cutoff_days,
        deposit_percent: input.deposit_percent,
        no_show_keep_percent: input.no_show_keep_percent,
        policy_text_th: input.policy_text_th.trim(),
        policy_text_en: input.policy_text_en.trim(),
        version: nextVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'hotel_id' },
    )
    .select('id,hotel_id,free_cancellation_days,partial_keep_percent,partial_cutoff_days,deposit_percent,no_show_keep_percent,policy_text_th,policy_text_en,version,created_at,updated_at')
    .single();
  throwOnError(error);
  if (!data) throw new Error('Cancellation policy upsert did not return a record.');
  return data as CancellationPolicyRecord;
}

export { snapshotPolicy };
