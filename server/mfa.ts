import { decodeJwt } from 'jose';
import { TRPCError } from '@trpc/server';

export const DEFAULT_MFA_STEP_UP_WINDOW_MINUTES = 10;

export type MfaStepUpReason = 'no_factor' | 'aal1' | 'expired' | 'no_mfa_method' | 'invalid_token';

export type JwtAmrEntry = {
  method: string;
  timestamp: number;
};

export type DecodedMfaClaims = {
  aal: string | null;
  amr: JwtAmrEntry[];
  exp?: number;
  iat?: number;
  raw: Record<string, unknown>;
};

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
              ? ((entry as Record<string, unknown>)['timestamp'] as number)
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

export function isMfaAmrMethod(method: string): boolean {
  const normalized = method.toLowerCase();
  return normalized.includes('mfa') || normalized === 'otp' || normalized === 'totp';
}

export function getMostRecentMfaEntry(amr: JwtAmrEntry[]): JwtAmrEntry | null {
  const mfaEntries = amr.filter(entry => isMfaAmrMethod(entry.method) && typeof entry.timestamp === 'number' && entry.timestamp > 0);
  if (mfaEntries.length === 0) return null;
  return mfaEntries.reduce((latest, cur) => (cur.timestamp > latest.timestamp ? cur : latest));
}

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
  windowMinutes?: number;
  nowMs?: number;
};

export type BetterAuthUserIdentity = {
  id: string;
  email?: string | null;
  twoFactorEnabled?: boolean | null;
  session?: unknown;
  accessToken?: string | null;
  [key: string]: unknown;
};

export type BetterAuthSessionShape = {
  id?: string;
  userId?: string;
  token?: string;
  createdAt?: Date | number | string;
  twoFactorVerifiedAt?: Date | number | string | null;
  twoFactorVerified?: boolean | null;
  [key: string]: unknown;
};

export type CheckMfaTarget =
  | string
  | BetterAuthUserIdentity
  | { user?: BetterAuthUserIdentity | null; session?: BetterAuthSessionShape | null; accessToken?: string | null }
  | null
  | undefined;

