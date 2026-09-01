/**
 * Phase 12B — SlipOK API verification client (server-only).
 *
 * Calls the SlipOK REST API with the hotel's per-hotel API key to verify
 * whether a payment slip matches a given amount and reference.
 *
 * API key is decrypted from hotel_payment_settings at call time.
 * Never exposed to the client.
 *
 * SlipOK API docs: https://slipok.com/api-document
 */

const SLIPOK_DEFAULT_BASE_URL = 'https://api.slipok.com/api/line/apikey';

export interface SlipVerificationInput {
  /** Base64 or URL of the slip image */
  slipData: string;
  /** Expected amount in THB */
  expectedAmount: number;
  /** Booking / session reference to match */
  ref?: string;
}

export interface SlipVerificationResult {
  matched: boolean;
  transactionRef: string | null;
  amount: number | null;
  /** Raw SlipOK response data for audit logging */
  raw: Record<string, unknown>;
}

export class SlipOkError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_KEY' | 'API_ERROR' | 'AMOUNT_MISMATCH' | 'NO_KEY',
  ) {
    super(message);
    this.name = 'SlipOkError';
  }
}

/**
 * Verify a payment slip against the SlipOK API.
 *
 * SlipOK requires two separate credentials, not one: the branch ID goes in
 * the URL path, and the API key goes in the `x-authorization` header. An
 * earlier version of this function conflated them into a single value and
 * put it in the URL with no auth header at all — every real verification
 * call would have failed with 401.
 *
 * @param apiKey   - Decrypted per-hotel SlipOK API key (sent as x-authorization)
 * @param branchId - Per-hotel SlipOK branch ID (sent as the URL path segment)
 * @param input    - Slip data, expected amount, optional ref
 * @returns SlipVerificationResult with matched flag
 * @throws SlipOkError on API or key errors
 */
export async function verifySlipWithSlipOk(
  apiKey: string,
  branchId: string,
  input: SlipVerificationInput,
): Promise<SlipVerificationResult> {
  if (!apiKey || apiKey.trim().length === 0 || !branchId || branchId.trim().length === 0) {
    throw new SlipOkError('No SlipOK API key/branch ID configured for this hotel.', 'NO_KEY');
  }

  const baseUrl = process.env.SLIP_OK_API ?? SLIPOK_DEFAULT_BASE_URL;
  const url = baseUrl.endsWith(`/${branchId}`) ? baseUrl : `${baseUrl}/${branchId}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-authorization': apiKey,
      },
      body: JSON.stringify({ data: input.slipData }),
    });
  } catch (err) {
    throw new SlipOkError(
      `SlipOK network error: ${err instanceof Error ? err.message : String(err)}`,
      'API_ERROR',
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new SlipOkError('SlipOK API key is invalid or expired.', 'INVALID_KEY');
  }

  if (!response.ok) {
    throw new SlipOkError(`SlipOK API error: HTTP ${response.status}`, 'API_ERROR');
  }

  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new SlipOkError('SlipOK returned an unexpected response format.', 'API_ERROR');
  }

  // SlipOK response shape (v2): { success: bool, data: { amount, ref, ... } }
  const data = (body.data ?? body) as Record<string, unknown>;
  const returnedAmount = typeof data.amount === 'number' ? data.amount : null;
  const returnedRef =
    typeof data.transRef === 'string'
      ? data.transRef
      : typeof data.ref === 'string'
        ? data.ref
        : null;

  // Amount tolerance: allow ±0.01 THB for rounding
  const amountMatched =
    returnedAmount !== null && Math.abs(returnedAmount - input.expectedAmount) <= 0.01;

  return {
    matched: Boolean(body.success) && amountMatched,
    transactionRef: returnedRef,
    amount: returnedAmount,
    raw: body,
  };
}
