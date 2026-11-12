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

import { normaliseSlipOkBranchId } from '@shared/slipokBranch';

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
  /** Base64 of the slip image, with or without a data: URL prefix */
  slipData: string;
  /** MIME type of the slip image; JPEG when not given */
  contentType?: 'image/jpeg' | 'image/png' | 'image/webp';
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

function slipBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64.replace(/^data:[^,]*,/, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export class SlipOkError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_KEY' | 'API_ERROR' | 'UNREADABLE_SLIP',
    /** SlipOK's own error code (1000–1014), when it sent one. */
    public readonly slipokCode?: number,
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
  const branchId = normaliseSlipOkBranchId(credentials.branchId);
  if (!branchId) throw new SlipOkError('SlipOK branch ID is not a branch ID or SlipOK API URL.', 'INVALID_KEY');
  const url = `${SLIPOK_BASE_URL}/${encodeURIComponent(branchId)}`;

  // SlipOK takes the image as a file upload in `files` (multipart). A base64 string in a JSON body
  // is read as "no slip" (code 1000), which sent every slip to staff review. `log` makes SlipOK
  // check the receiver account bound to the branch and reject repeat slips.
  const contentType = input.contentType ?? 'image/jpeg';
  const form = new FormData();
  form.append('files', new Blob([slipBytes(input.slipData)], { type: contentType }), `slip.${contentType.split('/')[1] ?? 'jpg'}`);
  form.append('log', 'true');
  form.append('amount', String(input.expectedAmount));

  let response: Response;
  try {
    // No Content-Type header: fetch sets multipart/form-data with its boundary.
    response = await fetch(url, {
      method: 'POST',
      headers: { 'x-authorization': credentials.apiKey },
      body: form,
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
    // 1001 unknown branch, 1002 bad key: the hotel's settings, not the guest's slip.
    if (failure && (failure.code === 1001 || failure.code === 1002)) {
      throw new SlipOkError(`SlipOK rejected the hotel's credentials: code ${failure.code}`, 'INVALID_KEY', failure.code);
    }
    // Includes 1003/1004 package limits, 1009 bank outage and 1010 bank delay. The code goes in the
    // message so the Worker log says why a slip went to staff review.
    const slipokCode = typeof failure?.code === 'number' ? failure.code : undefined;
    throw new SlipOkError(`SlipOK API error: HTTP ${response.status} code ${String(slipokCode ?? 'none')}`, 'API_ERROR', slipokCode);
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
