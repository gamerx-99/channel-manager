import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { d1Schema, hotelUsers, hotels } from "../../drizzle/d1-schema";
import { account, session, twoFactor, user, verification } from "../../drizzle/auth-schema";
import type { D1CallerContext, D1ScopedDatabase } from "../db/scope";
import { authorizeHotelAction } from "../db/scope";
import { MockEmailSender } from "../email";
import {
  STAFF_INVITE_TTL_MS,
  acceptStaffInvite,
  cancelHotelStaffInvite,
  inviteStaffUser,
  listHotelStaffInvites,
  resendHotelStaffInvite,
} from "./invites";
import { listHotelStaff } from "./staff";
import { staffRouter } from "../routers/staffRouter";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;
let emails: MockEmailSender;

const HOTEL_A = "11111111-1111-4111-8111-111111111111";
const HOTEL_B = "22222222-2222-4222-8222-222222222222";
const OWNER_CALLER: D1CallerContext = { userId: "owner-user", roles: ["hotel_owner"], access: "authenticated" };
const FRONT_DESK_CALLER: D1CallerContext = { userId: "staff-user", roles: ["front_desk"], access: "authenticated" };

function extractToken(emailText: string | undefined): string {
  if (!emailText) return "";
  const match = /token=([^"'\s&]+)/.exec(emailText);
  return match?.[1] ?? "";
}

beforeEach(async () => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    const source = readFileSync(resolve(migrationFolder, file), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    if (method === "get") { const row = statement.get(...params); return { rows: row ? [row] : [] }; }
    return { rows: statement.all(...params) };
  }, { schema: { ...d1Schema, ...{ user, session, account, verification, twoFactor } } }) as unknown as D1ScopedDatabase;

  emails = new MockEmailSender();

  // Seed hotels
  await db.insert(hotels).values([
    { id: HOTEL_A, name: "Hotel Alpha", slug: "hotel-alpha", address: "1 Alpha Road", ownerContact: "owner@alpha.test", publicEnabled: true },
    { id: HOTEL_B, name: "Hotel Beta", slug: "hotel-beta", address: "2 Beta Road", ownerContact: "owner@beta.test", publicEnabled: true },
  ]);

  // Seed owner and staff on Hotel A
  await db.insert(user).values([
    { id: "owner-user", name: "Hotel Owner", email: "owner@alpha.test", emailVerified: true },
    { id: "staff-user", name: "Front Desk Staff", email: "frontdesk@alpha.test", emailVerified: true },
  ]);
  await db.insert(hotelUsers).values([
    { id: "mem-owner", hotelId: HOTEL_A, userId: "owner-user", role: "hotel_owner" },
    { id: "mem-staff", hotelId: HOTEL_A, userId: "staff-user", role: "front_desk" },
  ]);
});

afterEach(() => sqlite.close());

