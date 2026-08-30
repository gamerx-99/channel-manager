import { randomBytes } from 'node:crypto';

/** URL-safe, unguessable token for a single-use hotel-owner signup link. */
export function generateSignupToken() {
  return randomBytes(24).toString('base64url');
}

export type SignupLinkStatus = 'active' | 'expired' | 'used';

export function deriveSignupLinkStatus(link: { expires_at: string; used_at: string | null }, now = new Date()): SignupLinkStatus {
  if (link.used_at) return 'used';
  if (new Date(link.expires_at).getTime() <= now.getTime()) return 'expired';
  return 'active';
}
