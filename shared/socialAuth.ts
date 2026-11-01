export const SOCIAL_PROVIDER_IDS = ["google", "facebook", "line"] as const;
export type SocialProviderId = (typeof SOCIAL_PROVIDER_IDS)[number];

/** `.invalid` is reserved (RFC 2606), so no mailbox can exist here and nobody can prove they own one. */
const SOCIAL_PLACEHOLDER_DOMAIN = "no-email.hayhost.invalid";

export function socialPlaceholderEmail(provider: SocialProviderId, subject: string) {
  return `${provider}.${subject.toLowerCase()}@${SOCIAL_PLACEHOLDER_DOMAIN}`;
}

export function isSocialPlaceholderEmail(email: string | null | undefined) {
  return Boolean(email?.toLowerCase().endsWith(`@${SOCIAL_PLACEHOLDER_DOMAIN}`));
}
