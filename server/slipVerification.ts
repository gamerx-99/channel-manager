/**
 * SlipOK API verification client (server-only).
 *
 * The platform holds one central SlipOK account (spec 14-05). Its API key and
 * branch ID come from the Worker secrets `SLIPOK_API_KEY` and
 * `SLIPOK_BRANCH_ID`; hotels never enter keys. Because one branch serves every
 * hotel, SlipOK cannot check the receiver for us, so this module compares the
 * slip's receiver with the hotel's PromptPay ID itself.
 *
 * SlipOK API docs: https://slipok.com/api-document
 */

const SLIPOK_BASE_URL = 'https://api.slipok.com/api/line/apikey';

/** SlipOK read the slip and refused it: no such transfer, wrong amount or receiver, or a repeat. */
const SLIPOK_REJECTED_SLIP_CODES = new Set([1011, 1012, 1013, 1014]);
/** The upload could not be read, which says nothing about the payment. */
const SLIPOK_UNREADABLE_SLIP_CODES = new Set([1005, 1006, 1007, 1008]);

/** Fewer compared digits than this cannot tell two accounts apart. */
const MIN_COMPARED_RECEIVER_DIGITS = 4;

export interface SlipOkCredentials {
  apiKey: string;
  branchId: string;
}

export interface SlipVerificationInput {
  /** Base64 of the slip image */
  slipData: string;
  /** Expected amount in THB */
  expectedAmount: number;
  /** The hotel's PromptPay ID, which the slip's receiver must match */
  expectedReceiver: string;
}

export type ReceiverCheck = 'match' | 'mismatch' | 'unknown';

export interface SlipVerificationResult {
  matched: boolean;
  /** The slip is otherwise valid but its receiver cannot be compared, so a person must check it. */
  needsManualReview: boolean;
  receiverCheck: ReceiverCheck | null;
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

/** The central SlipOK account, or null when its secrets are not set. */
export function getCentralSlipOkCredentials(env: Record<string, string | undefined> = process.env): SlipOkCredentials | null {
  const apiKey = env.SLIPOK_API_KEY?.trim();
  const branchId = env.SLIPOK_BRANCH_ID?.trim();
  if (!apiKey || !branchId) return null;
  return { apiKey, branchId };
}

/** Digits and mask characters only, with a +66 phone number written as 0XXXXXXXXX. */
function normaliseAccountValue(value: string) {
  const kept = value.replace(/[^0-9xX]/g, '').toLowerCase();
  // ASSUMPTION: only an 11-character value is a 66-prefixed mobile number; a
  // 13-digit national ID or tax ID may also start with 66 and is left alone.
  return kept.length === 11 && kept.startsWith('66') ? `0${kept.slice(2)}` : kept;
}

/**
 * Compare a (possibly masked) slip value with the PromptPay ID from the right,
 * one position at a time. Masked positions are skipped; any differing digit is
 * a mismatch. Returns null when too few digits could be compared.
 */
export function compareReceiverValue(promptPayId: string, slipValue: string): Exclude<ReceiverCheck, 'unknown'> | null {
  const expected = normaliseAccountValue(promptPayId);
  const actual = normaliseAccountValue(slipValue);
  let compared = 0;
  for (let offset = 1; offset <= Math.min(expected.length, actual.length); offset++) {
    const a = expected[expected.length - offset]!;
    const b = actual[actual.length - offset]!;
    if (a === 'x' || b === 'x') continue;
    if (a !== b) return 'mismatch';
    compared++;
  }
  return compared >= MIN_COMPARED_RECEIVER_DIGITS ? 'match' : null;
}

function nestedValue(source: unknown, key: string): string | null {
  if (!source || typeof source !== 'object') return null;
  const value = (source as Record<string, unknown>)[key];
  if (!value || typeof value !== 'object') return null;
  const inner = (value as Record<string, unknown>).value;
  return typeof inner === 'string' && inner.trim() ? inner : null;
}

/**
 * Check the slip receiver: the PromptPay proxy first, then the bank account.
 *
 * A comparable proxy decides on its own. A bank account number can only be
 * compared by chance (it is not the PromptPay ID), so when only the account is
 * comparable, a match still counts but a mismatch goes to manual review
 * instead of being rejected.
 */
export function checkSlipReceiver(promptPayId: string, receiver: unknown): ReceiverCheck {
  const proxy = nestedValue(receiver, 'proxy');
  const proxyResult = proxy ? compareReceiverValue(promptPayId, proxy) : null;
  if (proxyResult) return proxyResult;

  const account = nestedValue(receiver, 'account');
  const accountResult = account ? compareReceiverValue(promptPayId, account) : null;
  // ASSUMPTION: a bank account that differs from the PromptPay ID may still be
  // the hotel's own account behind that PromptPay ID, so staff decide.
  return accountResult === 'match' ? 'match' : 'unknown';
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
      // `data` is the QR text, so an image goes in `files`. No `log`: the
      // central branch has no single receiver to bind, and repeats are caught
      // by our own transaction-reference check.
      body: JSON.stringify({ files: input.slipData, amount: input.expectedAmount }),
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
      return { matched: false, needsManualReview: false, receiverCheck: null, transactionRef: null, amount: null, raw: failure };
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

  // SlipOK response shape (v2): { success: bool, data: { amount, transRef, receiver, ... } }
  const data = (body.data ?? body) as Record<string, unknown>;
  const returnedAmount = typeof data.amount === 'number' ? data.amount : null;
  const returnedRef = typeof data.transRef === 'string' && data.transRef ? data.transRef : null;

  // Amount tolerance: allow ±0.01 THB for rounding
  const amountMatched =
    returnedAmount !== null && Math.abs(returnedAmount - input.expectedAmount) <= 0.01;
  // No transRef means no replay check in finalizePaymentSession, so it cannot match.
  const slipValid = Boolean(body.success) && data.success !== false && amountMatched && returnedRef !== null;
  const receiverCheck = slipValid ? checkSlipReceiver(input.expectedReceiver, data.receiver) : null;

  return {
    matched: receiverCheck === 'match',
    needsManualReview: receiverCheck === 'unknown',
    receiverCheck,
    transactionRef: returnedRef,
    amount: returnedAmount,
    raw: body,
  };
}
