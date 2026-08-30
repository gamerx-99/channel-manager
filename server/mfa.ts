import { decodeJwt } from 'jose';
import { TRPCError } from '@trpc/server';

/**
 * T09-03 — MFA step-up check for SlipOK (Phase 01 gate).
 *
 * Supabase Auth MFA uses Authenticator Assurance Levels (AAL):
 *  - `aal1` — single factor (password / magic link) only
 *  - `aal2` — MFA verified this session (TOTP / phone OTP)
 *
 * The Supabase JWT exposes this as claims:
 *  - `aal: 'aal1' | 'aal2'`
 *  - `amr: Array<{ method: string; timestamp: number }>`  (timestamp is seconds since epoch)
 *
 * See Supabase docs: `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` and JWT `aal`/`amr` claims.
 * We decode the access token (already verified via `auth.getUser()` in `server/supabase.ts`)
 * so we stay stateless — no extra DB table needed, per spec 09.
 *
 * Freshness window: step-up means "MFA verified within the last N minutes", not just
 * "ever enrolled". Default is 10 minutes; callers may override via `windowMinutes`.
 * This mirrors the spec's two distinct error paths:
 *  - no-factor → prompt to enroll (not a silent block)
 *  - expired / aal1 → prompt to challenge (re-enter TOTP)
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Default freshness window for step-up: MFA must have been verified within this many minutes. */
export const DEFAULT_MFA_STEP_UP_WINDOW_MINUTES = 10;

/** Machine-readable reasons surfaced via TRPCError.cause / check result for client routing. */
export type MfaStepUpReason = 'no_factor' | 'aal1' | 'expired' | 'no_mfa_method' | 'invalid_token';

// ---------------------------------------------------------------------------
// Decoded JWT shape
// ---------------------------------------------------------------------------

export type JwtAmrEntry = {
  method: string;
  timestamp: number; // seconds since epoch, per Supabase JWT
};

export type DecodedMfaClaims = {
  aal: string | null;
  amr: JwtAmrEntry[];
  exp?: number;
  iat?: number;
  raw: Record<string, unknown>;
};

/**
 * Decode the Supabase access token JWT without verifying the signature
 * (signature was already verified by `supabase.auth.getUser(accessToken)` on the
 * request path via `getSupabaseIdentity`). Returns `null` on malformed token.
 */
