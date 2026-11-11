import { useState, useCallback } from "react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";

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
  | { status: "needs_challenge"; factorId?: string; error?: string }
  | { status: "verified" }
  | { status: "error"; message: string };

/** The server's error message, which explains what to do next. */
function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Hook that manages MFA step-up for sensitive actions such as saving PromptPay.
 * The server decides: it checks the code with Better Auth and keeps the step-up
 * for this session only (server/mfaStepUp.ts), so a page reload keeps it and a
 * stolen client flag cannot fake it.
 *
 * Usage:
 *   const { mfaState, triggerStepUp, submitTotp, reset } = useMfaStepUp();
 *   const step = await triggerStepUp(); // "verified" | "needs_challenge" | "error"
 *   // If "needs_challenge", render a code input and call:
 *   const ok = await submitTotp(code);
 */
export function useMfaStepUp() {
  const utils = trpc.useUtils();
  const [mfaState, setMfaState] = useState<MfaStepUpState>({ status: "idle" });

  const triggerStepUp = useCallback(async (): Promise<
    "verified" | "needs_challenge" | "error"
  > => {
    setMfaState({ status: "pending" });
    try {
      const { status } = await utils.client.auth.mfaStepUpStatus.query();
      // 2FA is optional: an account without it has nothing to prove here.
      if (status === "verified" || status === "needs_enroll") {
        setMfaState({ status: "verified" });
        return "verified";
      }
      if (status === "needs_challenge") {
        setMfaState({ status: "needs_challenge", factorId: "totp" });
        return "needs_challenge";
      }
      setMfaState({ status: "error", message: "Authentication required." });
      return "error";
    } catch (e) {
      setMfaState({ status: "error", message: errorMessage(e, "Unknown error during MFA step-up.") });
      return "error";
    }
  }, [utils]);

  const submitTotp = useCallback(
    async (code: string): Promise<boolean> => {
      const cleanCode = code?.trim() ?? "";
      if (!/^\d{6}$/.test(cleanCode)) {
        setMfaState({
          status: "needs_challenge",
          factorId: "totp",
          error: "Please enter a valid 6-digit authenticator code.",
        });
        return false;
      }

      setMfaState({ status: "pending" });
      try {
        await utils.client.auth.verifyMfaStepUp.mutate({ code: cleanCode });
        setMfaState({ status: "verified" });
        return true;
      } catch (e) {
        setMfaState({ status: "needs_challenge", factorId: "totp", error: errorMessage(e, "Verification failed.") });
        return false;
      }
    },
    [utils],
  );

  const reset = useCallback(() => {
    setMfaState({ status: "idle" });
  }, []);

  return { mfaState, triggerStepUp, submitTotp, reset };
}
