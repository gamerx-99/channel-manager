import { TRPCError } from "@trpc/server";
import { isSocialPlaceholderEmail } from "../shared/socialAuth";
import type { AuthInstance } from "./auth";

/** Rows in Better Auth's verification table; the prefix keeps them apart from its own tokens. */
const IDENTIFIER_PREFIX = "add-real-email:";
const LINK_SECONDS = 24 * 60 * 60;

function verificationIdentifier(token: string) {
  return `${IDENTIFIER_PREFIX}${token}`;
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

type PendingEmail = { userId: string; email: string };

function readPending(value: string): PendingEmail | null {
  try {
    const parsed = JSON.parse(value) as Partial<PendingEmail>;
    return typeof parsed.userId === "string" && typeof parsed.email === "string" ? { userId: parsed.userId, email: parsed.email } : null;
  } catch {
    return null;
  }
}

async function placeholderAccount(auth: AuthInstance, userId: string) {
  const context = await auth.$context;
  const account = await context.internalAdapter.findUserById(userId);
  if (!account) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
  if (!isSocialPlaceholderEmail(account.email)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This account already has an email address." });
  }
  return { context, account };
}

/**
 * Owner decision 2026-11-11: an account made through LINE or Facebook has only a placeholder email and must add a
 * real one, confirmed through a link, before using the app.
 *
 * Step 1 of 2: email a single-use link to the new address. Nothing changes on the account yet.
 *
 * Better Auth's own change-email link is not used: opening it signs in whoever holds the link, with no 2FA, so a
 * mistyped address would hand the account to a stranger. This link only works for the account that asked for it,
 * signed in (confirmRealEmail).
 */
export async function requestRealEmail(input: {
  auth: AuthInstance;
  userId: string;
  newEmail: string;
  appUrl: string;
}): Promise<{ status: true }> {
  const { context, account } = await placeholderAccount(input.auth, input.userId);
  const newEmail = input.newEmail.trim().toLowerCase();
  if (isSocialPlaceholderEmail(newEmail)) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a real email address." });

  // ASSUMPTION: an address that belongs to another account gets the same answer and no email, so this cannot be used
  // to find out who has an account (same rule as signup, decision sheet 2.4).
  if (await context.internalAdapter.findUserByEmail(newEmail)) return { status: true };

  const send = context.options.emailVerification?.sendVerificationEmail;
  if (!send) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Email sending is not set up." });
  const token = newToken();
  await context.internalAdapter.createVerificationValue({
    identifier: verificationIdentifier(token),
    value: JSON.stringify({ userId: account.id, email: newEmail } satisfies PendingEmail),
    expiresAt: new Date(Date.now() + LINK_SECONDS * 1000),
  });
  const url = `${input.appUrl.replace(/\/+$/, "")}/confirm-email?token=${token}`;
  await send({ user: { ...account, email: newEmail }, url, token });
  return { status: true };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The email Facebook holds for this account's Facebook sign-in, read on the server with the stored (encrypted)
 * token, so the browser can never supply an address of its choosing. Null when there is no Facebook sign-in,
 * the person did not share an email, or Facebook cannot be reached.
 */
export async function facebookEmailFor(auth: AuthInstance, userId: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const context = await auth.$context;
    const facebook = (await context.internalAdapter.findAccounts(userId)).find(row => row.providerId === "facebook");
    if (!facebook) return null;
    const tokens = await auth.api.getAccessToken({ body: { accountId: facebook.accountId, userId } });
    if (!tokens?.accessToken) return null;
    const response = await fetchImpl(`https://graph.facebook.com/me?fields=email&access_token=${encodeURIComponent(tokens.accessToken)}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    return EMAIL_PATTERN.test(email) && !isSocialPlaceholderEmail(email) ? email : null;
  } catch {
    return null;
  }
}

/** "Tanutcha S." — enough for the person to recognise their own account, without spelling out a full name. */
export function shortAccountName(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts.length === 1 ? parts[0]! : `${parts[0]} ${parts[parts.length - 1]![0]}.`;
}

export type SocialEmailMatch =
  | { kind: "none" }
  | { kind: "free"; email: string }
  | { kind: "taken"; email: string; accountName: string; signInMethods: string[] };

/**
 * Owner decision 2026-11-12: a Facebook sign-in brings its email along. A free address is used for the account; an
 * address that already has a hayhost account is never joined automatically (whoever put that address on a Facebook
 * profile would get the account). The person is asked to sign in to that account instead, and Facebook is linked
 * there, so one person keeps one account and one email.
 */
export async function socialEmailMatch(input: { auth: AuthInstance; userId: string; fetchImpl?: typeof fetch }): Promise<SocialEmailMatch> {
  const { context } = await placeholderAccount(input.auth, input.userId);
  const email = await facebookEmailFor(input.auth, input.userId, input.fetchImpl);
  if (!email) return { kind: "none" };
  const existing = await context.internalAdapter.findUserByEmail(email, { includeAccounts: true });
  if (!existing) return { kind: "free", email };
  return {
    kind: "taken",
    email,
    accountName: shortAccountName(existing.user.name),
    signInMethods: Array.from(new Set((existing.accounts ?? []).map(row => row.providerId))),
  };
}

/** Uses the Facebook email for this placeholder account when no other account has it. Re-reads it from Facebook. */
export async function useSocialEmail(input: { auth: AuthInstance; userId: string; fetchImpl?: typeof fetch }): Promise<{ email: string }> {
  const { context } = await placeholderAccount(input.auth, input.userId);
  const email = await facebookEmailFor(input.auth, input.userId, input.fetchImpl);
  if (!email) throw new TRPCError({ code: "BAD_REQUEST", message: "Facebook did not share an email for this account." });
  if (await context.internalAdapter.findUserByEmail(email)) {
    throw new TRPCError({ code: "CONFLICT", message: "This email already belongs to another account." });
  }
  // ASSUMPTION: Facebook does not state the address is verified, so it is stored as unverified (same rule as
  // socialUserIdentity); it is still the person's own Facebook email, and booking notices can use it.
  await context.internalAdapter.updateUser(input.userId, { email, emailVerified: false });
  return { email };
}

/**
 * Removes the account a Facebook/LINE sign-in has just made, when the person says they already have an account.
 * Only an account that still has a placeholder email and no hotel can be removed, so it can never reach a real one.
 */
export async function discardSocialSignup(input: { auth: AuthInstance; userId: string; hasHotels: boolean }): Promise<{ removed: true }> {
  const { context } = await placeholderAccount(input.auth, input.userId);
  if (input.hasHotels) throw new TRPCError({ code: "FORBIDDEN", message: "This account already has a hotel." });
  await context.internalAdapter.deleteUser(input.userId);
  return { removed: true };
}

/**
 * Step 2 of 2: the signed-in account opens its link. The email is set and marked verified only when the link belongs
 * to this same account, so a link opened by anyone else changes nothing and stays usable for its owner.
 */
export async function confirmRealEmail(input: { auth: AuthInstance; userId: string; token: string }): Promise<{ email: string }> {
  const { context } = await placeholderAccount(input.auth, input.userId);
  const identifier = verificationIdentifier(input.token);
  const expired = new TRPCError({ code: "BAD_REQUEST", message: "This link has expired or was already used. Ask for a new one." });
  const row = await context.internalAdapter.findVerificationValue(identifier);
  const pending = row && row.expiresAt > new Date() ? readPending(row.value) : null;
  if (!pending) throw expired;
  if (pending.userId !== input.userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sign in with the account that asked for this link." });
  }
  if (!(await context.internalAdapter.consumeVerificationValue(identifier))) throw expired;
  // The address was free when the link was sent; it may have been taken since.
  if (await context.internalAdapter.findUserByEmail(pending.email)) {
    throw new TRPCError({ code: "CONFLICT", message: "This email now belongs to another account. Use a different email." });
  }
  await context.internalAdapter.updateUser(input.userId, { email: pending.email, emailVerified: true });
  return { email: pending.email };
}
