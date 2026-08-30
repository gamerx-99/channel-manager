/**
 * T09-03 — Client-side MFA step-up helpers for Phase 01 (SlipOK).
 *
 * This mirrors `server/mfa.ts` but runs in the browser against the Supabase
 * JS client. Two detection strategies are supported:
 * 1) Preferred: `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` (official SDK)
 * 2) Fallback: decode `session.access_token` JWT claims (`aal` / `amr`) the same way the server does
 *
 * The server remains the source of truth — client checks are advisory to route
 * the user to enroll vs challenge before calling a guarded tRPC procedure.
 */

import { supabase } from '@/lib/supabase';

const DEFAULT_WINDOW_MINUTES = 10;

export type ClientMfaStatus =
  | { status: 'verified'; aal: string; verifiedAtMs: number | null }
  | { status: 'needs_enroll'; reason: 'no_factor'; aal: string | null }
  | { status: 'needs_challenge'; reason: 'aal1' | 'expired'; aal: string | null; verifiedAtMs: number | null }
  | { status: 'error'; reason: 'no_session' | 'unknown' };

function isMfaMethod(method: string): boolean {
  const m = method.toLowerCase();
  return m.includes('mfa') || m === 'otp' || m === 'totp';
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1];
    if (!base64) return null;
    // Pad base64url -> base64
    const padded = base64.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Pure client-side step-up check using the current Supabase session.
 * Calls `getAuthenticatorAssuranceLevel()` if available, falling back to
 * JWT decode. Returns a discriminated status for UI routing:
 *  - `needs_enroll` → guide to `supabase.auth.mfa.enroll()` + verify
 *  - `needs_challenge` → guide to `supabase.auth.mfa.challenge()` + verify
 */
export async function getClientMfaStepUpStatus(
  windowMinutes: number = DEFAULT_WINDOW_MINUTES,
): Promise<ClientMfaStatus> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;
    if (!session?.access_token) return { status: 'error', reason: 'no_session' };

    // Try the official AAL helper first (available in supabase-js >=2.39)
    const mfaClient: unknown = (supabase.auth as unknown as Record<string, unknown>)['mfa'];
    const maybeAalFn = (mfaClient as Record<string, unknown> | null)?.['getAuthenticatorAssuranceLevel'];
    if (typeof maybeAalFn === 'function') {
      try {
        const { data, error } = (await (maybeAalFn as () => Promise<{ data: { currentLevel: string; nextLevel: string; currentAuthenticationMethods: Array<{ method: string; timestamp: number }> }; error: unknown }>)());
        if (!error && data) {
          const currentLevel = data.currentLevel as string;
          const methods = (data.currentAuthenticationMethods ?? []) as Array<{ method: string; timestamp: number }>;
          const mfaEntries = methods.filter(m => isMfaMethod(m.method) && m.timestamp > 0);
          if (mfaEntries.length === 0) {
            return { status: 'needs_enroll', reason: 'no_factor', aal: currentLevel ?? null };
          }
          const latest = mfaEntries.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
          const verifiedAtMs = latest.timestamp * 1000;
          const windowMs = windowMinutes * 60 * 1000;
          const isExpired = Date.now() - verifiedAtMs > windowMs;
          if (currentLevel !== 'aal2' || isExpired) {
            return {
              status: 'needs_challenge',
              reason: isExpired ? 'expired' : 'aal1',
              aal: currentLevel,
              verifiedAtMs,
            };
          }
          return { status: 'verified', aal: currentLevel, verifiedAtMs };
        }
      } catch {
        // fall through to JWT fallback
      }
    }

    // Fallback: decode JWT directly (same logic as server/mfa.ts)
    const payload = decodeJwtPayload(session.access_token);
    if (!payload) return { status: 'error', reason: 'unknown' };
    const aal = typeof payload['aal'] === 'string' ? (payload['aal'] as string) : null;
    const amrRaw = payload['amr'];
    const amr: Array<{ method: string; timestamp: number }> = Array.isArray(amrRaw)
      ? (amrRaw as Array<Record<string, unknown>>)
          .filter(e => typeof e?.['method'] === 'string')
          .map(e => ({ method: String(e['method']), timestamp: typeof e['timestamp'] === 'number' ? (e['timestamp'] as number) : 0 }))
      : [];
    const mfaEntries = amr.filter(e => isMfaMethod(e.method) && e.timestamp > 0);
    if (mfaEntries.length === 0) {
      return { status: 'needs_enroll', reason: 'no_factor', aal };
    }
    const latest = mfaEntries.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
    const verifiedAtMs = latest.timestamp * 1000;
    const windowMs = windowMinutes * 60 * 1000;
    const isExpired = Date.now() - verifiedAtMs > windowMs;
    if (aal !== 'aal2' || isExpired) {
      return { status: 'needs_challenge', reason: isExpired ? 'expired' : 'aal1', aal, verifiedAtMs };
    }
    return { status: 'verified', aal: aal!, verifiedAtMs };
  } catch {
    return { status: 'error', reason: 'unknown' };
  }
}

/**
 * React hook for Phase 01 SlipOK settings page.
 * Example:
 * ```tsx
 * const { status, loading, refresh } = useMfaStepUp();
 * if (loading) return <Spinner />;
 * if (status?.status === 'needs_enroll') return <MfaEnrollPrompt onEnrolled={refresh} />;
 * if (status?.status === 'needs_challenge') return <MfaChallengePrompt onVerified={refresh} />;
 * ```
 */
import { useCallback, useEffect, useState } from 'react';

export function useMfaStepUp(windowMinutes: number = DEFAULT_WINDOW_MINUTES) {
  const [status, setStatus] = useState<ClientMfaStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getClientMfaStepUpStatus(windowMinutes);
    setStatus(result);
    setLoading(false);
  }, [windowMinutes]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, refresh };
}
