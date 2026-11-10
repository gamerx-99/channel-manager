/** A billing candidate is enabled only by an explicit opt-in; missing/malformed values fail closed. */
export function isBillingCandidateEnabled(value: string | undefined | null): boolean {
  return value?.trim().toLowerCase() === "true";
}