export function checkMfaStepUpStatus(
  target: CheckMfaTarget,
  opts: CheckMfaStepUpOptions = {},
): MfaStepUpStatus {
  const windowMinutes = opts.windowMinutes ?? DEFAULT_MFA_STEP_UP_WINDOW_MINUTES;
  const windowMs = windowMinutes * 60 * 1000;
  const nowMs = opts.nowMs ?? Date.now();

  if (!target) {
    return {
      status: 'error',
      reason: 'invalid_token',
      aal: null,
      verifiedAtMs: null,
      expiresAtMs: null,
      windowMinutes,
    };
  }

  // 1. JWT string or object wrapping a JWT string
  const rawToken =
    typeof target === 'string'
      ? target
      : typeof target === 'object' && 'accessToken' in target && typeof target.accessToken === 'string'
        ? target.accessToken
        : null;

  if (rawToken && rawToken.includes('.')) {
    const claims = decodeMfaClaims(rawToken);
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

    if (!mfaEntry) {
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

  // 2. Better Auth User / Session object inspection
  const user =
    typeof target === 'object' && target !== null && 'user' in target
      ? (target as { user?: BetterAuthUserIdentity | null }).user
      : typeof target === 'object' && target !== null && 'id' in target
        ? (target as BetterAuthUserIdentity)
        : null;

  const session =
    typeof target === 'object' && target !== null && 'session' in target
      ? (target as { session?: BetterAuthSessionShape | null }).session
      : user && 'session' in user
        ? (user.session as BetterAuthSessionShape | null)
        : null;

  if (!user || !user.id) {
    return {
      status: 'error',
      reason: 'invalid_token',
      aal: null,
      verifiedAtMs: null,
      expiresAtMs: null,
      windowMinutes,
    };
  }

  // 2FA not enabled on user -> must enroll
  if (!user.twoFactorEnabled) {
    return {
      status: 'needs_enroll',
      reason: 'no_factor',
      aal: 'aal1',
      verifiedAtMs: null,
      expiresAtMs: null,
      windowMinutes,
    };
  }

  // 2FA enabled: require explicit proof of 2FA verification on the session.
  // Never fall back to session.createdAt for unverified sessions (AAL1 password-only bypass prevention).
  const isExplicitlyVerified =
    session?.twoFactorVerified !== false &&
    (session?.twoFactorVerified === true ||
      (session?.twoFactorVerifiedAt != null && session.twoFactorVerifiedAt !== ''));

  if (!isExplicitlyVerified) {
    return {
      status: 'needs_challenge',
      reason: 'aal1',
      aal: 'aal1',
      verifiedAtMs: null,
      expiresAtMs: null,
      windowMinutes,
    };
  }

  // 2FA genuinely verified: resolve timestamp to determine freshness
  const rawVerifiedTime =
    session?.twoFactorVerifiedAt ??
    (session?.twoFactorVerified === true ? session?.createdAt : null);

  if (!rawVerifiedTime) {
    return {
      status: 'needs_challenge',
      reason: 'aal1',
      aal: 'aal1',
      verifiedAtMs: null,
      expiresAtMs: null,
      windowMinutes,
    };
  }

  const verifiedAtMs = new Date(rawVerifiedTime).getTime();
  if (Number.isNaN(verifiedAtMs) || verifiedAtMs <= 0) {
    return {
      status: 'needs_challenge',
      reason: 'aal1',
      aal: 'aal1',
      verifiedAtMs: null,
      expiresAtMs: null,
      windowMinutes,
    };
  }

  const expiresAtMs = verifiedAtMs + windowMs;
  const isExpired = nowMs - verifiedAtMs > windowMs;

  if (isExpired) {
    return {
      status: 'needs_challenge',
      reason: 'expired',
      aal: 'aal2',
      verifiedAtMs,
      expiresAtMs,
      windowMinutes,
    };
  }

  return {
    status: 'verified',
    aal: 'aal2',
    verifiedAtMs,
    expiresAtMs,
    windowMinutes,
  };
}

export const getMfaStepUpStatus = checkMfaStepUpStatus;

export type RequireMfaInput = CheckMfaTarget;

export function requireRecentMfaVerification(
  target: CheckMfaTarget,
  opts?: CheckMfaStepUpOptions,
): void;
export function requireRecentMfaVerification(
  user: BetterAuthUserIdentity | null,
  session: BetterAuthSessionShape | null,
  opts?: CheckMfaStepUpOptions,
): void;
export function requireRecentMfaVerification(
  targetOrUser: CheckMfaTarget | BetterAuthUserIdentity | null,
  sessionOrOpts?: BetterAuthSessionShape | CheckMfaStepUpOptions | null,
  maybeOpts?: CheckMfaStepUpOptions,
): void {
  let target: CheckMfaTarget;
  let opts: CheckMfaStepUpOptions | undefined;

  if (
    sessionOrOpts &&
    typeof sessionOrOpts === 'object' &&
    ('id' in sessionOrOpts || 'createdAt' in sessionOrOpts || 'twoFactorVerifiedAt' in sessionOrOpts)
  ) {
    target = { user: targetOrUser as BetterAuthUserIdentity | null, session: sessionOrOpts as BetterAuthSessionShape };
    opts = maybeOpts;
  } else {
    target = targetOrUser as CheckMfaTarget;
    opts = sessionOrOpts as CheckMfaStepUpOptions | undefined;
  }

  const result = checkMfaStepUpStatus(target, opts);

  if (result.status === 'verified') return;

  if (result.status === 'error') {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required for MFA step-up check.',
      cause: { reason: result.reason, aal: result.aal },
    });
  }

  if (result.status === 'needs_enroll') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
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

export const enforceMfaStepUp = requireRecentMfaVerification;

export function createMfaStepUpMiddleware(windowMinutes?: number) {
  return function mfaStepUpMiddleware(opts: {
    ctx: {
      user?: BetterAuthUserIdentity | { accessToken?: string | null } | null;
      session?: BetterAuthSessionShape | null;
    };
  }) {
    requireRecentMfaVerification(
      { user: opts.ctx.user as BetterAuthUserIdentity | null, session: opts.ctx.session },
      { windowMinutes },
    );
  };
}
