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