describe("Staff Invitations Delivery Tests", () => {
  it("ลิงก์ใช้ได้ก่อนครบ 24 ชั่วโมง และใช้ไม่ได้เมื่อหมดอายุ", async () => {
    const t0 = new Date("2026-11-11T10:00:00.000Z");
    const email = "newhire@example.test";

    await inviteStaffUser(db, OWNER_CALLER, emails, {
      hotel_id: HOTEL_A,
      email,
      role: "front_desk",
    }, "https://app.test", t0);

    const token = extractToken(emails.getLastEmail()?.text);
    expect(token).not.toBe("");

    // Case 1: Before 24h (23 hours and 59 minutes later)
    const tBefore24h = new Date(t0.getTime() + STAFF_INVITE_TTL_MS - 60000);
    // Simulate another user with same invite token to verify TTL before expiration
    const inviteCheck = await db.select().from(verification).where(eq(verification.value, token));
    expect(inviteCheck).toHaveLength(1);
    expect(new Date(inviteCheck[0]!.expiresAt).getTime() - t0.getTime()).toBe(STAFF_INVITE_TTL_MS);

    // Case 2: After 24h (24 hours and 1 millisecond later)
    const tAfter24h = new Date(t0.getTime() + STAFF_INVITE_TTL_MS + 1);
    await expect(
      acceptStaffInvite(db, { token, password: "secure-password-123" }, async p => p, tAfter24h),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "This invitation link is invalid or has expired." });

    // Ensure the token was not redeemed
    const remainingRows = await db.select().from(verification).where(eq(verification.value, token));
    expect(remainingRows).toHaveLength(1);

    // Now test valid redemption before 24h
    await expect(
      acceptStaffInvite(db, { token, password: "secure-password-123" }, async p => p, tBefore24h),
    ).resolves.toMatchObject({ success: true });
  });

  it("ส่งใหม่ทำให้ลิงก์เก่าใช้ไม่ได้และลิงก์ใหม่ใช้ได้", async () => {
    const t0 = new Date("2026-11-11T10:00:00.000Z");
    const email = "resend-test@example.test";

    // First invite
    await inviteStaffUser(db, OWNER_CALLER, emails, {
      hotel_id: HOTEL_A,
      email,
      role: "front_desk",
    }, "https://app.test", t0);
    const token1 = extractToken(emails.getLastEmail()?.text);

    // Resend 2 hours later
    const tResend = new Date(t0.getTime() + 2 * 3600000);
    const resendResult = await resendHotelStaffInvite(
      db,
      OWNER_CALLER,
      emails,
      { hotel_id: HOTEL_A, email, role: "front_desk" },
      "https://app.test",
      tResend,
    );
    const token2 = extractToken(resendResult.inviteUrl);
    expect(token2).not.toBe(token1);

    // Old token1 must now be cancelled / invalid
    await expect(
      acceptStaffInvite(db, { token: token1, password: "new-password-123" }, async p => p, new Date(tResend.getTime() + 1000)),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "This invitation link is invalid or has expired." });

    // New token2 succeeds and has 24h window from tResend
    await expect(
      acceptStaffInvite(db, { token: token2, password: "new-password-123" }, async p => p, new Date(tResend.getTime() + 1000)),
    ).resolves.toMatchObject({ success: true });
  });

  it("ยกเลิกทำให้ลิงก์ใช้ไม่ได้ทันที", async () => {
    const t0 = new Date("2026-11-11T10:00:00.000Z");
    const email = "cancel-test@example.test";

    await inviteStaffUser(db, OWNER_CALLER, emails, {
      hotel_id: HOTEL_A,
      email,
      role: "front_desk",
    }, "https://app.test", t0);
    const token = extractToken(emails.getLastEmail()?.text);

    // Cancel invite immediately (5 minutes later)
    const tCancel = new Date(t0.getTime() + 5 * 60000);
    const cancelResult = await cancelHotelStaffInvite(db, OWNER_CALLER, {
      hotel_id: HOTEL_A,
      email,
    }, tCancel);
    expect(cancelResult.cancelled).toBeGreaterThanOrEqual(1);

    // Verification row has cancelledAt populated
    const [row] = await db.select().from(verification).where(eq(verification.value, token));
    expect(row?.cancelledAt).toEqual(tCancel);

    // Accept attempt must fail immediately
    await expect(
      acceptStaffInvite(db, { token, password: "password-123" }, async p => p, new Date(tCancel.getTime() + 1000)),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "This invitation link is invalid or has expired." });
  });

  it("สถานะทั้ง 4 แสดงถูกต้อง (pending, expired, cancelled, active/confirmed)", async () => {
    const t0 = new Date("2026-11-11T10:00:00.000Z");

    // 1. Pending invite
    await inviteStaffUser(db, OWNER_CALLER, emails, { hotel_id: HOTEL_A, email: "pending@example.test", role: "front_desk" }, "https://app.test", t0);

    // 2. Expired invite (created 25 hours ago relative to inspection time)
    const tPast = new Date(t0.getTime() - 25 * 3600000);
    await inviteStaffUser(db, OWNER_CALLER, emails, { hotel_id: HOTEL_A, email: "expired@example.test", role: "front_desk" }, "https://app.test", tPast);

    // 3. Cancelled invite
    await inviteStaffUser(db, OWNER_CALLER, emails, { hotel_id: HOTEL_A, email: "cancelled@example.test", role: "front_desk" }, "https://app.test", t0);
    await cancelHotelStaffInvite(db, OWNER_CALLER, { hotel_id: HOTEL_A, email: "cancelled@example.test" }, new Date(t0.getTime() + 60000));

    // 4. Accepted/active member
    await inviteStaffUser(db, OWNER_CALLER, emails, { hotel_id: HOTEL_A, email: "active@example.test", role: "housekeeping" }, "https://app.test", t0);
    const activeToken = extractToken(emails.getLastEmail()?.text);
    await acceptStaffInvite(db, { token: activeToken, password: "password-123" }, async p => p, new Date(t0.getTime() + 60000));

    // Check listHotelStaffInvites
    const invites = await listHotelStaffInvites(db, OWNER_CALLER, HOTEL_A, t0);
    const pendingRecord = invites.find(i => i.email === "pending@example.test");
    const expiredRecord = invites.find(i => i.email === "expired@example.test");
    const cancelledRecord = invites.find(i => i.email === "cancelled@example.test");

    expect(pendingRecord?.status).toBe("pending");
    expect(expiredRecord?.status).toBe("expired");
    expect(cancelledRecord?.status).toBe("cancelled");

    // The accepted one is now in the hotel staff list
    const staffList = await listHotelStaff(db, OWNER_CALLER, HOTEL_A);
    const activeStaff = staffList.find(s => s.email === "active@example.test");
    expect(activeStaff).toBeDefined();
    expect(activeStaff?.role).toBe("housekeeping");
    expect(activeStaff?.confirmed_at).toBeDefined();
  });

  it("ผู้ที่ยังไม่ยืนยันอีเมลเข้าโรงแรมไม่ได้", async () => {
    const t0 = new Date("2026-11-11T10:00:00.000Z");
    const email = "unverified-user@example.test";
    const unverifiedUserId = "self-registered-unverified-user";

    // User registered an account but email is unverified
    await db.insert(user).values({
      id: unverifiedUserId,
      name: "Unverified Staff",
      email,
      emailVerified: false,
      createdAt: t0,
      updatedAt: t0,
    });

    const inviteResult = await inviteStaffUser(db, OWNER_CALLER, emails, {
      hotel_id: HOTEL_A,
      email,
      role: "front_desk",
    }, "https://app.test", t0);

    // No membership is granted upon invitation to an unverified account
    expect(inviteResult.membership).toBeNull();
    const [u] = await db.select().from(user).where(eq(user.id, unverifiedUserId));
    expect(u?.emailVerified).toBe(false);

    // Attempting an action on Hotel A by this unverified user must be rejected
    const unverifiedCaller: D1CallerContext = { userId: unverifiedUserId, roles: [], access: "authenticated" };
    await expect(
      authorizeHotelAction(db, unverifiedCaller, HOTEL_A, "operations.view_bookings", "staff.test"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // But once the invite is accepted with password and token:
    const token = extractToken(emails.getLastEmail()?.text);
    await acceptStaffInvite(db, { token, password: "new-password-123" }, async p => p, new Date(t0.getTime() + 60000));

    // Now email is verified and membership is granted
    const [verifiedUser] = await db.select().from(user).where(eq(user.id, unverifiedUserId));
    expect(verifiedUser?.emailVerified).toBe(true);
    await expect(
      authorizeHotelAction(db, { userId: unverifiedUserId, roles: ["front_desk"], access: "authenticated" }, HOTEL_A, "operations.view_bookings", "staff.test"),
    ).resolves.toBeDefined();
  });

  it("การยืนยันอีเมลสำเร็จให้สิทธิ์เฉพาะโรงแรมและบทบาทที่เชิญ", async () => {
    const t0 = new Date("2026-11-11T10:00:00.000Z");
    const email = "scoped-staff@example.test";

    const inviteResult = await inviteStaffUser(db, OWNER_CALLER, emails, {
      hotel_id: HOTEL_A,
      email,
      role: "front_desk",
    }, "https://app.test", t0);
    const token = extractToken(emails.getLastEmail()?.text);

    await acceptStaffInvite(db, { token, password: "strong-password-123" }, async p => p, new Date(t0.getTime() + 60000));

    const invitedUserId = inviteResult.user.id;
    const memberCaller: D1CallerContext = { userId: invitedUserId, roles: ["front_desk"], access: "authenticated" };

    // 1. Has role front_desk on Hotel A (can view bookings)
    await expect(
      authorizeHotelAction(db, memberCaller, HOTEL_A, "operations.view_bookings", "staff.test"),
    ).resolves.toMatchObject({ role: "front_desk" });

    // 2. Does NOT have hotel_owner role or transfer ownership capability on Hotel A
    await expect(
      authorizeHotelAction(db, memberCaller, HOTEL_A, "property.transfer_ownership", "staff.test"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // 3. Has NO access to Hotel B (strictly scoped to invited hotel)
    await expect(
      authorizeHotelAction(db, memberCaller, HOTEL_B, "operations.view_bookings", "staff.test"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("ผู้ไม่มีสิทธิ์จัดการพนักงานทำรายการ resend/cancel ไม่ได้", async () => {
    const t0 = new Date("2026-11-11T10:00:00.000Z");
    const email = "permission-check@example.test";

    // Setup an invite first by the owner
    await inviteStaffUser(db, OWNER_CALLER, emails, {
      hotel_id: HOTEL_A,
      email,
      role: "front_desk",
    }, "https://app.test", t0);

    // Front desk staff has no property.manage_staff permission
    // D1 helper checks
    await expect(
      resendHotelStaffInvite(db, FRONT_DESK_CALLER, emails, { hotel_id: HOTEL_A, email, role: "front_desk" }, "https://app.test", t0),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      cancelHotelStaffInvite(db, FRONT_DESK_CALLER, { hotel_id: HOTEL_A, email }, t0),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      listHotelStaffInvites(db, FRONT_DESK_CALLER, HOTEL_A, t0),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Router procedure checks
    const routerCaller = staffRouter.createCaller({
      db,
      user: { id: "staff-user", roles: [] },
      caller: FRONT_DESK_CALLER,
    } as any);

    await expect(
      routerCaller.resendHotelStaffInvite({ hotel_id: HOTEL_A, email, role: "front_desk" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      routerCaller.cancelHotelStaffInvite({ hotel_id: HOTEL_A, email }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      routerCaller.listHotelStaffInvites({ hotel_id: HOTEL_A }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
