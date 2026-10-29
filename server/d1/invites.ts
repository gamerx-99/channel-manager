import { TRPCError } from "@trpc/server";
import { and, eq, gt } from "drizzle-orm";
import { hotelUsers, hotels } from "../../drizzle/d1-schema";
import { user, verification, account } from "../../drizzle/auth-schema";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import { ASSIGNABLE_STAFF_ROLES, type HumanRole } from "@shared/authorization";
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
  await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_staff", "staff.invite", now);

  if (!ASSIGNABLE_STAFF_ROLES.includes(input.role as typeof ASSIGNABLE_STAFF_ROLES[number])) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Role cannot be assigned to hotel staff." });
  }

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
    .select({ id: user.id, email: user.email, name: user.name })
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
    .where(and(eq(verification.value, input.token), gt(verification.expiresAt, now)))
    .returning();

  if (!record || !record.identifier.startsWith("invite:")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation link is invalid or has expired." });
  }

  const email = record.identifier.replace(/^invite:/, "");
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

  if (existingAccount) {
    throw new TRPCError({ code: "CONFLICT", message: "An account has already been set up for this user." });
  }

  const hashedPassword = await hashPasswordFn(input.password);

  try {
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

    await db
      .update(user)
      .set({
        emailVerified: true,
        name: input.name || targetUser.name,
        updatedAt: now,
      })
      .where(eq(user.id, targetUser.id));
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
    user: { id: targetUser.id, email: targetUser.email },
  };
}
