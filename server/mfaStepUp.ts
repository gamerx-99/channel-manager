import { and, eq, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { verification } from "../drizzle/auth-schema";
import type { D1ScopedDatabase } from "./db/scope";
import type { AuthInstance } from "./auth";
import { DEFAULT_MFA_STEP_UP_WINDOW_MINUTES } from "./mfa";

/**
 * Better Auth checks a TOTP code for a signed-in user but records nothing, so
 * `requireRecentMfaVerification` had no proof to read. A successful step-up is
 * kept as a short-lived row in Better Auth's verification table, bound to one
 * session; the request context turns it into `session.twoFactorVerifiedAt`.
 */
const stepUpIdentifier = (sessionId: string) => `mfa-step-up:${sessionId}`;

export async function recordMfaStepUp(db: D1ScopedDatabase, sessionId: string, userId: string, now = new Date(), windowMinutes = DEFAULT_MFA_STEP_UP_WINDOW_MINUTES) {
  const identifier = stepUpIdentifier(sessionId);
  await db.delete(verification).where(eq(verification.identifier, identifier));
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier,
    value: userId,
    expiresAt: new Date(now.getTime() + windowMinutes * 60_000),
    createdAt: now,
    updatedAt: now,
  });
}

/** When this session last passed a step-up, or null when it never did or the window has passed. */
export async function getMfaStepUpVerifiedAt(db: D1ScopedDatabase, sessionId: string, userId: string, now = new Date()): Promise<Date | null> {
  const [row] = await db.select({ createdAt: verification.createdAt }).from(verification).where(and(
    eq(verification.identifier, stepUpIdentifier(sessionId)),
    eq(verification.value, userId),
    gt(verification.expiresAt, now),
  )).limit(1);
  return row?.createdAt ?? null;
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  return typeof status === "string" ? status : typeof statusCode === "number" ? String(statusCode) : null;
}

/** Check the code with Better Auth for the current session, then record the step-up. */
export async function verifyMfaStepUp(input: { auth: AuthInstance; db: D1ScopedDatabase; headers: Headers; sessionId: string; userId: string; code: string; now?: Date }) {
  try {
    await input.auth.api.verifyTOTP({ headers: input.headers, body: { code: input.code } });
  } catch (error) {
    const status = errorStatus(error);
    if (status === "TOO_MANY_REQUESTS" || status === "429") {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many wrong codes. Please wait a few minutes and try again." });
    }
    if (status === "UNAUTHORIZED" || status === "401" || status === "BAD_REQUEST" || status === "400") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Incorrect code. Wait for the next 6-digit code and try again." });
    }
    throw error;
  }
  await recordMfaStepUp(input.db, input.sessionId, input.userId, input.now);
}
