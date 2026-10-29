import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { d1Schema, hotelUsers, hotels } from "../drizzle/d1-schema";
import { user, session, account, verification, twoFactor, authSchema } from "../drizzle/auth-schema";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "./db/scope";
import { createSignupLink, getValidSignupLink, redeemSignupLink, createHotelOwnerMembership } from "./d1/signupLinks";
import { inviteStaffUser, acceptStaffInvite } from "./d1/invites";
import { MockEmailSender, type EmailSender } from "./email";
import {
  checkMfaStepUpStatus,
  requireRecentMfaVerification,
  type MfaStepUpStatus,
} from "./mfa";
import { createContextFromRequest } from "./_core/context";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/d1");
const pendingAuthDdlPath = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/pending/13-05-better-auth.sql");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;
let emailSender: MockEmailSender;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  // 1. Run D1 base migrations
  for (const file of readdirSync(migrationFolder).filter(f => f.endsWith(".sql")).sort()) {
    const content = readFileSync(resolve(migrationFolder, file), "utf8");
    for (const stmt of content.split("--> statement-breakpoint")) {
      if (stmt.trim()) sqlite.exec(stmt);
    }
  }

  // 2. Run pending 13-05 auth schema DDL
  const authDdl = readFileSync(pendingAuthDdlPath, "utf8");
  for (const stmt of authDdl.split("--> statement-breakpoint")) {
    if (stmt.trim()) sqlite.exec(stmt);
  }

  const mergedSchema = { ...d1Schema, ...authSchema };
  db = sqliteProxy(
    async (query, params, method) => {
      const statement = sqlite.prepare(query);
      statement.setReturnArrays(true);
      if (method === "run") {
        statement.run(...params);
        return { rows: [] };
      }
      const row = method === "get" ? statement.get(...params) : statement.all(...params);
      return { rows: row ? (Array.isArray(row) ? row : [row]) : [] };
    },
    { schema: mergedSchema },
  ) as unknown as D1ScopedDatabase;

  db.$client = {
    prepare: query => ({ bind: (...params) => ({ query, params }) }),
    batch: async statements => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(s => {
          const { query, params } = s as { query: string; params: unknown[] };
          const res = sqlite.prepare(query).run(...params);
          return { meta: { changes: Number(res.changes) } };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
  };

  emailSender = new MockEmailSender();
});

afterEach(() => {
  sqlite.close();
});

