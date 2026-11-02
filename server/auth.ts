import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins/two-factor";
import { bearer } from "better-auth/plugins/bearer";
import { APIError } from "better-auth/api";
import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types/index.ts";
import { authSchema } from "../drizzle/auth-schema";
import { isSocialPlaceholderEmail } from "../shared/socialAuth";
import { ResendEmailSender, type EmailSender } from "./email";
import { isSocialCallback, requireTwoFactorOnSocialCallback, resolveSocialProviders } from "./socialAuth";

export type CreateAuthOptions = {
  db: D1Database | any;
  baseURL?: string;
  secret?: string;
  emailSender?: EmailSender;
  /** Where OAuth client ids and secrets come from; tests pass their own. */
  socialEnv?: Record<string, string | undefined>;
  /** Defaults to whether a real mail provider is set up. */
  requireEmailVerification?: boolean;
};

const EMAIL_VERIFICATION_SECONDS = 24 * 60 * 60;

/**
 * Detects whether the input is already a Drizzle database instance (e.g., in unit tests)
 * or a raw Cloudflare D1 database binding.
 */
function resolveDrizzleDatabase(db: D1Database | any) {
  if (db && typeof db.select === "function") {
    return db;
  }
  return drizzle(db as D1Database, { schema: authSchema });
}

/** Sessions signed with a published secret can be forged, so only local runs may fall back. */
export function resolveAuthSecret(explicitSecret?: string) {
  const env = typeof process !== "undefined" ? process.env : undefined;
  const secret = explicitSecret || env?.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (env?.NODE_ENV === "development" || env?.NODE_ENV === "test") {
    return "dev-insecure-secret-minimum-32-chars-key!!";
  }
  throw new Error("BETTER_AUTH_SECRET is not configured.");
}

/** Better Auth defaults to `/`; people need the sign-in page next, because the link opens no session. */
export function verificationLink(url: string) {
  const link = new URL(url);
  if (link.searchParams.get("callbackURL") === "/") link.searchParams.set("callbackURL", "/login?verified=1");
  return link.toString();
}

export function createAuth(options: CreateAuthOptions | (D1Database | any)) {
  const opts: CreateAuthOptions =
    options && typeof options === "object" && "db" in options
      ? (options as CreateAuthOptions)
      : { db: options };

  const drizzleDb = resolveDrizzleDatabase(opts.db);
  const baseURL =
    opts.baseURL ||
    (typeof process !== "undefined" ? process.env?.PUBLIC_APP_URL : undefined) ||
    "http://localhost:3000";
  const secret = resolveAuthSecret(opts.secret);
  // ASSUMPTION: enforced only with a real mail provider, because the mock sender drops every
  // message and would leave each unverified account, the superadmin included, unable to sign in.
  const requireEmailVerification = opts.requireEmailVerification ?? opts.emailSender instanceof ResendEmailSender;

  return betterAuth({
    baseURL,
    secret,
    database: drizzleAdapter(drizzleDb, {
      provider: "sqlite",
      schema: authSchema,
    }),
    user: {
      additionalFields: {
        firstName: { type: "string", required: false, input: true },
        lastName: { type: "string", required: false, input: true },
        phone: { type: "string", required: false, input: true },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification,
      // A reset ends every other session, so a stolen session cannot outlive it.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        if (!opts.emailSender || isSocialPlaceholderEmail(user.email)) return;
        try {
          await opts.emailSender.sendPasswordResetEmail({
            to: user.email,
            resetUrl: url,
            userName: user.name,
          });
        } catch (error) {
          // A send error only happens for a real account, so surfacing it would
          // tell anyone which emails are registered.
          console.error("[Auth] Password reset email failed:", error instanceof Error ? error.message : error);
        }
      },
    },
    emailVerification: {
      sendOnSignUp: requireEmailVerification,
      // An unverified account that knows its password gets a fresh link, so it is never stuck.
      sendOnSignIn: true,
      // ASSUMPTION: the link only marks the email. A login from it would skip the password and 2FA.
      autoSignInAfterVerification: false,
      expiresIn: EMAIL_VERIFICATION_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        if (!opts.emailSender || isSocialPlaceholderEmail(user.email)) return;
        try {
          await opts.emailSender.sendVerificationEmail({ to: user.email, verifyUrl: verificationLink(url) });
        } catch (error) {
          console.error("[Auth] Verification email failed:", error instanceof Error ? error.message : error);
        }
      },
    },
    socialProviders: resolveSocialProviders(opts.socialEnv ?? (typeof process !== "undefined" ? process.env : {})),
    account: {
      accountLinking: {
        enabled: true,
        // Both sides must be verified to join by email. An unverified signup proves nothing, so
        // without this someone could register a victim's address and keep their own password.
        requireLocalEmailVerified: true,
        // For signed-in linking only: these providers state no verified email, and they can never
        // match an account by email because socialUserIdentity gives them a placeholder.
        trustedProviders: ["facebook", "line"],
        allowDifferentEmails: true,
      },
      encryptOAuthTokens: true,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            if (isSocialPlaceholderEmail(user.email) && !isSocialCallback(ctx)) {
              throw new APIError("BAD_REQUEST", { message: "This email address cannot be used." });
            }
          },
        },
      },
      session: {
        create: {
          before: async (session, ctx) => {
            await requireTwoFactorOnSocialCallback(session.userId, ctx as never);
          },
        },
      },
    },
    plugins: [
      twoFactor({
        issuer: "HayHost",
      }),
      bearer(),
    ],
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
