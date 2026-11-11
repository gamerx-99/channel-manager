import { isSocialPlaceholderEmail } from "@shared/socialAuth";

/** Owner decision 2026-11-11: an account made through LINE or Facebook adds and confirms a real email before using the app. */
export function mustAddRealEmail(me: { email?: string | null } | null | undefined): boolean {
  return Boolean(me) && isSocialPlaceholderEmail(me?.email);
}

const PENDING_TOKEN_KEY = "hayhost.addRealEmailToken";
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
