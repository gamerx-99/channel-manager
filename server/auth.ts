import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins/two-factor";
import { bearer } from "better-auth/plugins/bearer";
import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types/index.ts";
import { authSchema } from "../drizzle/auth-schema";
import type { EmailSender } from "./email";

export type CreateAuthOptions = {
  db: D1Database | any;
  baseURL?: string;
  secret?: string;
  emailSender?: EmailSender;
};

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
  const secret =
    opts.secret ||
    (typeof process !== "undefined" ? process.env?.BETTER_AUTH_SECRET : undefined) ||
    "dev-insecure-secret-minimum-32-chars-key!!";

  return betterAuth({
    baseURL,
    secret,
    database: drizzleAdapter(drizzleDb, {
      provider: "sqlite",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        if (opts.emailSender) {
          await opts.emailSender.sendPasswordResetEmail({
            to: user.email,
            resetUrl: url,
            userName: user.name,
          });
        }
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
