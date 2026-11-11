/** Hosts that sit under a public suffix, where the relying-party id must be the full host. */
const PUBLIC_SUFFIX_HOSTS = [".workers.dev", ".pages.dev"];

export const PASSKEY_RP_NAME = "hayhost";

/**
 * The WebAuthn relying party for an auth base URL.
 *
 * - `https://www.hayhostth.com` -> rpID `hayhostth.com` (a passkey made on www also works on the apex).
 * - `http://localhost:8787` -> rpID `localhost`.
 * - `https://hayhost-stage.lannatc.workers.dev` -> the full host, because workers.dev is a public suffix
 *   and a browser refuses an rpID that is only the suffix.
 * - An IP address is used as is.
 */
export function passkeyRelyingParty(baseURL: string): { rpID: string; origin: string } {
  const url = new URL(baseURL);
  const host = url.hostname.toLowerCase();
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
  const underPublicSuffix = PUBLIC_SUFFIX_HOSTS.some(suffix => host.endsWith(suffix));
  const rpID = !isIp && !underPublicSuffix && host.startsWith("www.") && host.split(".").length > 2 ? host.slice(4) : host;
  return { rpID, origin: url.origin };
}
