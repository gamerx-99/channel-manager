import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { DELETED_USER_ID } from "@shared/accountDeletion";
import { hotelUsers, hotels, platformAdmins } from "../../drizzle/d1-schema";
import { user, verification } from "../../drizzle/auth-schema";
import type { AuthInstance } from "../auth";
import type { D1CallerContext, D1ScopedDatabase } from "../db/scope";

const MAX_PASSWORD_ATTEMPTS = 5;
const PASSWORD_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const attemptsIdentifier = (userId: string) => `account-delete-attempts:${userId}`;

export const blockedMessage = "Transfer your hotels to another staff member before deleting this account, or contact support to close them.";
export const lastAdminMessage = "You are the only platform administrator, so this account cannot be deleted.";

function selfId(caller: D1CallerContext) {
  if (!caller.userId || caller.access === "public") throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
  return caller.userId;
}

/** What stops this user deleting their own account. Empty hotels and false mean nothing does. */
export async function getAccountDeletionBlockers(db: D1ScopedDatabase, caller: D1CallerContext) {
  const userId = selfId(caller);
  const ownedHotels = await db.select({ id: hotels.id, name: hotels.name })
    .from(hotelUsers).innerJoin(hotels, eq(hotelUsers.hotelId, hotels.id))
    .where(and(eq(hotelUsers.userId, userId), eq(hotelUsers.role, "hotel_owner")));

  const admin = and(isNotNull(platformAdmins.acceptedAt), isNull(platformAdmins.disabledAt));
  const [ownAdmin] = await db.select({ id: platformAdmins.id }).from(platformAdmins).where(and(eq(platformAdmins.userId, userId), admin)).limit(1);
  const ownLegacy = await db.select({ id: hotelUsers.id }).from(hotelUsers).where(and(eq(hotelUsers.userId, userId), eq(hotelUsers.role, "super_admin"))).limit(1);
  let lastPlatformAdmin = false;
  if (ownAdmin || ownLegacy.length > 0) {
    const [otherAdmin] = await db.select({ id: platformAdmins.id }).from(platformAdmins).where(and(ne(platformAdmins.userId, userId), admin)).limit(1);
    const otherLegacy = await db.select({ id: hotelUsers.id }).from(hotelUsers).where(and(ne(hotelUsers.userId, userId), eq(hotelUsers.role, "super_admin"))).limit(1);
    lastPlatformAdmin = !otherAdmin && otherLegacy.length === 0;
  }
  return { ownedHotels, lastPlatformAdmin };
}

export function assertNotBlocked(blockers: Awaited<ReturnType<typeof getAccountDeletionBlockers>>) {
  if (blockers.ownedHotels.length > 0) throw new TRPCError({ code: "CONFLICT", message: blockedMessage });
  if (blockers.lastPlatformAdmin) throw new TRPCError({ code: "CONFLICT", message: lastAdminMessage });
}

/**
 * Better Auth's verifyPassword is a server call, so its HTTP rate limit does not apply. Without
 * this count a stolen session could guess the password here without limit.
 */
export async function checkAccountPassword(input: { auth: AuthInstance; db: D1ScopedDatabase; headers: Headers; userId: string; password: string; now?: Date }) {
  const { db, userId } = input;
  const now = input.now ?? new Date();
  const identifier = attemptsIdentifier(userId);
  const nowMs = now.getTime();
  const windowEnd = new Date(nowMs + PASSWORD_ATTEMPT_WINDOW_MS);
  const live = sql`"verification"."expires_at" > ${nowMs}`;

  // Counted before the check, in one statement, so parallel requests cannot share an attempt.
  const [counted] = await db.insert(verification)
    .values({ id: identifier, identifier, value: "1", expiresAt: windowEnd, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: verification.id, set: {
      value: sql`case when ${live} then cast("verification"."value" as integer) + 1 else 1 end`,
      expiresAt: sql`case when ${live} then "verification"."expires_at" else ${windowEnd.getTime()} end`,
      updatedAt: now,
    } })
    .returning({ value: verification.value });
  if (Number(counted?.value) > MAX_PASSWORD_ATTEMPTS) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many wrong passwords. Please wait 15 minutes and try again." });
  }

  try {
    await input.auth.api.verifyPassword({ headers: input.headers, body: { password: input.password } });
  } catch (error) {
    const status = (error as { status?: unknown; statusCode?: unknown } | null)?.status ?? (error as { statusCode?: unknown } | null)?.statusCode;
    if (status === "BAD_REQUEST" || status === 400) throw new TRPCError({ code: "BAD_REQUEST", message: "Incorrect password." });
    // An outage says nothing about the password, so give the attempt back.
    await db.update(verification).set({ value: sql`cast("verification"."value" as integer) - 1` }).where(eq(verification.id, identifier));
    throw error;
  }
}

