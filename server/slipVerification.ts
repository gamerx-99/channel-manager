/**
 * SlipOK API verification client (server-only).
 *
 * Each hotel connects its own SlipOK account. Its API key is decrypted from
 * hotel_payment_settings at call time and never reaches the client. `log: true`
 * makes SlipOK check the receiver accounts bound to the hotel's branch, so the
 * receiver is not compared here.
 *
 * SlipOK API docs: https://slipok.com/api-document
 */

const SLIPOK_BASE_URL = 'https://api.slipok.com/api/line/apikey';

/** SlipOK read the slip and refused it: no such transfer, wrong amount or receiver, or a repeat. */
const SLIPOK_REJECTED_SLIP_CODES = new Set([1011, 1012, 1013, 1014]);
/** The upload could not be read, which says nothing about the payment. */
const SLIPOK_UNREADABLE_SLIP_CODES = new Set([1005, 1006, 1007, 1008]);

export interface SlipOkCredentials {
  apiKey: string;
  branchId: string;
}

export interface SlipVerificationInput {
  /** Base64 of the slip image */
  slipData: string;
  /** Expected amount in THB */
  expectedAmount: number;
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
    public readonly code: 'INVALID_KEY' | 'API_ERROR' | 'UNREADABLE_SLIP',
  ) {
    super(message);
    this.name = 'SlipOkError';
  }
}

/**
 * Verify a payment slip against the SlipOK API.
 *
 * The branch ID goes in the URL path and the API key in the `x-authorization`
 * header.
 *
 * @throws SlipOkError on API or key errors
 */
export async function verifySlipWithSlipOk(
  credentials: SlipOkCredentials,
  input: SlipVerificationInput,
): Promise<SlipVerificationResult> {
  const url = `${SLIPOK_BASE_URL}/${encodeURIComponent(credentials.branchId)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-authorization': credentials.apiKey,
      },
      // `data` is the QR text, so an image goes in `files`. `log` makes SlipOK
      // check the receiver account bound to the branch and reject repeat slips.
      body: JSON.stringify({ files: input.slipData, log: true, amount: input.expectedAmount }),
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
    const failure = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (failure && SLIPOK_REJECTED_SLIP_CODES.has(failure.code as number)) {
      return { matched: false, transactionRef: null, amount: null, raw: failure };
    }
    if (failure && SLIPOK_UNREADABLE_SLIP_CODES.has(failure.code as number)) {
      throw new SlipOkError('SlipOK could not read the slip image.', 'UNREADABLE_SLIP');
    }
    // Includes 1009 bank outage and 1010 bank delay, which need a later recheck.
    throw new SlipOkError(`SlipOK API error: HTTP ${response.status}`, 'API_ERROR');
  }

  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new SlipOkError('SlipOK returned an unexpected response format.', 'API_ERROR');
  }

  // SlipOK response shape (v2): { success: bool, data: { amount, transRef, ... } }
  const data = (body.data ?? body) as Record<string, unknown>;
  const returnedAmount = typeof data.amount === 'number' ? data.amount : null;
  const returnedRef = typeof data.transRef === 'string' && data.transRef ? data.transRef : null;

  // Amount tolerance: allow ±0.01 THB for rounding
  const amountMatched =
    returnedAmount !== null && Math.abs(returnedAmount - input.expectedAmount) <= 0.01;

  return {
    // No transRef means no replay check in finalizePaymentSession, so it cannot match.
    matched: Boolean(body.success) && data.success !== false && amountMatched && returnedRef !== null,
    transactionRef: returnedRef,
    amount: returnedAmount,
    raw: body,
  };
}
