import { PLATFORM_ROLES, type AppRole } from "@shared/authorization";
import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

/** Blocking enroll path for platform roles without an MFA factor. */
export const MFA_ENROLL_PATH = "/mfa/enroll";

type FactorLike = {
  status?: string;
  factor_type?: string;
  factorType?: string;
};

type ListFactorsData = {
  all?: FactorLike[];
  totp?: FactorLike[];
} | null | undefined;

/**
 * Returns true if the Supabase MFA factor list contains at least one verified TOTP factor.
 * Supabase returns verified TOTP factors under `totp` (factor_type === 'totp') with status === 'verified'.
 */
export function hasVerifiedTotpFactor(data: ListFactorsData): boolean {
  if (!data) return false;
  const totpVerified = (data.totp ?? []).some(f => f.status === "verified");
  if (totpVerified) return true;
  const allVerified = (data.all ?? []).some(
    f => (f.factor_type === "totp" || (f as unknown as { type: string }).type === "totp" || f.factorType === "totp") && f.status === "verified"
  );
  return allVerified;
}

/**
 * Platform roles must enroll MFA before any authenticated access. Hotel-level roles are opt-in.
 */
export function shouldEnforceMfaForRoles(roles: readonly string[] | null | undefined): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.some(role => (PLATFORM_ROLES as readonly string[]).includes(role as AppRole));
}

/**
 * Convenience: given roles and a factor payload, returns true if the session must be
 * redirected to the blocking enroll flow.
 */
export function shouldRedirectToMfaEnroll(roles: readonly string[] | null | undefined, factorData: ListFactorsData): boolean {
  if (!shouldEnforceMfaForRoles(roles)) return false;
  return !hasVerifiedTotpFactor(factorData);
}

export type CleanupFactorsResult = {
  success: boolean;
  error?: string;
  removedCount: number;
};

/**
 * Removes all unverified TOTP factors for the current user.
 * Surfaces explicit errors if listing or unenrolling fails.
 */
export async function cleanupUnverifiedFactors(): Promise<CleanupFactorsResult> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    return {
      success: false,
      error: `Failed to list MFA factors: ${error.message}`,
      removedCount: 0,
    };
  }

  const factors = ((data?.all?.length ? data.all : data?.totp) ?? []) as Array<{
    id?: string;
    status?: string;
    factor_type?: string;
  }>;
  const unverified = factors.filter(
    f => f.status === "unverified" || (f.factor_type === "totp" && f.status !== "verified")
  );

  let removedCount = 0;
  for (const factor of unverified) {
    if (!factor.id) continue;
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (unenrollError) {
      return {
        success: false,
        error: `Failed to remove stale unverified factor (${factor.id}): ${unenrollError.message}`,
        removedCount,
      };
    }
    removedCount++;
  }

  return { success: true, removedCount };
}

export type PrepareEnrollmentResult =
  | { ok: true }
  | { ok: false; alreadyVerified?: boolean; error: string };

/**
 * Prepares the user's account for TOTP enrollment:
 * 1. Checks if a verified TOTP factor already exists (blocks enrollment if so).
 * 2. Unenrolls all unverified TOTP factors and surfaces errors if unenroll fails.
 * 3. Re-fetches factors and explicitly verifies that no unverified or verified factor blocks new enrollment.
 * 4. If a stale unverified factor remains, returns an actionable error.
 */
export async function prepareTotpEnrollment(): Promise<PrepareEnrollmentResult> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    return { ok: false, error: `Failed to check existing MFA factors: ${error.message}` };
  }

  // Prevent enrollment if a verified authenticator already exists
  if (hasVerifiedTotpFactor(data)) {
    return {
      ok: false,
      alreadyVerified: true,
      error: "An authenticator is already active and verified for this account.",
    };
  }

  const factors = ((data?.all?.length ? data.all : data?.totp) ?? []) as Array<{
    id?: string;
    status?: string;
    factor_type?: string;
  }>;
  const unverified = factors.filter(
    f => f.status === "unverified" || (f.factor_type === "totp" && f.status !== "verified")
  );

  if (unverified.length > 0) {
    for (const factor of unverified) {
      if (!factor.id) continue;
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) {
        return {
          ok: false,
          error: `Failed to remove stale unverified factor (${factor.id}): ${unenrollError.message}`,
        };
      }
    }

    // Re-fetch factors and explicitly verify that stale unverified factors were removed
    const { data: recheckData, error: recheckError } = await supabase.auth.mfa.listFactors();
    if (recheckError) {
      return { ok: false, error: `Failed to verify MFA factors after cleanup: ${recheckError.message}` };
    }

    if (hasVerifiedTotpFactor(recheckData)) {
      return {
        ok: false,
        alreadyVerified: true,
        error: "An authenticator is already active and verified for this account.",
      };
    }

    const remaining = ((recheckData?.all?.length ? recheckData.all : recheckData?.totp) ?? []) as Array<{
      id?: string;
      status?: string;
      factor_type?: string;
    }>;
    const remainingUnverified = remaining.filter(
      f => f.status === "unverified" || (f.factor_type === "totp" && f.status !== "verified")
    );
    if (remainingUnverified.length > 0) {
      return {
        ok: false,
        error: "A stale unverified authenticator is still present. Please refresh or remove it before enrolling.",
      };
    }
  }

  return { ok: true };
}

