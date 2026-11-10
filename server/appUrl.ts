/**
 * Canonical public app origin used in invite and booking links.
 */
export function resolveAppUrl(overrideUrl?: string): string {
  if (overrideUrl?.trim()) return overrideUrl.trim().replace(/\/+$/, "");
  if (typeof process !== "undefined" && process.env?.PUBLIC_APP_URL?.trim()) {
    return process.env.PUBLIC_APP_URL.trim().replace(/\/+$/, "");
  }
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
    return "http://localhost:8787";
  }
  return "https://www.hayhostth.com";
}
