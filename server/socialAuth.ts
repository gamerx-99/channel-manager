import { socialPlaceholderEmail, SOCIAL_PROVIDER_IDS, type SocialProviderId } from "../shared/socialAuth";

type SocialEnv = Record<string, string | undefined>;

const CREDENTIAL_NAMES: Record<SocialProviderId, { clientId: string; clientSecret: string }> = {
  google: { clientId: "GOOGLE_CLIENT_ID", clientSecret: "GOOGLE_CLIENT_SECRET" },
  facebook: { clientId: "FACEBOOK_CLIENT_ID", clientSecret: "FACEBOOK_CLIENT_SECRET" },
  line: { clientId: "LINE_CLIENT_ID", clientSecret: "LINE_CLIENT_SECRET" },
};

/** Better Auth keeps this cookie name private; verifyTotp reads the challenge from it. */
const TWO_FACTOR_COOKIE_NAME = "two_factor";
const TWO_FACTOR_CHALLENGE_SECONDS = 600;

function socialCredentials(provider: SocialProviderId, env: SocialEnv) {
  const names = CREDENTIAL_NAMES[provider];
  const clientId = env[names.clientId]?.trim();
  const clientSecret = env[names.clientSecret]?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** A provider needs both values, so a half-set secret hides its button instead of breaking sign-in. */
export function enabledSocialProviders(env: SocialEnv): SocialProviderId[] {
  return SOCIAL_PROVIDER_IDS.filter(provider => socialCredentials(provider, env));
}

/**
 * ASSUMPTION: only an email the provider states is verified is stored. Without this an
 * unverified provider email could claim someone else's address, and that person's later
 * password reset would share an account with whoever made it.
 */
export function socialUserIdentity(
  provider: SocialProviderId,
  profile: { subject: string; email?: string | null; emailVerified?: boolean | null },
) {
  if (profile.email && profile.emailVerified === true) {
    return { email: profile.email.toLowerCase(), emailVerified: true };
  }
  return { email: socialPlaceholderEmail(provider, profile.subject), emailVerified: false };
}

/** Only providers with credentials are registered with Better Auth. */
export function resolveSocialProviders(env: SocialEnv) {
  const google = socialCredentials("google", env);
  const facebook = socialCredentials("facebook", env);
  const line = socialCredentials("line", env);
  return {
    ...(google && {
      google: {
        ...google,
        mapProfileToUser: (profile: { sub: string; email?: string; email_verified?: boolean }) =>
          socialUserIdentity("google", {
            subject: profile.sub,
            email: profile.email,
            emailVerified: profile.email_verified,
          }),
      },
    }),
    ...(facebook && {
      facebook: {
        ...facebook,
        // Facebook's email is not stated as verified, so the permission would only add review work.
        disableDefaultScope: true,
        scope: ["public_profile"],
        mapProfileToUser: (profile: { id?: string; sub?: string }) =>
          socialUserIdentity("facebook", { subject: profile.id ?? profile.sub ?? "" }),
      },
    }),
    ...(line && {
      line: {
        ...line,
        // Same reason as Facebook; LINE also needs a separate approval to share email.
        disableDefaultScope: true,
        scope: ["openid", "profile"],
        mapProfileToUser: (profile: { sub: string }) => socialUserIdentity("line", { subject: profile.sub }),
      },
    }),
  };
}

type TwoFactorGateContext = {
  path?: string;
  context: {
    secret: string;
    createAuthCookie: (name: string, options: { maxAge: number }) => { name: string; attributes: object };
    internalAdapter: {
      findUserById: (id: string) => Promise<{ twoFactorEnabled?: boolean | null } | null>;
      createVerificationValue: (data: { value: string; identifier: string; expiresAt: Date }) => Promise<unknown>;
    };
  };
  setSignedCookie: (name: string, value: string, secret: string, attributes: object) => Promise<unknown>;
  redirect: (url: string) => Error;
};

export function isSocialCallback(ctx: { path?: string } | null | undefined) {
  return Boolean(ctx?.path?.startsWith("/callback/"));
}

/**
 * The twoFactor plugin only challenges credential sign-ins, so a social callback would log
 * straight in. This runs before the session row exists, and sends the person to the same
 * authenticator step the plugin uses, so a failure here cannot leave a session behind.
 */
export async function requireTwoFactorOnSocialCallback(userId: string, ctx: TwoFactorGateContext | null | undefined) {
  if (!ctx || !isSocialCallback(ctx)) return;
  const user = await ctx.context.internalAdapter.findUserById(userId);
  if (!user?.twoFactorEnabled) return;

  const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME, { maxAge: TWO_FACTOR_CHALLENGE_SECONDS });
  const identifier = `2fa-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + TWO_FACTOR_CHALLENGE_SECONDS * 1000);
  await ctx.context.internalAdapter.createVerificationValue({ value: userId, identifier, expiresAt });
  await ctx.context.internalAdapter.createVerificationValue({ value: "0", identifier: `2fa-attempts-${identifier}`, expiresAt });
  await ctx.setSignedCookie(cookie.name, identifier, ctx.context.secret, cookie.attributes);
  throw ctx.redirect("/login?two_factor=1");
}
