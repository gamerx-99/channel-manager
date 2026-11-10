export const SLIPOK_API_PREFIX = "https://api.slipok.com/api/line/apikey/";

/** SlipOK presents the whole API URL; our database stores its final branch segment. */
export function branchIdFromApiUrl(value: string): string | null {
  const match = /^https:\/\/api\.slipok\.com\/api\/line\/apikey\/([A-Za-z0-9_-]+)\/?$/i.exec(value.trim());
  return match?.[1] ?? null;
}
