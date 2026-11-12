import { isSocialPlaceholderEmail } from "@shared/socialAuth";

/** Owner decision 2026-11-11: an account made through LINE or Facebook adds and confirms a real email before using the app. */
export function mustAddRealEmail(me: { email?: string | null } | null | undefined): boolean {
  return Boolean(me) && isSocialPlaceholderEmail(me?.email);
}

const PENDING_TOKEN_KEY = "hayhost.addRealEmailToken";
const PENDING_LINK_KEY = "hayhost.linkAfterSignIn";

/**
 * Owner decision 2026-11-12: when a Facebook email already has an account, the person signs in to that account and
 * Facebook is linked to it. The wish survives the sign-in here; it does nothing on its own, because linking needs
 * the person to be signed in to the existing account and to approve Facebook again.
 */
export function rememberLinkAfterSignIn(provider: "facebook") {
  try { localStorage.setItem(PENDING_LINK_KEY, provider); } catch { /* storage blocked: they can link on the Security page */ }
}

export function takeLinkAfterSignIn(): "facebook" | null {
  try {
    const provider = localStorage.getItem(PENDING_LINK_KEY);
    localStorage.removeItem(PENDING_LINK_KEY);
    return provider === "facebook" ? provider : null;
  } catch {
    return null;
  }
}

export function hasLinkAfterSignIn() {
  try { return localStorage.getItem(PENDING_LINK_KEY) === "facebook"; } catch { return false; }
}
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** The token from a /confirm-email?token=… link, or null when the link is broken. */
export function emailTokenFromSearch(search: string): string | null {
  const token = new URLSearchParams(search).get("token");
  return token && TOKEN_PATTERN.test(token) ? token : null;
}

/**
 * The link may be opened while signed out. The token is kept here across the sign-in, then used once by the
 * add-email screen. It is useless on its own: the server accepts it only from the account that asked for it.
 */
export function rememberEmailToken(token: string) {
  try {
    localStorage.setItem(PENDING_TOKEN_KEY, token);
  } catch {
    // Storage blocked: the person can still open the link again after signing in.
  }
}

export function takeEmailToken(): string | null {
  try {
    const token = localStorage.getItem(PENDING_TOKEN_KEY);
    localStorage.removeItem(PENDING_TOKEN_KEY);
    return token && TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    return null;
  }
}
