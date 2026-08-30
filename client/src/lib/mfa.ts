import { PLATFORM_ROLES, type AppRole } from "@shared/authorization";

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