/**
 * Deletes the caller's account and removes them from retained records, in one transaction.
 * The first statement holds the guards, so an owner role gained after the earlier check still
 * stops everything; each later statement runs only once the user row is gone.
 *
 * ASSUMPTION: bookings, guests, payments, message text and audit rows stay, without a link to
 * the person, because they are the hotel's records and may be legally required. How long they
 * must be kept is an open question; see .agent/OPEN_QUESTIONS.md.
 */
export async function deleteOwnAccount(db: D1ScopedDatabase, caller: D1CallerContext, now = new Date()) {
  const userId = selfId(caller);
  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
  if (!row) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
  const email = row.email.trim().toLowerCase();
  const nowMs = now.getTime();

  const gone = `not exists (select 1 from "user" where id = ?)`;
  const run = (query: string, ...params: unknown[]) => db.$client.prepare(`${query} and ${gone}`).bind(...params, userId);
  const anonymize = (table: string, column: string) => run(`update ${table} set ${column} = ? where ${column} = ?`, DELETED_USER_ID, userId);
  const clear = (table: string, column: string) => run(`update ${table} set ${column} = null where ${column} = ?`, userId);

  const activeAdmin = `accepted_at is not null and disabled_at is null`;
  await db.$client.batch([
    db.$client.prepare(`delete from "user" where id = ?
      and not exists (select 1 from hotel_users where user_id = ? and role = 'hotel_owner')
      and (
        not (exists (select 1 from platform_admins where user_id = ? and ${activeAdmin}) or exists (select 1 from hotel_users where user_id = ? and role = 'super_admin'))
        or exists (select 1 from platform_admins where user_id <> ? and ${activeAdmin})
        or exists (select 1 from hotel_users where user_id <> ? and role = 'super_admin')
      )`).bind(userId, userId, userId, userId, userId, userId),

    // The cascades cover these three; explicit so the outcome never rests on the pragma.
    run(`delete from session where user_id = ?`, userId),
    run(`delete from account where user_id = ?`, userId),
    run(`delete from two_factor where user_id = ?`, userId),

    run(`delete from verification where (value = ? or identifier = ? or identifier in (?, ?, ?)
      or (identifier like 'hotel-invite:%' and (instr(identifier, ?) > 0 or substr(identifier, -length(?)) = ?)))`,
      userId, attemptsIdentifier(userId), `invite:${email}`, `support-invite:${email}`, `platform-invite:${email}`,
      `:${userId}:`, `:${email}`, `:${email}`),

    run(`delete from hotel_users where user_id = ?`, userId),
    run(`delete from support_accounts where user_id = ?`, userId),
    run(`delete from platform_admins where user_id = ?`, userId),
    anonymize("support_accounts", "invited_by"),
    anonymize("platform_admins", "invited_by"),

    run(`update support_access_grants set revoked_at = ? where revoked_at is null and expires_at > ? and (support_user_id = ? or granted_by = ?)`, nowMs, nowMs, userId, userId),
    anonymize("support_access_grants", "support_user_id"),
    anonymize("support_access_grants", "granted_by"),

    // The action column is `path:{json}`, and the json can name this person.
    run(`update support_access_log set action = substr(action, 1, instr(action, ':{')) || '{"redacted":true}'
      where (instr(action, ?) > 0 or instr(lower(action), ?) > 0) and instr(action, ':{') > 0`, userId, email),
    anonymize("support_access_log", "support_user_id"),

    run(`update hotel_admin_audit_logs set actor_email = null where (actor_user_id = ? or lower(actor_email) = ?)`, userId, email),
    run(`update hotel_admin_audit_logs set details = '{}' where (actor_user_id = ? or previous_admin_user_id = ? or new_admin_user_id = ?)`, userId, userId, userId),
    anonymize("hotel_admin_audit_logs", "actor_user_id"),
    anonymize("hotel_admin_audit_logs", "previous_admin_user_id"),
    anonymize("hotel_admin_audit_logs", "new_admin_user_id"),

    anonymize("bookings", "created_by"),
    // Never null here: ota.ts revives a cancellation whose changed_by is null.
    anonymize("booking_status_log", "changed_by"),
    anonymize("messages", "sender_user_id"),
    clear("housekeeping_tasks", "assigned_to"),
    clear("room_housekeeping_status", "updated_by"),

    // An unused link can still claim a hotel, so it ends with the person who issued it.
    run(`update hotel_signup_links set expires_at = ? where created_by = ? and used_at is null and expires_at > ?`, nowMs, userId, nowMs),
    anonymize("hotel_signup_links", "created_by"),
    anonymize("hotel_signup_links", "used_by_user_id"),

    run(`update hotels set owner_contact = '' where lower(trim(owner_contact)) = ?`, email),
  ]);

  // D1 counts cascaded rows in meta.changes, so ask for the row instead of reading that count.
  const [remaining] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  if (remaining) {
    assertNotBlocked(await getAccountDeletionBlockers(db, caller));
    throw new TRPCError({ code: "CONFLICT", message: "Your account changed; reload and try again." });
  }
  return { success: true as const };
}
