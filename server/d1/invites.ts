import { assertStaffPermissionChange } from "./staffAuthorization";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, like, or } from "drizzle-orm";
import { hotelUsers, hotels, platformAdmins, supportAccounts } from "../../drizzle/d1-schema";
import { user, verification, account, session, twoFactor } from "../../drizzle/auth-schema";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import { ASSIGNABLE_STAFF_ROLES, type AppRole, type HumanRole } from "@shared/authorization";
import { isActivePlatformAdmin } from "./platformAdmins";
import { createHotelUserAssignment } from "./staff";
import type { EmailSender } from "../email";
import { generateSignupToken } from "../signupLinks";
import { hashPassword } from "better-auth/crypto";
import { resolveAppUrl } from "../appUrl";

/**
 * Staff invitation links are valid for 24 hours from being sent; the previous
 * 7-day window was too long for a property team invite.
 */
export const STAFF_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export { resolveAppUrl } from "../appUrl";

export interface InviteStaffUserInput {
  hotel_id: string;
  email: string;
  role: HumanRole;
}

export async function inviteStaffUser(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  emailSender: EmailSender,
  input: InviteStaffUserInput,
  appUrl?: string,
  now = new Date(),
) {
  const actor = await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_staff", "staff.invite", now);

  if (!ASSIGNABLE_STAFF_ROLES.includes(input.role as typeof ASSIGNABLE_STAFF_ROLES[number])) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Role cannot be assigned to hotel staff." });
  }

  assertStaffPermissionChange(actor, "new-invite", input.role);

  const [hotel] = await db
    .select({ id: hotels.id, name: hotels.name })
    .from(hotels)
    .where(eq(hotels.id, input.hotel_id))
    .limit(1);
  if (!hotel) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Hotel not found." });
  }

  if (input.role === "hotel_owner") {
    const existingOwners = await db
      .select({ id: hotelUsers.id })
      .from(hotelUsers)
      .where(and(eq(hotelUsers.hotelId, input.hotel_id), eq(hotelUsers.role, "hotel_owner")));
    if (existingOwners.length > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "This hotel already has a Hotel Admin assigned." });
    }
  }

  const normalizedEmail = input.email.trim().toLowerCase();

  // Check if auth user exists
  const [existingUser] = await db
    .select({ id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.email, normalizedEmail))
    .limit(1);

  if (existingUser) {
    // Check if membership already exists for this hotel
    const [existingMembership] = await db
      .select({ id: hotelUsers.id })
      .from(hotelUsers)
      .where(and(eq(hotelUsers.hotelId, input.hotel_id), eq(hotelUsers.userId, existingUser.id)))
      .limit(1);

    if (existingMembership) {
      throw new TRPCError({ code: "CONFLICT", message: "This user is already assigned to the selected hotel." });
    }

    // A new invite replaces any earlier one, including one for another role.
    const pendingInvites = await db
      .select({ id: verification.id, identifier: verification.identifier })
      .from(verification)
      .where(like(verification.identifier, `hotel-invite:${input.hotel_id}:%`));
    for (const pending of pendingInvites.filter(row => row.identifier.endsWith(`:${normalizedEmail}`))) {
      await db.delete(verification).where(eq(verification.id, pending.id));
    }

    // Anyone can register any address, so an unverified account proves nothing:
    // grant the role only after the emailed token is used.
    if (!existingUser.emailVerified) {
      const token = generateSignupToken();
      const identifier = `hotel-invite:${input.hotel_id}:${input.role}:${caller.userId}:${normalizedEmail}`;
      const verificationId = crypto.randomUUID();
      await db.insert(verification).values({
        id: verificationId,
        identifier,
        value: token,
        expiresAt: new Date(now.getTime() + STAFF_INVITE_TTL_MS),
        createdAt: now,
        updatedAt: now,
      });
      try {
        await emailSender.sendInviteEmail({
          to: normalizedEmail,
          hotelName: hotel.name,
          inviteUrl: `${resolveAppUrl(appUrl)}/accept-invite?token=${token}`,
          roleName: input.role,
        });
      } catch (emailError) {
        try {
          await db.delete(verification).where(eq(verification.id, verificationId));
        } catch {
          // Preserve original email error
        }
        throw emailError;
      }

      return {
        user: { id: existingUser.id, email: existingUser.email },
        membership: null,
        invitationSent: true,
        isNewUser: false,
      };
    }

    const membership = await createHotelUserAssignment(
      db,
      caller,
      {
        hotel_id: input.hotel_id,
        user_id: existingUser.id,
        role: input.role,
      },
      now,
    );

    const baseUrl = resolveAppUrl(appUrl);
    try {
      await emailSender.sendInviteEmail({
        to: normalizedEmail,
        hotelName: hotel.name,
        inviteUrl: `${baseUrl}/login`,
        roleName: input.role,
      });
    } catch (emailError) {
      // Rollback membership assignment if invitation email delivery fails for existing user
      try {
        await db
          .delete(hotelUsers)
          .where(and(eq(hotelUsers.hotelId, input.hotel_id), eq(hotelUsers.userId, existingUser.id)));
      } catch {
        // Preserve original email error
      }
      throw emailError;
    }

    return {
      user: { id: existingUser.id, email: existingUser.email },
      membership,
      invitationSent: true,
      isNewUser: false,
    };
  }

  // Create new user & invite token with rollback protection
  const newUserId = crypto.randomUUID();
  const inviteToken = generateSignupToken();
  const expiresAt = new Date(now.getTime() + STAFF_INVITE_TTL_MS); // 24 hours
  const verificationId = crypto.randomUUID();

  await db.insert(user).values({
    id: newUserId,
    name: normalizedEmail.split("@")[0] || "Staff Member",
    email: normalizedEmail,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });

  try {
    await db.insert(verification).values({
      id: verificationId,
      identifier: `invite:${normalizedEmail}`,
      value: inviteToken,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    const membership = await createHotelUserAssignment(
      db,
      caller,
      {
        hotel_id: input.hotel_id,
        user_id: newUserId,
        role: input.role,
      },
      now,
    );

    const baseUrl = resolveAppUrl(appUrl);
    const inviteUrl = `${baseUrl}/accept-invite?token=${inviteToken}`;

    await emailSender.sendInviteEmail({
      to: normalizedEmail,
      hotelName: hotel.name,
      inviteUrl,
      roleName: input.role,
    });

    return {
      user: { id: newUserId, email: normalizedEmail },
      membership,
      invitationSent: true,
      isNewUser: true,
    };
  } catch (error) {
    // Child-to-parent rollback order: hotelUsers -> verification -> user
    try {
      await db
        .delete(hotelUsers)
        .where(and(eq(hotelUsers.hotelId, input.hotel_id), eq(hotelUsers.userId, newUserId)));
    } catch {
      // Ignore cleanup error to preserve primary error
    }
    try {
      await db.delete(verification).where(eq(verification.id, verificationId));
    } catch {
      // Ignore cleanup error
    }
    try {
      await db.delete(user).where(eq(user.id, newUserId));
    } catch {
      // Ignore cleanup error
    }
    throw error;
  }
}

export type HotelStaffInviteStatus = "pending" | "expired" | "cancelled";

export interface HotelStaffInviteRecord {
  id: string;
  email: string;
  role: string;
  status: HotelStaffInviteStatus;
  expires_at: string;
  created_at: string;
  cancelled_at: string | null;
}

const HOTEL_INVITE_IDENTIFIER = /^hotel-invite:([^:]+):([^:]+):([^:]+):(.+)$/;

function parseHotelInviteIdentifier(identifier: string) {
  const match = HOTEL_INVITE_IDENTIFIER.exec(identifier);
  if (!match) return null;
  return { hotelId: match[1]!, role: match[2]!, inviterId: match[3]!, email: match[4]! };
}

/**
 * Invalidate every still-pending invite token for one hotel and email address so
 * the previous link stops working immediately; a new link gets a fresh 24h window.
 */
async function invalidatePendingHotelInvites(db: D1ScopedDatabase, hotelId: string, email: string, now: Date) {
  const rows = await db
    .select({ id: verification.id, identifier: verification.identifier, cancelledAt: verification.cancelledAt })
    .from(verification)
    .where(or(
      like(verification.identifier, `hotel-invite:${hotelId}:%`),
      eq(verification.identifier, `invite:${email}`),
    ));
  for (const row of rows) {
    const invite = parseHotelInviteIdentifier(row.identifier);
    if (invite && invite.email !== email) continue;
    if (row.cancelledAt) continue;
    await db.update(verification).set({ cancelledAt: now, updatedAt: now }).where(eq(verification.id, row.id));
  }
}

/** Every staff invite for one hotel, with the derived status awaiting acceptance. */
export async function listHotelStaffInvites(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()): Promise<HotelStaffInviteRecord[]> {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_staff", "staff.invite.list", now);
  const rows = await db.select().from(verification).where(or(
    like(verification.identifier, `hotel-invite:${hotelId}:%`),
    like(verification.identifier, "invite:%"),
  ));
  const invites: HotelStaffInviteRecord[] = [];
  for (const row of rows) {
    let email: string;
    let role: string;
    const hotelInvite = parseHotelInviteIdentifier(row.identifier);
    if (hotelInvite) {
      if (hotelInvite.hotelId !== hotelId) continue;
      email = hotelInvite.email;
      role = hotelInvite.role;
    } else if (row.identifier.startsWith("invite:")) {
      email = row.identifier.replace(/^invite:/, "");
      const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
      if (!u) continue;
      const [mem] = await db.select({ role: hotelUsers.role }).from(hotelUsers).where(and(eq(hotelUsers.hotelId, hotelId), eq(hotelUsers.userId, u.id))).limit(1);
      if (!mem && !row.cancelledAt) continue;
      role = mem?.role ?? "front_desk";
    } else {
      continue;
    }
    const cancelledAt = row.cancelledAt ? new Date(row.cancelledAt).toISOString() : null;
    const expired = new Date(row.expiresAt).getTime() <= now.getTime();
    invites.push({
      id: row.id,
      email,
      role,
      status: (cancelledAt ? "cancelled" : expired ? "expired" : "pending") as HotelStaffInviteStatus,
      expires_at: new Date(row.expiresAt).toISOString(),
      created_at: new Date(row.createdAt).toISOString(),
      cancelled_at: cancelledAt,
    });
  }
  return invites.sort((left, right) => right.created_at.localeCompare(left.created_at));
}

/** Cancel a pending staff invite; the link is refused from that moment on. */
export async function cancelHotelStaffInvite(db: D1ScopedDatabase, caller: D1CallerContext, input: { hotel_id: string; email: string; role?: string }, now = new Date()) {
  await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_staff", "staff.invite.cancel", now);
  const normalizedEmail = input.email.trim().toLowerCase();
  const rows = await db
    .select({ id: verification.id, identifier: verification.identifier, cancelledAt: verification.cancelledAt })
    .from(verification)
    .where(or(
      like(verification.identifier, `hotel-invite:${input.hotel_id}:%`),
      eq(verification.identifier, `invite:${normalizedEmail}`),
    ));
  let cancelled = 0;
  for (const row of rows) {
    const invite = parseHotelInviteIdentifier(row.identifier);
    if (invite && invite.email !== normalizedEmail) continue;
    if (row.cancelledAt) continue;
    await db.update(verification).set({ cancelledAt: now, updatedAt: now }).where(eq(verification.id, row.id));
    cancelled += 1;
  }
  const [targetUser] = await db.select({ id: user.id, emailVerified: user.emailVerified }).from(user).where(eq(user.email, normalizedEmail)).limit(1);
  if (targetUser && !targetUser.emailVerified) {
    await db.delete(hotelUsers).where(and(eq(hotelUsers.hotelId, input.hotel_id), eq(hotelUsers.userId, targetUser.id)));
  }
  return { cancelled };
}

/**
 * Re-issue a hotel staff invite: the previous pending link is invalidated at once
 * and the fresh link is valid for 24 hours. Only pending (unverified) invites are
 * re-sent; an address that already holds the membership is refused.
 */
export async function resendHotelStaffInvite(db: D1ScopedDatabase, caller: D1CallerContext, emailSender: EmailSender, input: { hotel_id: string; email: string; role: HumanRole }, appUrl?: string, now = new Date()) {
  const actor = await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_staff", "staff.invite.resend", now);
  if (!ASSIGNABLE_STAFF_ROLES.includes(input.role as typeof ASSIGNABLE_STAFF_ROLES[number])) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Role cannot be assigned to hotel staff." });
  }
  assertStaffPermissionChange(actor, "staff.invite.resend", input.role);

  const normalizedEmail = input.email.trim().toLowerCase();
  const [existingUser] = await db.select({ id: user.id, email: user.email, emailVerified: user.emailVerified }).from(user).where(eq(user.email, normalizedEmail)).limit(1);
  if (existingUser) {
    const [existingMembership] = await db.select({ id: hotelUsers.id }).from(hotelUsers).where(and(eq(hotelUsers.hotelId, input.hotel_id), eq(hotelUsers.userId, existingUser.id))).limit(1);
    if (existingMembership && existingUser.emailVerified) {
      throw new TRPCError({ code: "CONFLICT", message: "This user is already assigned to the selected hotel." });
    }
    if (existingUser.emailVerified) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This address already verified, so a staff invitation is not needed." });
    }
    if (existingMembership && !existingUser.emailVerified) {
      await db.delete(hotelUsers).where(eq(hotelUsers.id, existingMembership.id));
    }
  }
  const [hotel] = await db.select({ id: hotels.id, name: hotels.name }).from(hotels).where(eq(hotels.id, input.hotel_id)).limit(1);
  if (!hotel) throw new TRPCError({ code: "NOT_FOUND", message: "Hotel not found." });

  const newUserId = existingUser?.id ?? crypto.randomUUID();
  if (!existingUser) {
    await db.insert(user).values({ id: newUserId, name: normalizedEmail.split("@")[0] || "Staff Member", email: normalizedEmail, emailVerified: false, createdAt: now, updatedAt: now });
  }

  await invalidatePendingHotelInvites(db, input.hotel_id, normalizedEmail, now);
  const inviteToken = generateSignupToken();
  const expiresAt = new Date(now.getTime() + STAFF_INVITE_TTL_MS);
  const verificationId = crypto.randomUUID();
  await db.insert(verification).values({
    id: verificationId,
    identifier: `hotel-invite:${input.hotel_id}:${input.role}:${actor.userId}:${normalizedEmail}`,
    value: inviteToken,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
  try {
    await emailSender.sendInviteEmail({
      to: normalizedEmail,
      hotelName: hotel!.name,
      inviteUrl: `${resolveAppUrl(appUrl)}/accept-invite?token=${inviteToken}`,
      roleName: input.role,
    });
  } catch (emailError) {
    try { await db.delete(verification).where(eq(verification.id, verificationId)); } catch { /* preserve original email error */ }
    throw emailError;
  }
  return { user: { id: newUserId, email: normalizedEmail }, invitationSent: true, inviteUrl: `${resolveAppUrl(appUrl)}/accept-invite?token=${inviteToken}` };
}

export async function acceptStaffInvite(
  db: D1ScopedDatabase,
  input: { token: string; password: string; name?: string },
  hashPasswordFn: (password: string) => Promise<string> = hashPassword,
  now = new Date(),
) {
  if (input.password.length < 8) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Password must be at least 8 characters long." });
  }

  // Atomically claim and invalidate single-use token BEFORE account creation
  // to prevent race conditions on concurrent acceptance requests. A cancelled
  // invite stops working immediately, so it is not claimable any more.
  const [record] = await db
    .delete(verification)
    .where(and(
      eq(verification.value, input.token),
      gt(verification.expiresAt, now),
      isNull(verification.cancelledAt),
      or(
        like(verification.identifier, "invite:%"),
        like(verification.identifier, "support-invite:%"),
        like(verification.identifier, "platform-invite:%"),
        like(verification.identifier, "hotel-invite:%"),
      ),
    ))
    .returning();

  const pendingHotelInvite = record && /^hotel-invite:([^:]+):([^:]+):([^:]+):(.+)$/.exec(record.identifier);
  if (!record || !(pendingHotelInvite || /^(support-|platform-)?invite:/.test(record.identifier))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation link is invalid or has expired." });
  }

  const isSupportInvite = record.identifier.startsWith("support-invite:");
  const isPlatformInvite = record.identifier.startsWith("platform-invite:");
  const email = pendingHotelInvite ? pendingHotelInvite[4] : record.identifier.replace(/^(support-|platform-)?invite:/, "");
  const [targetUser] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (!targetUser) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Invited user account not found." });
  }

  // Check if credential account already exists
  const [existingAccount] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, targetUser.id), eq(account.providerId, "credential")))
    .limit(1);

  if (existingAccount && !pendingHotelInvite) {
    throw new TRPCError({ code: "CONFLICT", message: "An account has already been set up for this user." });
  }

  // A verified owner already proved the address, so another hotel's invite must
  // not reset their password or 2FA. They keep their login and sign in as usual.
  const keepsCredentials = Boolean(pendingHotelInvite && existingAccount && targetUser.emailVerified);

  try {
    if (pendingHotelInvite) {
      const [, hotelId, role, inviterId] = pendingHotelInvite;
      await assertPendingHotelInviteValid(db, { hotelId, role, inviterId, userId: targetUser.id }, now);
    }

    if (!keepsCredentials) {
      const hashedPassword = await hashPasswordFn(input.password);
      if (existingAccount) {
        // The account was self-registered with an unproven address, so whoever
        // registered it may not be the person who received this invite. Remove
        // every credential they could still use before any role is granted.
        await db.update(account).set({ password: hashedPassword, updatedAt: now }).where(eq(account.id, existingAccount.id));
        await db.delete(session).where(eq(session.userId, targetUser.id));
        await db.delete(twoFactor).where(eq(twoFactor.userId, targetUser.id));
      } else {
        // Create credential account and verify user
        await db.insert(account).values({
          id: crypto.randomUUID(),
          userId: targetUser.id,
          accountId: targetUser.id,
          providerId: "credential",
          password: hashedPassword,
          createdAt: now,
          updatedAt: now,
        });
      }

      await db
        .update(user)
        .set({
          emailVerified: true,
          twoFactorEnabled: false,
          name: input.name || targetUser.name,
          updatedAt: now,
        })
        .where(eq(user.id, targetUser.id));
    }

    if (pendingHotelInvite) {
      const [, hotelId, role] = pendingHotelInvite;
      await db.insert(hotelUsers).values({ hotelId, userId: targetUser.id, role });
    }

    if (isSupportInvite) {
      await db.update(supportAccounts).set({ acceptedAt: now }).where(eq(supportAccounts.userId, targetUser.id));
    }
    if (isPlatformInvite) {
      await db.update(platformAdmins).set({ acceptedAt: now }).where(eq(platformAdmins.userId, targetUser.id));
    }
  } catch (accountError) {
    // Compensating restore if account creation unexpectedly fails
    try {
      await db.insert(verification).values({
        id: record.id,
        identifier: record.identifier,
        value: record.value,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
        updatedAt: now,
      });
    } catch {
      // Preserve original error
    }
    throw accountError;
  }

  return {
    success: true,
    signInRequired: keepsCredentials,
    user: { id: targetUser.id, email: targetUser.email },
  };
}