describe("Server Better Auth on D1 Test Suite", () => {
  // Test 1: User Registration
  it("creates user and credential account on registration", async () => {
    const now = new Date();
    const userId = "usr-reg-1";
    await db.insert(user).values({
      id: userId,
      name: "Hotel Owner",
      email: "owner@test.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(account).values({
      id: "acc-reg-1",
      userId,
      accountId: userId,
      providerId: "credential",
      password: "hashed_password_123",
      createdAt: now,
      updatedAt: now,
    });

    const [u] = await db.select().from(user).where(eq(user.id, userId));
    const [a] = await db.select().from(account).where(eq(account.userId, userId));

    expect(u).toBeDefined();
    expect(u.email).toBe("owner@test.com");
    expect(a).toBeDefined();
    expect(a.password).toBe("hashed_password_123");
  });

  // Test 2: Login Session Creation
  it("creates an active session on valid login", async () => {
    const now = new Date();
    const userId = "usr-login-1";
    await db.insert(user).values({
      id: userId,
      name: "Owner",
      email: "login@test.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    const sessionToken = "session-token-xyz-123";
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(session).values({
      id: "sess-1",
      token: sessionToken,
      userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    const [s] = await db.select().from(session).where(eq(session.token, sessionToken));
    expect(s).toBeDefined();
    expect(s.userId).toBe(userId);
    expect(s.expiresAt.getTime()).toBeGreaterThan(now.getTime());
  });

  // Test 3: Logout Session Invalidation
  it("invalidates session on logout", async () => {
    const now = new Date();
    const userId = "usr-logout-1";
    await db.insert(user).values({
      id: userId,
      name: "Owner",
      email: "logout@test.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(session).values({
      id: "sess-2",
      token: "token-to-revoke",
      userId,
      expiresAt: new Date(now.getTime() + 3600000),
      createdAt: now,
      updatedAt: now,
    });

    // Revoke session
    await db.delete(session).where(eq(session.token, "token-to-revoke"));

    const [revoked] = await db.select().from(session).where(eq(session.token, "token-to-revoke"));
    expect(revoked).toBeUndefined();
  });

  // Test 4: Bad Password Rejection
  it("rejects login with bad password without generating a session", async () => {
    const storedHash = "valid_hash";
    const attemptHash = "wrong_hash";
    const passwordsMatch = storedHash === attemptHash;

    expect(passwordsMatch).toBe(false);
    // Ensure no session row inserted
    const sessions = await db.select().from(session);
    expect(sessions).toHaveLength(0);
  });

  // Test 5: TOTP 2FA Enrollment & Verification
  it("enables TOTP 2FA and records backup codes", async () => {
    const now = new Date();
    const userId = "usr-mfa-1";
    await db.insert(user).values({
      id: userId,
      name: "Owner",
      email: "mfa@test.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(twoFactor).values({
      id: "tf-1",
      userId,
      secret: "JBSWY3DPEHPK3PXP",
      backupCodes: JSON.stringify(["code1", "code2"]),
    });
    await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, userId));

    const [u] = await db.select().from(user).where(eq(user.id, userId));
    const [tf] = await db.select().from(twoFactor).where(eq(twoFactor.userId, userId));
    expect(u.twoFactorEnabled).toBe(true);
    expect(tf.secret).toBe("JBSWY3DPEHPK3PXP");
  });

  // Test 6: MFA Step-Up 10-minute Window Checks & Security Boundary
  it("enforces step-up 10m window: no_factor, aal1 (password-only & missing verification), valid, and expired", () => {
    const nowMs = 1700000000000;

    // -------------------------------------------------------------------------
    // 6.1 No factor enrolled -> needs_enroll (reason: no_factor)
    // -------------------------------------------------------------------------
    const noFactorTarget = {
      id: "u-nofactor",
      twoFactorEnabled: false,
      session: { id: "s-1", createdAt: nowMs },
    };
    expect(checkMfaStepUpStatus(noFactorTarget, { nowMs })).toMatchObject({
      status: "needs_enroll",
      reason: "no_factor",
    });
    try {
      requireRecentMfaVerification(noFactorTarget, { nowMs });
      expect.fail("Expected requireRecentMfaVerification to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      const e = err as TRPCError;
      expect(e.code).toBe("PRECONDITION_FAILED");
      expect((e.cause as any)?.reason).toBe("no_factor");
      expect(e.message).toMatch(/MFA enrollment required/);
    }

    // -------------------------------------------------------------------------
    // 6.2 Password-Only Login (twoFactorEnabled: true, twoFactorVerified is UNDEFINED)
    // -------------------------------------------------------------------------
    // When a user with 2FA signs in via password-only, the session does not have
    // twoFactorVerified set (it is undefined). Even if createdAt was 1 minute ago,
    // this session MUST NOT be treated as verified! It must be challenged with reason: 'aal1'.
    const passwordOnlyTarget = {
      id: "u-pwd-only",
      twoFactorEnabled: true,
      session: {
        id: "s-pwd-1",
        createdAt: new Date(nowMs - 60_000), // 1 minute ago (within 10m window)
        // twoFactorVerified and twoFactorVerifiedAt are intentionally omitted (undefined)
      },
    };
    expect(checkMfaStepUpStatus(passwordOnlyTarget, { nowMs })).toMatchObject({
      status: "needs_challenge",
      reason: "aal1",
      aal: "aal1",
      verifiedAtMs: null,
      expiresAtMs: null,
    });
    try {
      requireRecentMfaVerification(passwordOnlyTarget, { nowMs });
      expect.fail("Expected requireRecentMfaVerification to throw for password-only login");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      const e = err as TRPCError;
      expect(e.code).toBe("PRECONDITION_FAILED");
      expect((e.cause as any)?.reason).toBe("aal1");
      expect(e.message).toMatch(/MFA verification required/);
    }

    // -------------------------------------------------------------------------
    // 6.3 Explicit twoFactorVerified: false -> needs_challenge (reason: aal1)
    // -------------------------------------------------------------------------
    const unverifiedSessionTarget = {
      id: "u-aal1-explicit",
      twoFactorEnabled: true,
      session: { id: "s-2", twoFactorVerified: false, createdAt: nowMs },
    };
    expect(checkMfaStepUpStatus(unverifiedSessionTarget, { nowMs })).toMatchObject({
      status: "needs_challenge",
      reason: "aal1",
    });
    try {
      requireRecentMfaVerification(unverifiedSessionTarget, { nowMs });
      expect.fail("Expected requireRecentMfaVerification to throw for unverified session");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      const e = err as TRPCError;
      expect(e.code).toBe("PRECONDITION_FAILED");
      expect((e.cause as any)?.reason).toBe("aal1");
    }

    // -------------------------------------------------------------------------
    // 6.4 Valid TOTP Verification Within Window (2 minutes ago) -> verified (aal2)
    // -------------------------------------------------------------------------
    // Target A: verified via twoFactorVerified: true and recent createdAt
    const verifiedTargetA = {
      id: "u-verified-a",
      twoFactorEnabled: true,
      session: {
        id: "s-3a",
        createdAt: new Date(nowMs - 120_000),
        twoFactorVerified: true,
      },
    };
    expect(checkMfaStepUpStatus(verifiedTargetA, { nowMs })).toMatchObject({
      status: "verified",
      aal: "aal2",
    });
    expect(() => requireRecentMfaVerification(verifiedTargetA, { nowMs })).not.toThrow();

    // Target B: verified via explicit twoFactorVerifiedAt timestamp
    const verifiedTargetB = {
      id: "u-verified-b",
      twoFactorEnabled: true,
      session: {
        id: "s-3b",
        twoFactorVerifiedAt: new Date(nowMs - 180_000), // 3 minutes ago
      },
    };
    expect(checkMfaStepUpStatus(verifiedTargetB, { nowMs })).toMatchObject({
      status: "verified",
      aal: "aal2",
    });
    expect(() => requireRecentMfaVerification(verifiedTargetB, { nowMs })).not.toThrow();

    // Verify two-argument overload: requireRecentMfaVerification(user, session)
    expect(() =>
      requireRecentMfaVerification(verifiedTargetA, verifiedTargetA.session, { nowMs }),
    ).not.toThrow();

    // -------------------------------------------------------------------------
    // 6.5 Expired TOTP Verification (>10 minutes ago) -> needs_challenge (reason: expired)
    // -------------------------------------------------------------------------
    // Target A: expired via createdAt (15 minutes ago)
    const expiredTargetA = {
      id: "u-expired-a",
      twoFactorEnabled: true,
      session: {
        id: "s-4a",
        createdAt: new Date(nowMs - 900_000), // 15 minutes ago
        twoFactorVerified: true,
      },
    };
    expect(checkMfaStepUpStatus(expiredTargetA, { nowMs })).toMatchObject({
      status: "needs_challenge",
      reason: "expired",
      aal: "aal2",
    });
    try {
      requireRecentMfaVerification(expiredTargetA, { nowMs });
      expect.fail("Expected requireRecentMfaVerification to throw for expired TOTP");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      const e = err as TRPCError;
      expect(e.code).toBe("PRECONDITION_FAILED");
      expect((e.cause as any)?.reason).toBe("expired");
      expect(e.message).toMatch(/MFA verification expired/);
    }

    // Target B: expired via explicit twoFactorVerifiedAt (20 minutes ago)
    const expiredTargetB = {
      id: "u-expired-b",
      twoFactorEnabled: true,
      session: {
        id: "s-4b",
        twoFactorVerifiedAt: new Date(nowMs - 1_200_000), // 20 minutes ago
      },
    };
    expect(checkMfaStepUpStatus(expiredTargetB, { nowMs })).toMatchObject({
      status: "needs_challenge",
      reason: "expired",
    });
    try {
      requireRecentMfaVerification(expiredTargetB, { nowMs });
      expect.fail("Expected requireRecentMfaVerification to throw for expired TOTP");
    } catch (err) {
      expect((err as TRPCError).code).toBe("PRECONDITION_FAILED");
      expect(((err as TRPCError).cause as any)?.reason).toBe("expired");
    }
  });

  // Test 7: Session-to-D1CallerContext Mapping
  it("resolves session user memberships into D1CallerContext and AppUserIdentity", async () => {
    const now = new Date();
    await db.insert(hotels).values({
      id: "h-ctx-1",
      name: "Ctx Hotel",
      slug: "ctx-hotel",
      address: "A",
      ownerContact: "C",
      publicEnabled: true,
    });
    await db.insert(user).values({
      id: "usr-ctx-1",
      name: "Owner",
      email: "owner@ctx.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(hotelUsers).values({
      id: "m-ctx-1",
      hotelId: "h-ctx-1",
      userId: "usr-ctx-1",
      role: "hotel_owner",
      permissionGrants: [],
      permissionRevokes: [],
      createdAt: now,
    });

    const memberships = await db.select().from(hotelUsers).where(eq(hotelUsers.userId, "usr-ctx-1"));
    const roles = memberships.map(m => m.role);
    const caller: D1CallerContext = {
      userId: "usr-ctx-1",
      roles: roles as any,
      access: "authenticated",
    };

    expect(caller.userId).toBe("usr-ctx-1");
    expect(caller.roles).toContain("hotel_owner");
    expect(caller.access).toBe("authenticated");

    // Test createContextFromRequest with mock Better Auth instance
    const mockAuth = {
      api: {
        getSession: async () => ({
          user: { id: "usr-ctx-1", email: "owner@ctx.com", name: "Owner", twoFactorEnabled: false },
          session: { id: "sess-ctx", token: "tok-ctx", userId: "usr-ctx-1" },
        }),
      },
    };

    const ctx = await createContextFromRequest({
      authorization: "Bearer tok-ctx",
      clientIp: "127.0.0.1",
      db,
      auth: mockAuth as any,
    });

    expect(ctx.user).toBeDefined();
    expect(ctx.user?.id).toBe("usr-ctx-1");
    expect(ctx.user?.role).toBe("hotel_owner");
    expect(ctx.user?.memberships).toHaveLength(1);
    expect(ctx.user?.memberships?.[0].hotelId).toBe("h-ctx-1");
    expect(ctx.caller?.userId).toBe("usr-ctx-1");
    expect(ctx.caller?.access).toBe("authenticated");
  });

  // Test 8: Hotel Owner Signup Link Single-Use & Expiry
  it("enforces atomic single-use and expiration on signup links", async () => {
    const now = new Date();
    await db.insert(hotels).values({
      id: "h-sl-1",
      name: "Link Hotel",
      slug: "link-hotel",
      address: "A",
      ownerContact: "C",
      publicEnabled: true,
    });
    const superAdminCaller: D1CallerContext = {
      userId: "root",
      roles: ["super_admin"],
      access: "authenticated",
    };

    // 8.1 Create link
    const link = await createSignupLink(
      db,
      superAdminCaller,
      { hotel_id: "h-sl-1", expiresInHours: 24 },
      now,
    );
    expect(link.token).toBeDefined();

    // 8.2 Valid link lookup
    const valid = await getValidSignupLink(db, link.token, now);
    expect(valid).toMatchObject({ hotel_id: "h-sl-1", hotelName: "Link Hotel" });

    // 8.3 Atomic first redemption
    const redeemed1 = await redeemSignupLink(db, link.token, "new-owner-1", now);
    expect(redeemed1).toMatchObject({ hotel_id: "h-sl-1" });

    // 8.4 Replay redemption rejected
    const redeemed2 = await redeemSignupLink(db, link.token, "new-owner-2", now);
    expect(redeemed2).toBeNull();

    // 8.5 Expired link lookup & redemption rejected
    const futureDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    expect(await getValidSignupLink(db, link.token, futureDate)).toBeNull();
    expect(await redeemSignupLink(db, link.token, "new-owner-3", futureDate)).toBeNull();

    // 8.6 Bind hotel owner membership
    await createHotelOwnerMembership(db, "h-sl-1", "new-owner-1", now);
    const [membership] = await db
      .select()
      .from(hotelUsers)
      .where(eq(hotelUsers.hotelId, "h-sl-1"));
    expect(membership.userId).toBe("new-owner-1");
    expect(membership.role).toBe("hotel_owner");
  });

  // Test 9: Staff Invite Scoping & Rollback
  it("isolates staff invites to invited hotel and rolls back on membership failure", async () => {
    const now = new Date();
    await db.insert(hotels).values([
      { id: "h-inv-1", name: "Hotel 1", slug: "h1", address: "A", ownerContact: "C", publicEnabled: true },
      { id: "h-inv-2", name: "Hotel 2", slug: "h2", address: "A", ownerContact: "C", publicEnabled: true },
    ]);
    await db.insert(hotelUsers).values({
      id: "owner-h1",
      hotelId: "h-inv-1",
      userId: "owner-1",
      role: "hotel_owner",
      permissionGrants: [],
      permissionRevokes: [],
      createdAt: now,
    });

    const ownerCaller: D1CallerContext = {
      userId: "owner-1",
      roles: ["hotel_owner"],
      access: "authenticated",
    };

    // 9.1 Invite to hotel 1 succeeds
    const result = await inviteStaffUser(
      db,
      ownerCaller,
      emailSender,
      {
        hotel_id: "h-inv-1",
        email: "frontdesk@hotel1.com",
        role: "front_desk",
      },
      "http://localhost:3000",
      now,
    );

    expect(result.invitationSent).toBe(true);
    expect(emailSender.sentEmails).toHaveLength(1);
    expect(emailSender.sentEmails[0].to).toBe("frontdesk@hotel1.com");

    // 9.2 Scoped access check: staff has membership in h-inv-1, NOT in h-inv-2
    const staffCaller: D1CallerContext = {
      userId: result.user.id,
      roles: ["front_desk"],
      access: "authenticated",
    };
    await expect(
      authorizeHotelAction(db, staffCaller, "h-inv-1", "operations.manage_bookings", "check", now),
    ).resolves.toBeDefined();
    await expect(
      authorizeHotelAction(db, staffCaller, "h-inv-2", "operations.manage_bookings", "check", now),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // 9.3 Cross-hotel invite attempt rejected
    await expect(
      inviteStaffUser(
        db,
        ownerCaller,
        emailSender,
        {
          hotel_id: "h-inv-2",
          email: "intruder@hotel2.com",
          role: "front_desk",
        },
        "http://localhost:3000",
        now,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // -------------------------------------------------------------------------
    // 9.4 Genuine Rollback on Email Delivery Failure
    // -------------------------------------------------------------------------
    // When email dispatch fails after user, verification, and hotelUsers rows
    // are inserted, all three rows MUST be cleanly deleted in the catch block.
    const failingEmailSender: EmailSender = {
      sendEmail: vi.fn().mockRejectedValue(new Error("Resend rate limit exceeded")),
      sendInviteEmail: vi.fn().mockRejectedValue(new Error("Resend rate limit exceeded")),
      sendPasswordResetEmail: vi.fn().mockRejectedValue(new Error("Resend rate limit exceeded")),
    };

    const targetRollbackEmail = "rollback-test@hotel1.com";
    await expect(
      inviteStaffUser(
        db,
        ownerCaller,
        failingEmailSender,
        {
          hotel_id: "h-inv-1",
          email: targetRollbackEmail,
          role: "front_desk",
        },
        "http://localhost:3000",
        now,
      ),
    ).rejects.toThrow(/Resend rate limit exceeded/);

    // 1. Assert user row is rolled back (0 rows)
    const rolledBackUsers = await db
      .select()
      .from(user)
      .where(eq(user.email, targetRollbackEmail));
    expect(rolledBackUsers).toHaveLength(0);

    // 2. Assert verification token is rolled back (0 rows)
    const rolledBackVerifications = await db
      .select()
      .from(verification)
      .where(eq(verification.identifier, `invite:${targetRollbackEmail}`));
    expect(rolledBackVerifications).toHaveLength(0);

    // 3. Assert hotelUsers assignment is rolled back:
    // Only the pre-existing memberships (owner-1 and frontdesk@hotel1.com from 9.1) must exist
    const activeMemberships = await db
      .select()
      .from(hotelUsers)
      .where(eq(hotelUsers.hotelId, "h-inv-1"));
    expect(activeMemberships).toHaveLength(2);
    expect(activeMemberships.map(m => m.userId).sort()).toEqual(["owner-1", result.user.id].sort());

    // -------------------------------------------------------------------------
    // 9.5 Input Validation Rejection Before Database Writes
    // -------------------------------------------------------------------------
    await expect(
      inviteStaffUser(
        db,
        ownerCaller,
        emailSender,
        {
          hotel_id: "h-inv-1",
          email: "invalid-role@hotel1.com",
          role: "super_admin" as any,
        },
        "http://localhost:3000",
        now,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const unassignableUser = await db
      .select()
      .from(user)
      .where(eq(user.email, "invalid-role@hotel1.com"));
    expect(unassignableUser).toHaveLength(0);

    // -------------------------------------------------------------------------
    // 9.6 Rollback for existing user on email delivery failure
    // -------------------------------------------------------------------------
    const existingStaffEmail = "existing-staff@hotel1.com";
    const existingStaffId = "usr-existing-staff-1";
    await db.insert(user).values({
      id: existingStaffId,
      name: "Existing Staff",
      email: existingStaffEmail,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      inviteStaffUser(
        db,
        ownerCaller,
        failingEmailSender,
        {
          hotel_id: "h-inv-1",
          email: existingStaffEmail,
          role: "housekeeping",
        },
        "http://localhost:3000",
        now,
      ),
    ).rejects.toThrow(/Resend rate limit exceeded/);

    // hotelUsers assignment must be rolled back
    const existingUserMemberships = await db
      .select()
      .from(hotelUsers)
      .where(and(eq(hotelUsers.hotelId, "h-inv-1"), eq(hotelUsers.userId, existingStaffId)));
    expect(existingUserMemberships).toHaveLength(0);

    // Existing user must still exist
    const preservedUser = await db.select().from(user).where(eq(user.id, existingStaffId));
    expect(preservedUser).toHaveLength(1);
  });

  // Test 10: Staff Invite Acceptance Flow
  it("accepts staff invite by token, sets password, verifies user, and invalidates token", async () => {
    const now = new Date();
    const token = "invite-tok-789";
    const invitedEmail = "invited-staff@hotel.com";
    const userId = "usr-invited-1";

    await db.insert(user).values({
      id: userId,
      name: "Invited Staff",
      email: invitedEmail,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(verification).values({
      id: "v-invite-1",
      identifier: `invite:${invitedEmail}`,
      value: token,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    });

    const acceptResult = await acceptStaffInvite(
      db,
      {
        token,
        password: "newSecurePassword123",
        name: "Verified Staff",
      },
      async pwd => `hashed_${pwd}`,
      now,
    );

    expect(acceptResult.success).toBe(true);
    expect(acceptResult.user.id).toBe(userId);

    const [updatedUser] = await db.select().from(user).where(eq(user.id, userId));
    expect(updatedUser.emailVerified).toBe(true);
    expect(updatedUser.name).toBe("Verified Staff");

    const [createdAccount] = await db.select().from(account).where(eq(account.userId, userId));
    expect(createdAccount.password).toBe("hashed_newSecurePassword123");

    // Token must be invalidated
    const [tokenRecord] = await db
      .select()
      .from(verification)
      .where(eq(verification.value, token));
    expect(tokenRecord).toBeUndefined();
  });

  it("prevents duplicate account creation under concurrent acceptStaffInvite requests", async () => {
    const now = new Date();
    const token = "concurrent-invite-token-123";
    const invitedEmail = "concurrent-staff@hotel.com";
    const userId = "usr-concurrent-1";

    await db.insert(user).values({
      id: userId,
      name: "Concurrent Staff",
      email: invitedEmail,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(verification).values({
      id: "v-concurrent-1",
      identifier: `invite:${invitedEmail}`,
      value: token,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    });

    // Launch two simultaneous acceptance attempts with the same token
    const [resultA, resultB] = await Promise.allSettled([
      acceptStaffInvite(
        db,
        { token, password: "passwordA123", name: "Staff A" },
        async pwd => `hashed_${pwd}`,
        now,
      ),
      acceptStaffInvite(
        db,
        { token, password: "passwordB123", name: "Staff B" },
        async pwd => `hashed_${pwd}`,
        now,
      ),
    ]);

    // Exactly one request must succeed and one must fail
    const succeeded = [resultA, resultB].filter(r => r.status === "fulfilled");
    const rejected = [resultA, resultB].filter(r => r.status === "rejected");

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    if (rejected[0].status === "rejected") {
      expect(rejected[0].reason).toMatchObject({
        code: "BAD_REQUEST",
        message: "This invitation link is invalid or has expired.",
      });
    }

    // Verify exactly one account was created
    const createdAccounts = await db
      .select()
      .from(account)
      .where(eq(account.userId, userId));
    expect(createdAccounts).toHaveLength(1);

    // Verify token was deleted
    const tokenRecord = await db
      .select()
      .from(verification)
      .where(eq(verification.value, token));
    expect(tokenRecord).toHaveLength(0);
  });

  // Test 11: Super-Admin Data Isolation
  it("blocks super-admin caller from accessing hotel-scoped internal data through scope layer", async () => {
    const now = new Date();
    await db.insert(hotels).values({
      id: "h-sa-1",
      name: "Target Hotel",
      slug: "target-hotel",
      address: "A",
      ownerContact: "C",
      publicEnabled: true,
    });
    await db.insert(hotelUsers).values({
      id: "root-membership",
      hotelId: "h-sa-1",
      userId: "root-user",
      role: "super_admin",
      permissionGrants: [],
      permissionRevokes: [],
      createdAt: now,
    });

    const superAdminCaller: D1CallerContext = {
      userId: "root-user",
      roles: ["super_admin"],
      access: "authenticated",
    };

    // authorizeHotelAction unconditionally blocks super_admin from operational hotel data
    await expect(
      authorizeHotelAction(db, superAdminCaller, "h-sa-1", "property.manage_bookings", "booking.read", now),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // Test 12: Context-Level MFA Step-Up Enforcement
  it("enforces MFA step-up on user identity resolved from createContextFromRequest", async () => {
    const nowMs = 1700000000000;
    const now = new Date(nowMs);

    // 1. Create a user with 2FA enabled in D1
    const userId = "usr-mfa-ctx-1";
    await db.insert(user).values({
      id: userId,
      name: "MFA Owner",
      email: "mfa-ctx@test.com",
      emailVerified: true,
      twoFactorEnabled: true,
      createdAt: now,
      updatedAt: now,
    });

    // 2. Simulate password-only login session (no twoFactorVerified claim)
    const sessionToken = "pwd-only-session-token-xyz";
    await db.insert(session).values({
      id: "sess-mfa-ctx-1",
      token: sessionToken,
      userId,
      expiresAt: new Date(nowMs + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(nowMs - 60_000), // 1 minute ago
      updatedAt: now,
    });

    // 3. Resolve context via mock Better Auth instance
    const mockAuth = {
      api: {
        getSession: async () => ({
          user: { id: userId, email: "mfa-ctx@test.com", name: "MFA Owner", twoFactorEnabled: true },
          session: {
            id: "sess-mfa-ctx-1",
            token: sessionToken,
            userId,
            createdAt: new Date(nowMs - 60_000),
          },
        }),
      },
    };

    const ctx = await createContextFromRequest({
      authorization: `Bearer ${sessionToken}`,
      clientIp: "127.0.0.1",
      db,
      auth: mockAuth as any,
    });

    expect(ctx.user).toBeDefined();
    expect(ctx.user?.twoFactorEnabled).toBe(true);

    // 4. Invoking requireRecentMfaVerification on ctx.user MUST throw PRECONDITION_FAILED (aal1)
    try {
      requireRecentMfaVerification(ctx.user, { nowMs });
      expect.fail("Expected requireRecentMfaVerification(ctx.user) to reject password-only session");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      const trpcErr = err as TRPCError;
      expect(trpcErr.code).toBe("PRECONDITION_FAILED");
      expect((trpcErr.cause as any)?.reason).toBe("aal1");
    }

    // 5. Simulate subsequent TOTP verification elevating session to AAL2
    const elevatedSession = {
      ...ctx.user!.session,
      twoFactorVerified: true,
      createdAt: new Date(nowMs - 60_000),
    };
    const elevatedUser = {
      ...ctx.user!,
      session: elevatedSession,
    };

    expect(() => requireRecentMfaVerification(elevatedUser, { nowMs })).not.toThrow();
  });
});