export type EnrollTotpResult =
  | { ok: true; data: { id: string; totp: { qr_code: string; secret: string; uri: string } } }
  | { ok: false; alreadyVerified?: boolean; error: string };

/**
 * High-level helper for TOTP enrollment:
 * Performs preparation (checking verified status, cleaning up stale unverified factors, re-verifying cleanup),
 * and then calls supabase.auth.mfa.enroll({ factorType: "totp" }).
 */
export async function enrollTotpFactor(): Promise<EnrollTotpResult> {
  const prep = await prepareTotpEnrollment();
  if (!prep.ok) {
    return prep;
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
  });

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Unable to start MFA enrollment.",
    };
  }

  return {
    ok: true,
    data: data as unknown as { id: string; totp: { qr_code: string; secret: string; uri: string } },
  };
}

export type MfaStepUpState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "needs_enroll" }
  | { status: "needs_challenge"; factorId: string }
  | { status: "verified" }
  | { status: "error"; message: string };

/**
 * Hook that manages client-side MFA step-up for sensitive actions (Phase 01: SlipOK).
 * Usage:
 *   const { mfaState, triggerStepUp, submitTotp } = useMfaStepUp();
 *   // When user clicks a sensitive action:
 *   await triggerStepUp();  // will set state to needs_challenge or needs_enroll
 *   // Then render a TOTP input and call:
 *   await submitTotp(code);  // verifies and sets state to verified
 */
export function useMfaStepUp() {
  const [mfaState, setMfaState] = useState<MfaStepUpState>({ status: "idle" });
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);

  const triggerStepUp = useCallback(async () => {
    setMfaState({ status: "pending" });
    try {
      const { data: session } = await supabase.auth.getSession();
      const aal = (session?.session as unknown as { user?: { aal?: string } } | null)?.user?.aal;
      // Check AAL from JWT via getAuthenticatorAssuranceLevel
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.currentLevel === "aal2") {
        setMfaState({ status: "verified" });
        return "verified" as const;
      }
      // Need to challenge
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totpFactor = (factors?.totp ?? []).find(f => f.status === "verified");
      if (!totpFactor) {
        setMfaState({ status: "needs_enroll" });
        return "needs_enroll" as const;
      }
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id,
      });
      if (challengeError || !challenge) {
        setMfaState({ status: "error", message: challengeError?.message ?? "Failed to start MFA challenge." });
        return "error" as const;
      }
      setFactorId(totpFactor.id);
      setChallengeId(challenge.id);
      setMfaState({ status: "needs_challenge", factorId: totpFactor.id });
      return "needs_challenge" as const;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setMfaState({ status: "error", message: msg });
      return "error" as const;
    }
  }, []);

  const submitTotp = useCallback(async (code: string) => {
    if (!factorId || !challengeId) {
      setMfaState({ status: "error", message: "No active MFA challenge." });
      return false;
    }
    setMfaState({ status: "pending" });
    try {
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
      if (error) {
        setMfaState({ status: "needs_challenge", factorId });
        return false;
      }
      setMfaState({ status: "verified" });
      return true;
    } catch (e) {
      setMfaState({ status: "error", message: e instanceof Error ? e.message : "Verification failed." });
      return false;
    }
  }, [factorId, challengeId]);

  const reset = useCallback(() => {
    setMfaState({ status: "idle" });
    setChallengeId(null);
    setFactorId(null);
  }, []);

  return { mfaState, triggerStepUp, submitTotp, reset };
}