/** Re-checks at accept time, because the invite may be up to 24 hours old. */
async function assertPendingHotelInviteValid(
  db: D1ScopedDatabase,
  invite: { hotelId: string; role: string; inviterId: string; userId: string },
  now: Date,
) {
  const invalid = () => new TRPCError({ code: "CONFLICT", message: "This invitation is no longer valid. Please ask the hotel for a new one." });

  if (!ASSIGNABLE_STAFF_ROLES.includes(invite.role as typeof ASSIGNABLE_STAFF_ROLES[number])) throw invalid();

  // The inviter must still be allowed to grant this exact role.
  const isPlatformAdmin = await isActivePlatformAdmin(db, invite.inviterId);
  try {
    const actor = await authorizeHotelAction(
      db,
      { userId: invite.inviterId, roles: isPlatformAdmin ? ["super_admin"] : [], access: "authenticated" },
      invite.hotelId,
      "property.manage_staff",
      "staff.invite.accept",
      now,
    );
    assertStaffPermissionChange(actor, "new-invite", invite.role as AppRole);
  } catch (error) {
    if (error instanceof TRPCError && error.code === "FORBIDDEN") throw invalid();
    throw error;
  }

  const [membership] = await db
    .select({ id: hotelUsers.id })
    .from(hotelUsers)
    .where(and(eq(hotelUsers.hotelId, invite.hotelId), eq(hotelUsers.userId, invite.userId)))
    .limit(1);
  if (membership) throw invalid();

  if (invite.role === "hotel_owner") {
    const [owner] = await db
      .select({ id: hotelUsers.id })
      .from(hotelUsers)
      .where(and(eq(hotelUsers.hotelId, invite.hotelId), eq(hotelUsers.role, "hotel_owner")))
      .limit(1);
    if (owner) throw invalid();
  }
}
