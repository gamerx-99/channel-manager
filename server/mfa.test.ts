import { describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { SignJWT } from 'jose';
import {
  checkMfaStepUpStatus,
  decodeMfaClaims,
  DEFAULT_MFA_STEP_UP_WINDOW_MINUTES,
  getMostRecentMfaEntry,
  isMfaAmrMethod,
  requireRecentMfaVerification,
} from './mfa';

// ---------------------------------------------------------------------------
// Helpers — build unsigned-looking JWTs via jose SignJWT so decodeJwt works
// ---------------------------------------------------------------------------

const HS256_SECRET = new TextEncoder().encode('test-secret-for-mfa-step-up-32b!!');

async function makeToken(payload: Record<string, unknown>): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(HS256_SECRET);
}

function secondsAgo(seconds: number): number {
  return Math.floor(Date.now() / 1000) - seconds;
}

// ---------------------------------------------------------------------------

describe('isMfaAmrMethod', () => {
  it.each([
    ['mfa/totp', true],
    ['mfa/phone', true],
    ['MFA/TOTP', true],
    ['otp', true],
    ['totp', true],
    ['password', false],
    ['oauth', false],
    ['magiclink', false],
  ])('%s -> %s', (method, expected) => {
    expect(isMfaAmrMethod(method)).toBe(expected);
  });
});

describe('getMostRecentMfaEntry', () => {
  it('returns null when no MFA entry exists', () => {
    expect(getMostRecentMfaEntry([{ method: 'password', timestamp: 1000 }])).toBeNull();
  });

  it('returns newest MFA entry when multiple exist', () => {
    const entries = [
      { method: 'mfa/totp', timestamp: 1000 },
      { method: 'mfa/totp', timestamp: 3000 },
      { method: 'mfa/totp', timestamp: 2000 },
    ];
    expect(getMostRecentMfaEntry(entries)).toEqual({ method: 'mfa/totp', timestamp: 3000 });
  });
});

describe('decodeMfaClaims', () => {
  it('returns null for malformed token', () => {
    expect(decodeMfaClaims('not.a.jwt')).toBeNull();
    expect(decodeMfaClaims('')).toBeNull();
  });

  it('decodes aal and amr claims', async () => {
    const token = await makeToken({
      sub: 'user-1',
      aal: 'aal2',
      amr: [{ method: 'password', timestamp: secondsAgo(600) }, { method: 'mfa/totp', timestamp: secondsAgo(60) }],
    });
    const claims = decodeMfaClaims(token);
    expect(claims?.aal).toBe('aal2');
    expect(claims?.amr).toHaveLength(2);
  });
});

describe('checkMfaStepUpStatus', () => {
  it('verified: aal2 with recent mfa/totp', async () => {
    const token = await makeToken({
      sub: 'u1',
      aal: 'aal2',
      amr: [
        { method: 'password', timestamp: secondsAgo(600) },
        { method: 'mfa/totp', timestamp: secondsAgo(60) },
      ],
    });
    const result = checkMfaStepUpStatus(token);
    expect(result.status).toBe('verified');
    if (result.status === 'verified') {
      expect(result.aal).toBe('aal2');
      expect(result.verifiedAtMs).toBeGreaterThan(Date.now() - 120_000);
    }
  });

  it('needs_enroll: aal1 with only password (no factor)', async () => {
    const token = await makeToken({
      sub: 'u1',
      aal: 'aal1',
      amr: [{ method: 'password', timestamp: secondsAgo(60) }],
    });
    const result = checkMfaStepUpStatus(token);
    expect(result.status).toBe('needs_enroll');
    expect((result as any).reason).toBe('no_factor');
  });

  it('needs_enroll: empty amr', async () => {
    const token = await makeToken({ sub: 'u1', aal: 'aal1', amr: [] });
    expect(checkMfaStepUpStatus(token).status).toBe('needs_enroll');
  });

  it('needs_challenge: aal1 even though mfa entry exists but not aal2', async () => {
    const token = await makeToken({
      sub: 'u1',
      aal: 'aal1',
      amr: [
        { method: 'password', timestamp: secondsAgo(600) },
        { method: 'mfa/totp', timestamp: secondsAgo(60) },
      ],
    });
    const result = checkMfaStepUpStatus(token);
    expect(result.status).toBe('needs_challenge');
    expect((result as any).reason).toBe('aal1');
  });

  it('needs_challenge: expired — aal2 but mfa verified outside window', async () => {
    const windowMs = DEFAULT_MFA_STEP_UP_WINDOW_MINUTES * 60 * 1000;
    // Verified 20 minutes ago → beyond default 10-minute window
    const token = await makeToken({
      sub: 'u1',
      aal: 'aal2',
      amr: [
        { method: 'password', timestamp: secondsAgo(3600) },
        { method: 'mfa/totp', timestamp: secondsAgo(20 * 60) },
      ],
    });
    const result = checkMfaStepUpStatus(token);
    expect(result.status).toBe('needs_challenge');
    expect((result as any).reason).toBe('expired');
  });

  it('respects custom windowMinutes override', async () => {
    // Verified 20 minutes ago, but allow 30-minute window → should be verified
    const token = await makeToken({
      sub: 'u1',
      aal: 'aal2',
      amr: [
        { method: 'password', timestamp: secondsAgo(3600) },
        { method: 'mfa/totp', timestamp: secondsAgo(20 * 60) },
      ],
    });
    expect(checkMfaStepUpStatus(token, { windowMinutes: 30 }).status).toBe('verified');
    expect(checkMfaStepUpStatus(token, { windowMinutes: 5 }).status).toBe('needs_challenge');
  });

  it('invalid_token: malformed JWT', () => {
    const result = checkMfaStepUpStatus('not-a-jwt', { windowMinutes: 10 });
    expect(result.status).toBe('error');
    expect((result as any).reason).toBe('invalid_token');
  });

  it('handles mfa/phone alternate method string', async () => {
    const token = await makeToken({
      sub: 'u1',
      aal: 'aal2',
      amr: [{ method: 'mfa/phone', timestamp: secondsAgo(30) }],
    });
    expect(checkMfaStepUpStatus(token).status).toBe('verified');
  });
});

