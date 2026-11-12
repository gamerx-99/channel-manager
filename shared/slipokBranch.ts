export const SLIPOK_API_PREFIX = "https://api.slipok.com/api/line/apikey/";

const BRANCH_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** SlipOK presents the whole API URL; our database stores its final branch segment. */
export function branchIdFromApiUrl(value: string): string | null {
  const match = /^https:\/\/api\.slipok\.com\/api\/line\/apikey\/([A-Za-z0-9_-]+)\/?$/i.exec(value.trim());
  return match?.[1] ?? null;
}

/**
 * The branch segment from either SlipOK's whole API URL or a bare branch ID; null for anything else.
 * Some hotels saved the whole URL as the branch ID, which made every SlipOK call fail, so both the save
 * and the verification call go through this.
 */
export function normaliseSlipOkBranchId(value: string): string | null {
  const trimmed = value.trim();
  return branchIdFromApiUrl(trimmed) ?? (BRANCH_ID_PATTERN.test(trimmed) ? trimmed : null);
}
