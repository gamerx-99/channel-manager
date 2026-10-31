import { assertStaffPermissionChange } from "./staffAuthorization";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, like, or } from "drizzle-orm";
import { hotelUsers, hotels, platformAdmins, supportAccounts } from "../../drizzle/d1-schema";
import { user, verification, account, session, twoFactor } from "../../drizzle/auth-schema";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import { ASSIGNABLE_STAFF_ROLES, type AppRole, type HumanRole } from "@shared/authorization";
import { resolveMembershipPermissions } from "@shared/permissions";
import { isActivePlatformAdmin } from "./platformAdmins";
import { createHotelUserAssignment } from "./staff";
import type { EmailSender } from "../email";
import { generateSignupToken } from "../signupLinks";
import { hashPassword } from "better-auth/crypto";

export interface InviteStaffUserInput {
  hotel_id: string;
  email: string;
  role: HumanRole;
}

export function resolveAppUrl(overrideUrl?: string): string {
  if (overrideUrl) return overrideUrl;
  if (typeof process !== "undefined" && process.env?.PUBLIC_APP_URL) {
    return process.env.PUBLIC_APP_URL;
  }
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return "https://channel-manager-seven-blue.vercel.app";
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

    // Anyone can register any address, so an unverified account proves nothing:
    // grant the role only after the emailed token is used.
    if (!existingUser.emailVerified) {
      const token = generateSignupToken();
      const identifier = `hotel-invite:${input.hotel_id}:${input.role}:${caller.userId}:${normalizedEmail}`;
      const verificationId = crypto.randomUUID();
      // A new invite replaces any earlier one, including one for another role.
      const pendingInvites = await db
        .select({ id: verification.id, identifier: verification.identifier })
        .from(verification)
        .where(like(verification.identifier, `hotel-invite:${input.hotel_id}:%`));
      for (const pending of pendingInvites.filter(row => row.identifier.endsWith(`:${normalizedEmail}`))) {
        await db.delete(verification).where(eq(verification.id, pending.id));
      }
      await db.insert(verification).values({
        id: verificationId,
        identifier,
        value: token,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
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
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
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
  // to prevent race conditions on concurrent acceptance requests.
  const [record] = await db
    .delete(verification)
    .where(and(
      eq(verification.value, input.token),
      gt(verification.expiresAt, now),
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
      await assertPendingHotelInviteValid(db, { hotelId, role, inviterId, userId: targetUser.id });
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

/** Re-checks at accept time, because the invite may be up to seven days old. */
async function assertPendingHotelInviteValid(
  db: D1ScopedDatabase,
  invite: { hotelId: string; role: string; inviterId: string; userId: string },
) {
  const invalid = () => new TRPCError({ code: "CONFLICT", message: "This invitation is no longer valid. Please ask the hotel for a new one." });

  if (!ASSIGNABLE_STAFF_ROLES.includes(invite.role as typeof ASSIGNABLE_STAFF_ROLES[number])) throw invalid();

  const [inviter] = await db
    .select()
    .from(hotelUsers)
    .where(and(eq(hotelUsers.hotelId, invite.hotelId), eq(hotelUsers.userId, invite.inviterId)))
    .limit(1);
  const inviterCanManage = inviter && resolveMembershipPermissions(inviter.role as AppRole, {
    grants: inviter.permissionGrants,
    revokes: inviter.permissionRevokes,
  }).includes("property.manage_staff");
  if (!inviterCanManage && !(await isActivePlatformAdmin(db, invite.inviterId))) throw invalid();

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
