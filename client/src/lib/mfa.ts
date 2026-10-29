import { PLATFORM_ROLES, type AppRole } from "@shared/authorization";
import { useState, useCallback } from "react";
import { authClient } from "@/lib/auth-client";

/** Blocking enroll path for platform roles without an MFA factor. */
export const MFA_ENROLL_PATH = "/mfa/enroll";

/** Default step-up validity window: 10 minutes (matching server/mfa.ts). */
export const MFA_STEP_UP_WINDOW_MS = 10 * 60 * 1000;

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
 * Returns true if the factor list or factor payload contains at least one verified TOTP factor.
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
 * Convenience: given roles and either a factor payload or boolean twoFactorEnabled status,
 * returns true if the session must be redirected to the blocking enroll flow.
 */
export function shouldRedirectToMfaEnroll(
  roles: readonly string[] | null | undefined,
  factorData?: boolean | ListFactorsData,
): boolean {
  if (!shouldEnforceMfaForRoles(roles)) return false;
  if (typeof factorData === "boolean") {
    return !factorData;
  }
  return !hasVerifiedTotpFactor(factorData);
}

export type CleanupFactorsResult = {
  success: boolean;
  error?: string;
  removedCount: number;
};

/**
 * Compatibility helper for Better Auth runtime:
 * Better Auth manages TOTP via the twoFactor table; unverified factors do not block enrollment.
 */
export async function cleanupUnverifiedFactors(): Promise<CleanupFactorsResult> {
  return { success: true, removedCount: 0 };
}

export type PrepareEnrollmentResult =
  | { ok: true }
  | { ok: false; alreadyVerified?: boolean; error: string };

/**
 * Compatibility helper for Better Auth runtime:
 * Checks whether the current user is already 2FA-enabled before allowing new enrollment.
 */
export async function prepareTotpEnrollment(): Promise<PrepareEnrollmentResult> {
  try {
    const sessionResult = await authClient.getSession();
    if (sessionResult.data?.user && (sessionResult.data.user as { twoFactorEnabled?: boolean }).twoFactorEnabled) {
      return {
        ok: false,
        alreadyVerified: true,
        error: "An authenticator is already active and verified for this account.",
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to prepare MFA enrollment." };
  }
}

export type EnrollTotpResult =
  | { ok: true; data: { id: string; totp: { qr_code: string; secret: string; uri: string } } }
  | { ok: false; alreadyVerified?: boolean; error: string };

/**
 * Compatibility helper: delegates to Better Auth twoFactor client.
 */
export async function enrollTotpFactor(): Promise<EnrollTotpResult> {
  return {
    ok: false,
    error: "Please use authClient.twoFactor.enable({ password }) for Better Auth TOTP enrollment.",
  };
}

export type MfaStepUpState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "needs_enroll" }
  | { status: "needs_challenge"; factorId?: string; error?: string }
  | { status: "verified" }
  | { status: "error"; message: string };

/**
 * Hook that manages client-side MFA step-up for sensitive actions (Phase 01: SlipOK)
 * using Better Auth TOTP verification and session freshness tracking.
 *
 * Usage:
 *   const { mfaState, triggerStepUp, submitTotp, reset } = useMfaStepUp();
 *   // When user clicks a sensitive action:
 *   const step = await triggerStepUp(); // "verified" | "needs_enroll" | "needs_challenge" | "error"
 *   // If "needs_challenge", render TOTP input and call:
 *   const ok = await submitTotp(code);  // verifies TOTP and sets state to verified
 */
export function useMfaStepUp(options?: { windowMs?: number }) {
  const windowMs = options?.windowMs ?? MFA_STEP_UP_WINDOW_MS;
  const [mfaState, setMfaState] = useState<MfaStepUpState>({ status: "idle" });
  const [lastVerifiedAt, setLastVerifiedAt] = useState<number | null>(null);

  /**
   * Evaluates whether the current session has verified TOTP within the allowable time window.
   */
  const checkFreshness = useCallback(
    (session: unknown, verifiedTimestamp: number | null): boolean => {
      const now = Date.now();

      // 1. Check local verification timestamp from this hook instance
      if (verifiedTimestamp && now - verifiedTimestamp < windowMs) {
        return true;
      }

      // 2. Check session attributes from Better Auth (twoFactorVerifiedAt / twoFactorVerified)
      if (session && typeof session === "object") {
        const s = session as {
          twoFactorVerified?: boolean | null;
          twoFactorVerifiedAt?: string | number | Date | null;
          createdAt?: string | number | Date | null;
        };

        const isExplicitlyVerified =
          s.twoFactorVerified !== false &&
          (s.twoFactorVerified === true ||
            (s.twoFactorVerifiedAt != null && s.twoFactorVerifiedAt !== ""));

        if (!isExplicitlyVerified) {
          return false;
        }

        const rawTime =
          s.twoFactorVerifiedAt ??
          (s.twoFactorVerified === true ? s.createdAt : null);

        if (rawTime) {
          const verifiedTimeMs = new Date(rawTime).getTime();
          if (!Number.isNaN(verifiedTimeMs) && verifiedTimeMs > 0) {
            if (now - verifiedTimeMs < windowMs) {
              return true;
            }
          }
        }
      }

      return false;
    },
    [windowMs],
  );

  const triggerStepUp = useCallback(async (): Promise<
    "verified" | "needs_enroll" | "needs_challenge" | "error"
  > => {
    setMfaState({ status: "pending" });
    try {
      const sessionResult = await authClient.getSession();
      if (sessionResult.error || !sessionResult.data?.user) {
        const msg = sessionResult.error?.message ?? "Authentication required.";
        setMfaState({ status: "error", message: msg });
        return "error";
      }

      const { user, session } = sessionResult.data;
      const twoFactorEnabled = Boolean(
        (user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled,
      );

      // User has not enrolled 2FA -> must enroll first
      if (!twoFactorEnabled) {
        setMfaState({ status: "needs_enroll" });
        return "needs_enroll";
      }

      // Session is already verified within freshness window
      if (checkFreshness(session, lastVerifiedAt)) {
        setMfaState({ status: "verified" });
        return "verified";
      }

      // User has 2FA enrolled but needs to complete TOTP challenge
      setMfaState({ status: "needs_challenge", factorId: "totp" });
      return "needs_challenge";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error during MFA step-up.";
      setMfaState({ status: "error", message: msg });
      return "error";
    }
  }, [checkFreshness, lastVerifiedAt]);

  const submitTotp = useCallback(
    async (code: string): Promise<boolean> => {
      const cleanCode = code?.trim() ?? "";
      if (cleanCode.length !== 6) {
        setMfaState({
          status: "needs_challenge",
          factorId: "totp",
          error: "Please enter a valid 6-digit authenticator code.",
        });
        return false;
      }

      setMfaState({ status: "pending" });
      try {
        const { error } = await authClient.twoFactor.verifyTotp({
          code: cleanCode,
        });

        if (error) {
          const message =
            error.message?.toLowerCase().includes("invalid")
              ? "Incorrect code — please wait for the next 6-digit code and try again."
              : error.message || "Verification failed.";

          setMfaState({
            status: "needs_challenge",
            factorId: "totp",
            error: message,
          });
          return false;
        }

        const now = Date.now();
        setLastVerifiedAt(now);
        setMfaState({ status: "verified" });
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Verification failed.";
        setMfaState({
          status: "needs_challenge",
          factorId: "totp",
          error: msg,
        });
        return false;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setMfaState({ status: "idle" });
    setLastVerifiedAt(null);
  }, []);

  return { mfaState, triggerStepUp, submitTotp, reset };
}