export function decodeMfaClaims(accessToken: string): DecodedMfaClaims | null {
  if (!accessToken || typeof accessToken !== 'string') return null;
  try {
    const payload = decodeJwt(accessToken) as Record<string, unknown>;
    const aalRaw = payload['aal'];
    const aal = typeof aalRaw === 'string' ? aalRaw : null;
    const amrRaw = payload['amr'];
    const amr: JwtAmrEntry[] = Array.isArray(amrRaw)
      ? amrRaw
          .filter(
            (entry): entry is Record<string, unknown> =>
              typeof entry === 'object' && entry !== null && typeof (entry as Record<string, unknown>)['method'] === 'string',
          )
          .map(entry => ({
            method: String((entry as Record<string, unknown>)['method']),
            timestamp: typeof (entry as Record<string, unknown>)['timestamp'] === 'number'
              ? (entry as Record<string, unknown>)['timestamp'] as number
              : 0,
          }))
      : [];
    const exp = typeof payload['exp'] === 'number' ? (payload['exp'] as number) : undefined;
    const iat = typeof payload['iat'] === 'number' ? (payload['iat'] as number) : undefined;
    return { aal, amr, exp, iat, raw: payload };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// MFA method detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the `amr[].method` represents an MFA second factor.
 * Supabase uses `mfa/totp`, `mfa/phone`, `otp`, `totp` depending on the flow;
 * we match broadly to avoid brittle exact-string checks.
 */
export function isMfaAmrMethod(method: string): boolean {
  const normalized = method.toLowerCase();
  return normalized.includes('mfa') || normalized === 'otp' || normalized === 'totp';
}

/**
 * Find the most recent MFA entry in `amr`, if any.
 * If multiple MFA entries exist, the newest timestamp wins.
 */
export function getMostRecentMfaEntry(amr: JwtAmrEntry[]): JwtAmrEntry | null {
  const mfaEntries = amr.filter(entry => isMfaAmrMethod(entry.method) && typeof entry.timestamp === 'number' && entry.timestamp > 0);
  if (mfaEntries.length === 0) return null;
  return mfaEntries.reduce((latest, cur) => (cur.timestamp > latest.timestamp ? cur : latest));
}

// ---------------------------------------------------------------------------
// Step-up status (pure, no throw)
// ---------------------------------------------------------------------------

export type MfaStepUpStatus =
  | {
      status: 'verified';
      aal: string;
      verifiedAtMs: number;
      expiresAtMs: number;
      windowMinutes: number;
    }
  | {
      status: 'needs_enroll';
      reason: 'no_factor';
      aal: string | null;
      verifiedAtMs: null;
      expiresAtMs: null;
      windowMinutes: number;
    }
  | {
      status: 'needs_challenge';
      reason: 'aal1' | 'expired' | 'no_mfa_method';
      aal: string | null;
      verifiedAtMs: number | null;
      expiresAtMs: number | null;
      windowMinutes: number;
    }
  | {
      status: 'error';
      reason: 'invalid_token';
      aal: null;
      verifiedAtMs: null;
      expiresAtMs: null;
      windowMinutes: number;
    };

export type CheckMfaStepUpOptions = {
  /** Freshness window in minutes; defaults to DEFAULT_MFA_STEP_UP_WINDOW_MINUTES (10). */
  windowMinutes?: number;
  /** Override for `Date.now()` in tests. */
  nowMs?: number;
};

/**
 * Pure check: does the supplied access token represent a *recently* MFA-verified
 * (AAL2) session? Does not throw — returns a discriminated status so callers
 * can branch to enroll vs challenge vs allow.
 *
 * ASSUMPTION: `amr[].timestamp` is seconds since epoch (Supabase JWT contract).
 * If Supabase ever changes this shape, this function is the single place to adapt.
 */
export function checkMfaStepUpStatus(
  accessToken: string,
  opts: CheckMfaStepUpOptions = {},
): MfaStepUpStatus {
  const windowMinutes = opts.windowMinutes ?? DEFAULT_MFA_STEP_UP_WINDOW_MINUTES;
  const windowMs = windowMinutes * 60 * 1000;
  const nowMs = opts.nowMs ?? Date.now();

  const claims = decodeMfaClaims(accessToken);
  if (!claims) {
    return {
      status: 'error',
      reason: 'invalid_token',
      aal: null,
      verifiedAtMs: null,
      expiresAtMs: null,
      windowMinutes,
    };
  }

  const { aal, amr } = claims;
  const mfaEntry = getMostRecentMfaEntry(amr);

  // No MFA method in amr → user has no enrolled/verified factor this session.
  // Spec requires guiding to enroll, not silent block.
  if (!mfaEntry) {
    // Distinguish "no_factor" (no MFA method at all) from "aal1 but factor exists".
    // If amr is empty and aal1, it's almost certainly no_factor. We surface no_factor
    // so the UI can route to `supabase.auth.mfa.enroll()`.
    return {
      status: 'needs_enroll',
      reason: 'no_factor',
      aal,
      verifiedAtMs: null,
      expiresAtMs: null,
      windowMinutes,
    };
  }

  const verifiedAtMs = mfaEntry.timestamp * 1000;
  const expiresAtMs = verifiedAtMs + windowMs;
  const isExpired = nowMs - verifiedAtMs > windowMs;
  const isAal2 = aal === 'aal2';

  if (!isAal2) {
    return {
      status: 'needs_challenge',
      reason: 'aal1',
      aal,
      verifiedAtMs,
      expiresAtMs,
      windowMinutes,
    };
  }

  if (isExpired) {
    return {
      status: 'needs_challenge',
      reason: 'expired',
      aal,
      verifiedAtMs,
      expiresAtMs,
      windowMinutes,
    };
  }

  return {
    status: 'verified',
    aal: aal!,
    verifiedAtMs,
    expiresAtMs,
    windowMinutes,
  };
}

// Backwards-compatible alias for callers that prefer `getMfaStepUpStatus`.
export const getMfaStepUpStatus = checkMfaStepUpStatus;

// ---------------------------------------------------------------------------
// Throwing guard — use at the top of any sensitive tRPC procedure
// ---------------------------------------------------------------------------

export type RequireMfaInput = string | { accessToken?: string | null } | null | undefined;

/**
 * Resolve the raw access token string from either a plain string or a
 * `SupabaseIdentity`-like object (`{ accessToken }`).
 */
function resolveAccessToken(input: RequireMfaInput): string | null {
  if (!input) return null;
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && 'accessToken' in input) {
    const token = (input as { accessToken?: string | null }).accessToken;
    return typeof token === 'string' && token.length > 0 ? token : null;
  }
  return null;
}

/**
 * Throwing step-up guard for tRPC procedures.
 *
 * Usage (Phase 01 SlipOK integration — server/routers.ts):
 * ```ts
 * // at the top of getSlipOkSettings / saveSlipOkSettings
 * requireRecentMfaVerification(ctx.user, { windowMinutes: 10 });
 * // or with raw token:
 * requireRecentMfaVerification(ctx.user.accessToken);
 * ```
 *
 * Behavior:
 *  - `verified` → returns silently (request may proceed)
 *  - `needs_enroll` (no factor) → throws PRECONDITION_FAILED "MFA enrollment required"
 *    → client should route to `supabase.auth.mfa.enroll()` + `verify()`
 *  - `needs_challenge` (aal1 or expired) → throws PRECONDITION_FAILED "MFA verification required"
 *    → client should route to `supabase.auth.mfa.challenge()` + `verify()`
 *  - `invalid_token` / missing token → throws UNAUTHORIZED
 *
 * The thrown `TRPCError.cause` carries `{ reason, aal, verifiedAtMs, expiresAtMs }`
 * so client code can branch without parsing the message string.
 */
export function requireRecentMfaVerification(
  input: RequireMfaInput,
  opts: CheckMfaStepUpOptions = {},
): void {
  const accessToken = resolveAccessToken(input);

  if (!accessToken) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required for MFA step-up check.',
      cause: { reason: 'invalid_token' as MfaStepUpReason },
    });
  }

  const result = checkMfaStepUpStatus(accessToken, opts);

  if (result.status === 'verified') return;

  if (result.status === 'error') {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Invalid or malformed session token for MFA step-up check.',
      cause: { reason: result.reason, aal: result.aal },
    });
  }

  if (result.status === 'needs_enroll') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      // Keep message prefix stable so client string-matching (if any) survives i18n tweaks;
      // primary routing signal is `cause.reason`.
      message:
        'MFA enrollment required: no authenticator factor enrolled. Enroll TOTP before accessing SlipOK settings.',
      cause: {
        reason: result.reason,
        aal: result.aal,
        verifiedAtMs: result.verifiedAtMs,
        expiresAtMs: result.expiresAtMs,
        windowMinutes: result.windowMinutes,
      },
    });
  }

  // needs_challenge — includes aal1 and expired
  const challengeMessage =
    result.reason === 'expired'
      ? 'MFA verification expired: please re-enter your authenticator code to continue.'
      : 'MFA verification required: please complete TOTP challenge to elevate to AAL2.';

  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: challengeMessage,
    cause: {
      reason: result.reason,
      aal: result.aal,
      verifiedAtMs: result.verifiedAtMs,
      expiresAtMs: result.expiresAtMs,
      windowMinutes: result.windowMinutes,
    },
  });
}

/**
 * Alias with a middleware-friendly name for Phase 01.
 * `enforceMfaStepUp(ctx.user)` reads the same as `requireRecentMfaVerification(ctx.user)`.
 */
export const enforceMfaStepUp = requireRecentMfaVerification;

/**
 * Helper for tRPC middleware composition, if a future ticket wants a dedicated
 * `mfaStepUpProcedure`. Example:
 * ```ts
 * const mfaStepUpProcedure = protectedProcedure.use(({ ctx, next }) => {
 *   requireRecentMfaVerification(ctx.user);
 *   return next({ ctx });
 * });
 * ```
 */
export function createMfaStepUpMiddleware(windowMinutes?: number) {
  return function mfaStepUpMiddleware(opts: { ctx: { user: { accessToken?: string | null } | null } }) {
    requireRecentMfaVerification(opts.ctx.user, { windowMinutes });
  };
}
