import type { SupabaseClient } from '@supabase/supabase-js';
import { throwOnError } from './utils';
import type {
  PaymentSessionRecord,
  PaymentStatus,
  PaymentSessionStatus,
  CreatePaymentSessionInput,
} from './types';

/**
 * Returns whether a SlipOK key is configured + enabled for the hotel, plus
 * the branch ID. branch_id is an identifier, not a secret (unlike the API
 * key), so it's safe to return in full for the settings UI to display/edit.
 */
export async function getSlipOkSettings(
  client: SupabaseClient,
  hotelId: string,
): Promise<{ configured: boolean; enabled: boolean; branchId: string | null }> {
  const { data, error } = await client
    .from('hotel_payment_settings')
    .select('slipok_key_hash, slipok_enabled, slipok_branch_id')
    .eq('hotel_id', hotelId)
    .maybeSingle();
  throwOnError(error);
  if (!data) return { configured: false, enabled: false, branchId: null };
  return {
    configured: Boolean(data.slipok_key_hash),
    enabled: Boolean(data.slipok_enabled),
    branchId: data.slipok_branch_id ?? null,
  };
}

/**
 * Upsert a SlipOK key + branch ID for the hotel.
 * Callers must pass the already-encrypted key (enc) and its hash.
 * Encryption is done in the router, not here, to keep DB layer pure.
 */
export async function saveSlipOkSettings(
  client: SupabaseClient,
  hotelId: string,
  encryptedKey: string,
  keyHash: string,
  branchId: string,
): Promise<void> {
  const { error } = await client
    .from('hotel_payment_settings')
    .upsert(
      {
        hotel_id: hotelId,
        slipok_key_enc: encryptedKey,
        slipok_key_hash: keyHash,
        slipok_branch_id: branchId,
        slipok_enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'hotel_id' },
    );
  throwOnError(error);
}

/** Remove the SlipOK key + branch ID (sets to NULL, disabled). Does not delete the row. */
export async function removeSlipOkKey(client: SupabaseClient, hotelId: string): Promise<void> {
  const { error } = await client
    .from('hotel_payment_settings')
    .upsert(
      {
        hotel_id: hotelId,
        slipok_key_enc: null,
        slipok_key_hash: null,
        slipok_branch_id: null,
        slipok_enabled: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'hotel_id' },
    );
  throwOnError(error);
}

/** Save PromptPay ID and optional timeout to hotel_payment_settings. */
export async function savePromptPaySettings(
  client: SupabaseClient,
  hotelId: string,
  promptPayId: string,
  timeoutMinutes: number,
): Promise<void> {
  const { error } = await client
    .from('hotel_payment_settings')
    .upsert(
      {
        hotel_id: hotelId,
        promptpay_id: promptPayId,
        payment_timeout_minutes: timeoutMinutes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'hotel_id' },
    );
  throwOnError(error);
}

/** Get PromptPay ID and SlipOK key (encrypted) for a hotel. Returns null if not configured. */
export async function getHotelPaymentConfig(
  client: SupabaseClient,
  hotelId: string,
): Promise<{
  promptpay_id: string | null;
  slipok_key_enc: string | null;
  slipok_branch_id: string | null;
  slipok_enabled: boolean;
  payment_timeout_minutes: number;
} | null> {
  const { data, error } = await client
    .from('hotel_payment_settings')
    .select('promptpay_id,slipok_key_enc,slipok_branch_id,slipok_enabled,payment_timeout_minutes')
    .eq('hotel_id', hotelId)
    .maybeSingle();
  throwOnError(error);
  return data ?? null;
}

/** Create a new payment session. Returns the created session. */
export async function createPaymentSession(
  client: SupabaseClient,
  input: CreatePaymentSessionInput,
): Promise<PaymentSessionRecord> {
  const { data, error } = await client
    .from('payment_sessions')
    .insert(input)
    .select('id,booking_id,hotel_id,amount,status,qr_reference,qr_string,expires_at,verified_at,slip_url,created_at')
    .single();
  throwOnError(error);
  return data as PaymentSessionRecord;
}

/** Get the latest payment session for a booking. */
export async function getLatestPaymentSession(
  client: SupabaseClient,
  bookingId: string,
): Promise<PaymentSessionRecord | null> {
  const { data, error } = await client
    .from('payment_sessions')
    .select('id,booking_id,hotel_id,amount,status,qr_reference,qr_string,expires_at,verified_at,slip_url,created_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  throwOnError(error);
  return data ?? null;
}

/** Update payment session status. Optionally set verified_at. */
export async function updatePaymentSessionStatus(
  client: SupabaseClient,
  sessionId: string,
  status: PaymentSessionStatus,
  verifiedAt?: string,
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (verifiedAt) patch.verified_at = verifiedAt;
  const { error } = await client
    .from('payment_sessions')
    .update(patch)
    .eq('id', sessionId);
  throwOnError(error);
}

/**
 * Finalize a payment session, persisting the SlipOK raw response and the
 * verified transaction reference. Returns `{ duplicateRef: true }` when the
 * unique partial index on `verified_transaction_ref` rejects a duplicate.
 */
export async function finalizePaymentSession(
  client: SupabaseClient,
  sessionId: string,
  input: {
    status: PaymentSessionStatus;
    verifiedAt?: string;
    rawResponse: Record<string, unknown>;
    verifiedTransactionRef?: string | null;
  },
): Promise<{ duplicateRef: boolean }> {
  const patch: Record<string, unknown> = { status: input.status, raw_response: input.rawResponse };
  if (input.verifiedAt) patch.verified_at = input.verifiedAt;
  if (input.verifiedTransactionRef) patch.verified_transaction_ref = input.verifiedTransactionRef;
  const { error } = await client.from('payment_sessions').update(patch).eq('id', sessionId);
  if (error) {
    if ((error as any).code === '23505') return { duplicateRef: true };
    throwOnError(error);
  }
  return { duplicateRef: false };
}

/** Update booking payment_status. */
export async function updateBookingPaymentStatus(
  client: SupabaseClient,
  bookingId: string,
  paymentStatus: PaymentStatus,
): Promise<void> {
  const { error } = await client
    .from('bookings')
    .update({ payment_status: paymentStatus })
    .eq('id', bookingId);
  throwOnError(error);
}
