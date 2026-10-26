import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const ICAL_URL_ERROR = 'The iCal import URL must be a public HTTP(S) URL.';
const MAX_REDIRECTS = 3;

export type ResolveHost = (hostname: string) => Promise<string[]>;

const resolveWithDns: ResolveHost = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

function isPrivateIpv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
    || (a === 169 && b === 254) // link-local, incl. cloud metadata
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19)) // benchmarking
    || a >= 224; // multicast and reserved
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4[1]);
  // WHATWG URL rewrites mapped IPv4 to hex form (::ffff:7f00:1).
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = parseInt(mappedHex[1], 16);
    const low = parseInt(mappedHex[2], 16);
    return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return normalized === '::'
    || normalized === '::1'
    || /^f[cd]/.test(normalized) // unique local fc00::/7
    || /^fe[89ab]/.test(normalized) // link-local fe80::/10
    || normalized.startsWith('ff'); // multicast
}

/** True for loopback, private, link-local, and other non-public IP literals. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return false;
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/**
 * Synchronous shape check, safe to run at save time: public HTTP(S) URL with no
 * embedded credentials and no loopback/private IP literal or local hostname.
 */
export function parsePublicIcalUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(ICAL_URL_ERROR);
  }

  const hostname = stripIpv6Brackets(url.hostname.toLowerCase());
  const localHostname = hostname === 'localhost' || hostname.endsWith('.localhost');
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || !hostname
    || localHostname
    || isPrivateAddress(hostname)
  ) {
    throw new Error(ICAL_URL_ERROR);
  }
  return url;
}

export function isPublicIcalUrl(value: string): boolean {
  try {
    parsePublicIcalUrl(value);
    return true;
  } catch {
    return false;
  }
}

/** Shape check plus DNS resolution: every resolved address must be public. */
export async function assertPublicIcalUrl(value: string, resolveHost: ResolveHost = resolveWithDns): Promise<URL> {
  const url = parsePublicIcalUrl(value);
  const hostname = stripIpv6Brackets(url.hostname);
  if (isIP(hostname)) return url;

  let addresses: string[];
  try {
    addresses = await resolveHost(hostname);
  } catch {
    throw new Error(`Could not resolve the iCal feed host ${hostname}.`);
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error(ICAL_URL_ERROR);
  }
  return url;
}

/**
 * Fetches an iCal feed, re-validating the target on every redirect hop so a
 * public URL cannot bounce the server to an internal address.
 */
export async function fetchPublicIcalFeed(
  value: string,
  options: { fetchImpl?: typeof fetch; resolveHost?: ResolveHost } = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let target = value;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await assertPublicIcalUrl(target, options.resolveHost);
    const response = await fetchImpl(url.toString(), {
      headers: { Accept: 'text/calendar, text/plain;q=0.9' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });

    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return response;
    target = new URL(location, url).toString();
  }

  throw new Error(`The iCal feed redirected more than ${MAX_REDIRECTS} times.`);
}