describe('requireRecentMfaVerification', () => {
  it('allows verified session silently', async () => {
    const token = await makeToken({
      sub: 'u1',
      aal: 'aal2',
      amr: [{ method: 'mfa/totp', timestamp: secondsAgo(30) }],
    });
    expect(() => requireRecentMfaVerification(token)).not.toThrow();
    // Also accepts { accessToken } object (SupabaseIdentity shape)
    expect(() => requireRecentMfaVerification({ accessToken: token })).not.toThrow();
  });

  it('throws PRECONDITION_FAILED needs_enroll when no factor', async () => {
    const token = await makeToken({
      sub: 'u1',
      aal: 'aal1',
      amr: [{ method: 'password', timestamp: secondsAgo(30) }],
    });
    try {
      requireRecentMfaVerification(token);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      const e = err as TRPCError;
      expect(e.code).toBe('PRECONDITION_FAILED');
      expect(e.message).toMatch(/enrollment required/i);
      expect((e.cause as any)?.reason).toBe('no_factor');
    }
  });

  it('throws PRECONDITION_FAILED needs_challenge when aal1', async () => {
    const token = await makeToken({
      sub: 'u1',
      aal: 'aal1',
      amr: [
        { method: 'password', timestamp: secondsAgo(600) },
        { method: 'mfa/totp', timestamp: secondsAgo(30) },
      ],
    });
    try {
      requireRecentMfaVerification(token);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('PRECONDITION_FAILED');
      expect(((err as TRPCError).cause as any)?.reason).toBe('aal1');
    }
  });

  it('throws with reason expired when window elapsed', async () => {
    const token = await makeToken({
      sub: 'u1',
      aal: 'aal2',
      amr: [{ method: 'mfa/totp', timestamp: secondsAgo(20 * 60) }],
    });
    try {
      requireRecentMfaVerification(token);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as TRPCError).code).toBe('PRECONDITION_FAILED');
      expect(((err as TRPCError).cause as any)?.reason).toBe('expired');
      expect((err as TRPCError).message).toMatch(/expired/i);
    }
  });

  it('throws UNAUTHORIZED when token missing', () => {
    try {
      requireRecentMfaVerification(null);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as TRPCError).code).toBe('UNAUTHORIZED');
    }
    try {
      requireRecentMfaVerification({ accessToken: '' });
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as TRPCError).code).toBe('UNAUTHORIZED');
    }
  });
});

describe('checkMfaStepUpStatus with Better Auth sessions (regression prevention)', () => {
  const nowMs = 1700000000000;

  it('rejects fresh password-only session without explicit 2FA verification (prevents AAL2 bypass)', () => {
    const freshPasswordSessionTarget = {
      id: 'u-pw-only',
      twoFactorEnabled: true,
      session: {
        id: 's-fresh',
        createdAt: new Date(nowMs - 30_000), // Created 30 seconds ago
      },
    };

    const status = checkMfaStepUpStatus(freshPasswordSessionTarget, { nowMs });
    expect(status).toEqual({
      status: 'needs_challenge',
      reason: 'aal1',
      aal: 'aal1',
      verifiedAtMs: null,
      expiresAtMs: null,
      windowMinutes: 10,
    });

    expect(() => requireRecentMfaVerification(freshPasswordSessionTarget, { nowMs })).toThrowError(
      /MFA verification required: please complete TOTP challenge to elevate to AAL2\./,
    );
  });

  it('rejects older password-only session as aal1 rather than false expired aal2', () => {
    const oldPasswordSessionTarget = {
      id: 'u-pw-old',
      twoFactorEnabled: true,
      session: {
        id: 's-old',
        createdAt: new Date(nowMs - 1200_000), // Created 20 minutes ago
      },
    };

    const status = checkMfaStepUpStatus(oldPasswordSessionTarget, { nowMs });
    expect(status.status).toBe('needs_challenge');
    expect((status as any).reason).toBe('aal1');
    expect(status.aal).toBe('aal1');
  });

  it('verifies session with explicit twoFactorVerifiedAt within 10-minute window', () => {
    const verifiedTarget = {
      id: 'u-verified-at',
      twoFactorEnabled: true,
      session: {
        id: 's-verified',
        twoFactorVerifiedAt: new Date(nowMs - 180_000), // 3 minutes ago
      },
    };

    const status = checkMfaStepUpStatus(verifiedTarget, { nowMs });
    expect(status.status).toBe('verified');
    expect(status.aal).toBe('aal2');
    expect(() => requireRecentMfaVerification(verifiedTarget, { nowMs })).not.toThrow();
  });

  it('requires challenge with reason expired when twoFactorVerifiedAt exceeds 10-minute window', () => {
    const expiredTarget = {
      id: 'u-expired-at',
      twoFactorEnabled: true,
      session: {
        id: 's-expired',
        twoFactorVerifiedAt: new Date(nowMs - 720_000), // 12 minutes ago
      },
    };

    const status = checkMfaStepUpStatus(expiredTarget, { nowMs });
    expect(status.status).toBe('needs_challenge');
    expect((status as any).reason).toBe('expired');
    expect(status.aal).toBe('aal2');
  });
});

