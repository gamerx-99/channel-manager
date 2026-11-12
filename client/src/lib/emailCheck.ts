// Guest email checks for the public booking form. Pure functions, no I/O.
// The browser's type="email" accepts "a@b" and any misspelt domain, so we check
// more strictly here and hint at likely typos of common mail providers.

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

const COMMON_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "live.com",
  "me.com",
  "msn.com",
  "protonmail.com",
  "hotmail.co.th",
  "yahoo.co.th",
];

const COMMON_ENDINGS = ["com", "net", "org", "co.th", "in.th", "ac.th", "go.th", "or.th"];

export function isValidGuestEmail(value: string): boolean {
  const email = value.trim();
  if (email.length > 320 || email.includes("..")) return false;
  const [local] = email.split("@");
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".")) return false;
  return EMAIL_PATTERN.test(email);
}

function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length][b.length];
}

/** Returns a corrected full address when the domain looks like a typo of a common provider. */
export function suggestEmailCorrection(value: string): string | null {
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain || COMMON_DOMAINS.includes(domain)) return null;

  // 1) Whole domain is close to a well-known provider (gmial.com, hotmial.com).
  let best: { domain: string; distance: number } | null = null;
  for (const candidate of COMMON_DOMAINS) {
    const distance = editDistance(domain, candidate);
    const allowed = candidate.length <= 8 ? 1 : 2;
    if (distance > 0 && distance <= allowed && (!best || distance < best.distance)) best = { domain: candidate, distance };
  }
  if (best) return `${local}@${best.domain}`;

  // 2) Unknown domain whose ending is a near-miss of a common one (.con, .comm, .cim, .c0m, .co.t).
  const dot = domain.indexOf(".");
  if (dot > 0) {
    const name = domain.slice(0, dot);
    const ending = domain.slice(dot + 1);
    if (!COMMON_ENDINGS.includes(ending)) {
      for (const candidate of COMMON_ENDINGS) {
        if (editDistance(ending, candidate) === 1) return `${local}@${name}.${candidate}`;
      }
    }
  }
  return null;
}

export function emailsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
