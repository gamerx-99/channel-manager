export const ICAL_URL_ERROR = "The iCal import URL must be a public HTTP(S) URL.";
export const ICAL_FETCH_ERROR = "Could not fetch or validate the iCal calendar.";
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

// ASSUMPTION: Workers cannot reach private networks, so literal/hostname checks are enough;
// DNS-over-HTTPS is intentionally omitted to avoid adding a network-based resolver here.

function ipv4Octets(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  return octets.every(part => part >= 0 && part <= 255) ? octets : null;
}

function isPrivateIpv4(address: string) {
  const octets = ipv4Octets(address);
  if (!octets) return false;
  const [a, b, c, d] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 0 && c === 2)
    || (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100))
    || (a === 203 && b === 0 && c === 113)
    || a >= 224
    || (a === 255 && b === 255 && c === 255 && d === 255);
}

function parseIpv6(address: string): number[] | null {
  let value = address.toLowerCase();
  if (value.includes(".")) {
    const separator = value.lastIndexOf(":");
    const ipv4 = ipv4Octets(value.slice(separator + 1));
    if (separator < 0 || !ipv4) return null;
    const high = ((ipv4[0]! << 8) | ipv4[1]!).toString(16);
    const low = ((ipv4[2]! << 8) | ipv4[3]!).toString(16);
    value = `${value.slice(0, separator + 1)}${high}:${low}`;
  }
  if (!value.includes(":")) return null;
  const compressed = value.includes("::");
  if (compressed && value.indexOf("::") !== value.lastIndexOf("::")) return null;
  const halves = value.split("::");
  const left = halves[0] ? halves[0]!.split(":") : [];
  const right = compressed && halves[1] ? halves[1]!.split(":") : [];
  const groups = [...left, ...Array(compressed ? 8 - left.length - right.length : 0).fill("0"), ...right];
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map(group => parseInt(group, 16));
}

function isPrivateIpv6(address: string) {
  const groups = parseIpv6(address);
  if (!groups) return true;
  const allZeroPrefix = groups.slice(0, 5).every(group => group === 0);
  if (allZeroPrefix && groups[5] === 0xffff) {
    const mapped = `${groups[6]! >> 8}.${groups[6]! & 255}.${groups[7]! >> 8}.${groups[7]! & 255}`;
    return isPrivateIpv4(mapped);
  }
  const first = groups[0]!;
  const inGlobalUnicast = (first & 0xe000) === 0x2000;
  const inUniqueLocal = (first & 0xfe00) === 0xfc00;
  const inLinkLocal = (first & 0xffc0) === 0xfe80;
  const inMulticast = (first & 0xff00) === 0xff00;
  const inDocumentation = first === 0x2001 && groups[1] === 0x0db8;
  const inSpecial2001 = first === 0x2001 && groups[1]! <= 0x01ff;
  const in6to4 = first === 0x2002;
  return !inGlobalUnicast || inUniqueLocal || inLinkLocal || inMulticast || inDocumentation || inSpecial2001 || in6to4;
}

function stripIpv6Brackets(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function isIpv4Literal(hostname: string) {
  return ipv4Octets(hostname) !== null;
}

/** A Workers-safe literal/hostname URL guard. DNS resolution is intentionally omitted. */
export function parsePublicIcalUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(ICAL_URL_ERROR);
  }
  const hostname = stripIpv6Brackets(url.hostname.toLowerCase());
  const normalizedHostname = hostname.replace(/\.$/, "");
  const authority = value.match(/^https?:\/\/([^/?#]*)/i)?.[1] ?? "";
  const hasCredentials = authority.includes("@") || Boolean(url.username || url.password);
  const localHostname = normalizedHostname === "localhost" || normalizedHostname.endsWith(".localhost")
    || normalizedHostname.endsWith(".local") || normalizedHostname.endsWith(".internal");
  const hasDomainDot = hostname.includes(".") || hostname.includes(":");
  const literalIsPrivate = isIpv4Literal(hostname) ? isPrivateIpv4(hostname) : hostname.includes(":") ? isPrivateIpv6(hostname) : false;
  if (!(["http:", "https:"] as string[]).includes(url.protocol)
    || hasCredentials
    || (url.port !== "" && url.port !== "80" && url.port !== "443")
    || !hostname
    || localHostname
    || !hasDomainDot
    || literalIsPrivate) {
    throw new Error(ICAL_URL_ERROR);
  }
  return url;
}

async function readLimitedBody(response: Response, controller: AbortController) {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader && /^\d+$/.test(lengthHeader) && Number(lengthHeader) > MAX_BODY_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(ICAL_FETCH_ERROR);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        controller.abort();
        await reader.cancel().catch(() => undefined);
        throw new Error(ICAL_FETCH_ERROR);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Fetch a public calendar with manual redirect checks, a 10-second total timeout and a 2 MiB body cap. */
export async function fetchPublicIcalFeed(value: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(ICAL_FETCH_ERROR));
    }, REQUEST_TIMEOUT_MS);
  });
  const operation = (async () => {
    let target = value;
    for (let redirects = 0; ; redirects += 1) {
      let url: URL;
      try { url = parsePublicIcalUrl(target); } catch { throw new Error(ICAL_FETCH_ERROR); }
      let response: Response;
      try {
        response = await fetchImpl(url.toString(), {
          headers: { Accept: "text/calendar, text/plain;q=0.9" },
          redirect: "manual",
          signal: controller.signal,
        });
      } catch {
        throw new Error(ICAL_FETCH_ERROR);
      }
      const location = response.headers.get("location");
      const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
      if (isRedirect && location) {
        await response.body?.cancel().catch(() => undefined);
        if (redirects >= MAX_REDIRECTS) throw new Error(ICAL_FETCH_ERROR);
        try { target = new URL(location, url).toString(); } catch { throw new Error(ICAL_FETCH_ERROR); }
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(ICAL_FETCH_ERROR);
      }
      const body = await readLimitedBody(response, controller);
      const contentType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      if (!(["text/calendar", "text/plain"].includes(contentType) || body.startsWith("BEGIN:VCALENDAR"))) {
        throw new Error(ICAL_FETCH_ERROR);
      }
      return body;
    }
  })();
  try {
    return await Promise.race([operation, timeout]);
  } catch {
    controller.abort();
    throw new Error(ICAL_FETCH_ERROR);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
