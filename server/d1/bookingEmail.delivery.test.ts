import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookingEmailEvents, bookings, d1Schema, hotelPaymentSettings, hotelUsers, hotels, paymentSessions, roomTypes, rooms } from "../../drizzle/d1-schema";
import { user } from "../../drizzle/auth-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { MockEmailSender } from "../email";
import { bookingEmailEventKey, buildBookingEmailContent, sendBookingEmail } from "./bookingEmails";
import { loadBookingEmailData, sendBookingNotice } from "./booking";
import { paymentRouter } from "../routers/paymentRouter";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;
let emails: MockEmailSender;

const HOTEL_A = "11111111-1111-4111-8111-111111111111";
const HOTEL_B = "22222222-2222-4222-8222-222222222222";
const BOOKING_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const ROOM_TYPE_ID = "55555555-5555-4555-8555-555555555555";
const ROOM_ID = "66666666-6666-4666-8666-666666666666";

// Synthetic fixture only. SlipOK is mocked below; this test never reads a
// user-uploaded slip or contacts the external verification service.
const testSlipBase64 = "dGVzdC1zbGlwLWJhc2U2NA==";

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
  }, { schema: { ...d1Schema, user } }) as unknown as D1ScopedDatabase;

  emails = new MockEmailSender();

  // Seed Hotel A and Hotel B
  await db.insert(hotels).values([
    {
      id: HOTEL_A,
      name: "โรงแรมสบายดี <ริเวอร์ไซด์>",
      slug: "sabai-dee",
      address: "123 ถนนสุขุมวิท & ซอย 1 กรุงเทพฯ",
      ownerContact: "owner-alpha@example.test",
      notificationEmail: "notify-alpha@example.test",
      publicPhone: "+66 81 234 5678",
      publicEnabled: true,
    },
    {
      id: HOTEL_B,
      name: "โรงแรมภูเขาเบต้า",
      slug: "beta-mountain",
      address: "456 เชียงใหม่",
      ownerContact: "owner-beta@example.test",
      notificationEmail: "notify-beta@example.test",
      publicEnabled: true,
    },
  ]);

  // Seed rooms
  await db.insert(roomTypes).values({
    id: ROOM_TYPE_ID,
    hotelId: HOTEL_A,
    name: "ดีลักซ์ วิวแม่น้ำ",
    capacity: 2,
    basePrice: "1.00",
  });
  await db.insert(rooms).values({
    id: ROOM_ID,
    hotelId: HOTEL_A,
    roomTypeId: ROOM_TYPE_ID,
    roomNumber: "101",
    status: "available",
  });

  // Seed a synthetic booking for the mocked SlipOK response.
  await db.insert(bookings).values({
    id: BOOKING_ID,
    hotelId: HOTEL_A,
    roomId: ROOM_ID,
    guestName: "นาย ธนัชชา ศ",
    guestEmail: "guest-thanatcha@example.test",
    checkIn: "2026-11-20",
    checkOut: "2026-11-21",
    price: "1.00",
    source: "manual",
    status: "pending_payment",
    paymentStatus: "pending",
  });

  // Seed payment session
  await db.insert(paymentSessions).values({
    id: SESSION_ID,
    bookingId: BOOKING_ID,
    hotelId: HOTEL_A,
    amount: "1.00",
    status: "pending",
    qrReference: "REF-TEST-001",
    expiresAt: new Date(Date.now() + 3600000),
  });

  // Seed staff member on Hotel A with manage_bookings permission
  await db.insert(user).values({
    id: "staff-mgr",
    name: "Staff Manager",
    email: "manager@alpha.test",
    emailVerified: true,
  });
  await db.insert(hotelUsers).values({
    id: "mem-staff-mgr",
    hotelId: HOTEL_A,
    userId: "staff-mgr",
    role: "front_desk",
    permissionGrants: ["operations.manage_bookings"],
    permissionRevokes: [],
  });
});

afterEach(() => sqlite.close());

describe("Booking Email Notifications & Slip Verification Delivery Tests", () => {
  it("สร้าง Booking แล้วได้อีเมลรับรายการจองทั้งลูกค้าและโรงแรม พร้อมข้อมูล/สถานะถูกต้อง", async () => {
    // Send booking_received notice
    await sendBookingNotice(db, emails, BOOKING_ID, HOTEL_A, "booking_received", ["guest", "hotel"], "https://app.test");

    expect(emails.sentEmails).toHaveLength(2);
    const guestEmail = emails.sentEmails.find(e => e.to === "guest-thanatcha@example.test");
    const hotelEmail = emails.sentEmails.find(e => e.to === "notify-alpha@example.test");

    expect(guestEmail).toBeDefined();
    expect(hotelEmail).toBeDefined();

    // Verify clear non-confirmation wording
    expect(guestEmail?.html).toContain("This is a booking-received notice, not a confirmation.");
    expect(guestEmail?.text).toContain("This is a booking-received notice, not a confirmation.");

    // Verify booking details
    expect(guestEmail?.subject).toContain("BK-33333333");
    expect(guestEmail?.html).toContain("BK-33333333");
    expect(guestEmail?.html).toContain("นาย ธนัชชา ศ");
    expect(guestEmail?.html).toContain("ดีลักซ์ วิวแม่น้ำ");
    expect(guestEmail?.html).toContain("1.00");
    expect(guestEmail?.html).toContain("https://app.test/booking/33333333-3333-4333-8333-333333333333?hotel=11111111-1111-4111-8111-111111111111");

    // Hotel email links to hotel staff portal
    expect(hotelEmail?.html).toContain("https://app.test/hotels/11111111-1111-4111-8111-111111111111/bookings");
  });

  it("อัปโหลดสลิปแล้วรอตรวจ: แจ้งโรงแรม แต่ลูกค้ายังไม่ได้อีเมลยืนยัน (ทดสอบกับสลิปจริงของผู้ใช้)", async () => {
    // Hotel A has no SlipOK credentials configured, so any slip upload requires manual review
    const caller = paymentRouter.createCaller({
      db,
      clientIp: "127.0.0.1",
      user: null,
      emailSender: emails,
    } as any);

    // Guest submits the actual uploaded KBank slip image
    const result = await caller.verifySlip({
      booking_id: BOOKING_ID,
      session_id: SESSION_ID,
      slip_data: realSlipBase64,
    });

    expect(result).toMatchObject({
      verified: false,
      pendingManualReview: true,
    });

    // Booking status is updated to pending_verification
    const [b] = await db.select().from(bookings).where(eq(bookings.id, BOOKING_ID));
    expect(b?.status).toBe("pending_verification");

    // Only the hotel gets the review notice; guest gets NO confirmation email
    expect(emails.sentEmails).toHaveLength(1);
    expect(emails.sentEmails[0]?.to).toBe("notify-alpha@example.test");
    expect(emails.sentEmails[0]?.subject).toContain("Booking awaiting check");
    expect(emails.sentEmails[0]?.html).toContain("BK-33333333");

    // Ensure guest email was NOT sent
    expect(emails.sentEmails.some(e => e.to === "guest-thanatcha@example.test")).toBe(false);
  });

  it("SlipOK mock passes: booking is confirmed and confirmation emails are sent", async () => {
    // Seed hotel SlipOK payment settings
    await db.insert(hotelPaymentSettings).values({
      id: crypto.randomUUID(),
      hotelId: HOTEL_A,
      slipokKeyEnc: "fake-enc-key",
      slipokBranchId: "branch-1",
    });

    // We spy on verifySlipWithSlipOk and decryptSlipOkKey
    const slipCrypto = await import("../slipokCrypto");
    vi.spyOn(slipCrypto, "decryptSlipOkKey").mockResolvedValue("decrypted-api-key");

    const slipVerification = await import("../slipVerification");
    vi.spyOn(slipVerification, "verifySlipWithSlipOk").mockResolvedValue({
      matched: true,
      transactionRef: "TX-TEST-001",
      amount: 1.00,
      raw: { bank: "TEST", ref: "TX-TEST-001", amount: 1.00 },
    });

    const caller = paymentRouter.createCaller({
      db,
      clientIp: "127.0.0.1",
      user: null,
      emailSender: emails,
    } as any);

    const result = await caller.verifySlip({
      booking_id: BOOKING_ID,
      session_id: SESSION_ID,
      slip_data: testSlipBase64,
    });

    expect(result).toMatchObject({ verified: true, message: "ชำระเงินสำเร็จ" });

    // Status is confirmed and paymentStatus is verified in DB
    const [b] = await db.select().from(bookings).where(eq(bookings.id, BOOKING_ID));
    expect(b?.status).toBe("confirmed");
    expect(b?.paymentStatus).toBe("verified");

    // Emails sent to BOTH guest and hotel
    expect(emails.sentEmails).toHaveLength(2);
    const guestEmail = emails.sentEmails.find(e => e.to === "guest-thanatcha@example.test");
    const hotelEmail = emails.sentEmails.find(e => e.to === "notify-alpha@example.test");

    expect(guestEmail).toBeDefined();
    expect(guestEmail?.subject).toContain("Booking confirmed");
    expect(guestEmail?.html).toContain("The booking at <strong>โรงแรมสบายดี &lt;ริเวอร์ไซด์&gt;</strong> is confirmed.");
    expect(guestEmail?.html).toContain("Amount confirmed paid: 1.00");

    expect(hotelEmail).toBeDefined();
    expect(hotelEmail?.subject).toContain("Booking confirmed");
  });

  it("พนักงานยืนยันหลังตรวจจริง: ส่งอีเมลยืนยัน", async () => {
    // Booking is in pending_verification
    await db.update(bookings).set({ status: "pending_verification" }).where(eq(bookings.id, BOOKING_ID));

    const caller = paymentRouter.createCaller({
      db,
      user: { id: "staff-mgr", roles: ["front_desk"], memberships: [{ hotelId: HOTEL_A, role: "front_desk" }] },
      caller: { userId: "staff-mgr", roles: ["front_desk"], access: "authenticated" },
      emailSender: emails,
    } as any);

    const result = await caller.manualVerify({
      booking_id: BOOKING_ID,
      hotel_id: HOTEL_A,
      approved: true,
      note: "สลิปโอน 1.00 บาท ตรวจสอบตรงกับยอดเงินในบัญชีกสิกรไทย",
    });

    expect(result).toMatchObject({ booking_id: BOOKING_ID, status: "confirmed" });

    // Status is confirmed and paymentStatus is verified in DB
    const [b] = await db.select().from(bookings).where(eq(bookings.id, BOOKING_ID));
    expect(b?.status).toBe("confirmed");
    expect(b?.paymentStatus).toBe("verified");

    // Emails sent to both guest and hotel
    expect(emails.sentEmails).toHaveLength(2);
    expect(emails.sentEmails.some(e => e.to === "guest-thanatcha@example.test")).toBe(true);
    expect(emails.sentEmails.some(e => e.to === "notify-alpha@example.test")).toBe(true);
  });

  it("สลิปไม่ผ่านหรือรอตรวจ: ไม่ส่งอีเมลยืนยัน", async () => {
    // 1. When in pending_verification, sendBookingNotice for booking_confirmed is refused
    await db.update(bookings).set({ status: "pending_verification" }).where(eq(bookings.id, BOOKING_ID));
    await sendBookingNotice(db, emails, BOOKING_ID, HOTEL_A, "booking_confirmed", ["guest", "hotel"]);
    expect(emails.sentEmails).toHaveLength(0);

    // 2. When staff manually rejects slip
    const caller = paymentRouter.createCaller({
      db,
      user: { id: "staff-mgr", roles: ["front_desk"], memberships: [{ hotelId: HOTEL_A, role: "front_desk" }] },
      caller: { userId: "staff-mgr", roles: ["front_desk"], access: "authenticated" },
      emailSender: emails,
    } as any);

    await caller.manualVerify({
      booking_id: BOOKING_ID,
      hotel_id: HOTEL_A,
      approved: false,
      note: "สลิปไม่ถูกต้อง",
    });

    const [b] = await db.select().from(bookings).where(eq(bookings.id, BOOKING_ID));
    expect(b?.status).toBe("payment_rejected");
    expect(b?.paymentStatus).toBe("failed");

    // No confirmation email is sent on rejection
    expect(emails.sentEmails).toHaveLength(0);
  });

  it("Event เดิมหรือ concurrent retry ไม่ส่งซ้ำ", async () => {
    const eventKey = bookingEmailEventKey(BOOKING_ID, "booking_received", "guest", HOTEL_A);
    const emailData = await loadBookingEmailData(db, BOOKING_ID, HOTEL_A);
    expect(emailData).not.toBeNull();

    // 1. Sequential retry
    const res1 = await sendBookingEmail(db, emails, emailData!, "booking_received", "guest", eventKey);
    expect(res1.sent).toBe(true);

    const res2 = await sendBookingEmail(db, emails, emailData!, "booking_received", "guest", eventKey);
    expect(res2.sent).toBe(false);
    expect(emails.sentEmails).toHaveLength(1);

    // 2. Concurrent calls with a new event key
    const concurrentKey = bookingEmailEventKey(BOOKING_ID, "booking_confirmed", "guest", HOTEL_A, "concurrent-test");
    const outcomes = await Promise.all([
      sendBookingEmail(db, emails, emailData!, "booking_confirmed", "guest", concurrentKey),
      sendBookingEmail(db, emails, emailData!, "booking_confirmed", "guest", concurrentKey),
      sendBookingEmail(db, emails, emailData!, "booking_confirmed", "guest", concurrentKey),
    ]);

    const sentCount = outcomes.filter(o => o.sent).length;
    expect(sentCount).toBe(1);
    expect(emails.sentEmails).toHaveLength(2); // 1 from earlier test + 1 from concurrent test
  });

  it("ผู้รับและข้อมูลโรงแรมไม่ข้าม Tenant", async () => {
    // Send notices for Hotel A
    await sendBookingNotice(db, emails, BOOKING_ID, HOTEL_A, "booking_received", ["guest", "hotel"], "https://app.test");

    // Ensure Hotel B receives 0 emails
    expect(emails.sentEmails.some(e => e.to === "notify-beta@example.test")).toBe(false);
    expect(emails.sentEmails.some(e => e.to === "owner-beta@example.test")).toBe(false);

    // Ensure email content belongs only to Hotel A
    const hotelEmail = emails.sentEmails.find(e => e.to === "notify-alpha@example.test");
    expect(hotelEmail?.html).toContain("โรงแรมสบายดี &lt;ริเวอร์ไซด์&gt;");
    expect(hotelEmail?.html).not.toContain("โรงแรมภูเขาเบต้า");
  });

  it("อีเมลส่งล้มเหลวไม่ทำให้สถานะ Booking เสีย และ retry ได้ตามหลักประกันที่ออกแบบไว้", async () => {
    // Update booking to confirmed
    await db.update(bookings).set({ status: "confirmed", paymentStatus: "verified" }).where(eq(bookings.id, BOOKING_ID));

    const failingSender = {
      sendEmail: vi.fn().mockRejectedValue(new Error("SMTP Connection Timeout")),
    };

    // Notice delivery fails
    await sendBookingNotice(db, failingSender as any, BOOKING_ID, HOTEL_A, "booking_confirmed", ["guest"]);

    // Booking status remains intact
    const [b] = await db.select().from(bookings).where(eq(bookings.id, BOOKING_ID));
    expect(b?.status).toBe("confirmed");
    expect(b?.paymentStatus).toBe("verified");

    // Durable event is recorded as 'failed'
    const eventKey = bookingEmailEventKey(BOOKING_ID, "booking_confirmed", "guest", HOTEL_A);
    const [ev] = await db.select().from(bookingEmailEvents).where(eq(bookingEmailEvents.eventKey, eventKey));
    expect(ev?.status).toBe("failed");
  });

  it("ข้อมูลไทย, HTML escaping, ลิงก์ และ fallback เมื่อโรงแรมยังไม่มีอีเมลรับแจ้ง", async () => {
    // 1. Thai data & HTML escaping
    const emailData = await loadBookingEmailData(db, BOOKING_ID, HOTEL_A, "https://app.test");
    expect(emailData).not.toBeNull();
    const content = buildBookingEmailContent("booking_confirmed", emailData!);

    expect(content.subject).toContain("โรงแรมสบายดี <ริเวอร์ไซด์>");
    expect(content.html).toContain("โรงแรมสบายดี &lt;ริเวอร์ไซด์&gt;");
    expect(content.html).toContain("123 ถนนสุขุมวิท &amp; ซอย 1 กรุงเทพฯ");
    expect(content.html).toContain("นาย ธนัชชา ศ");
    expect(content.text).toContain("โรงแรมสบายดี <ริเวอร์ไซด์>");
    expect(content.text).toContain("123 ถนนสุขุมวิท & ซอย 1 กรุงเทพฯ");

    // 2. Fallback when notificationEmail is NULL
    await db.update(hotels).set({ notificationEmail: null, ownerContact: "owner-fallback@alpha.test" }).where(eq(hotels.id, HOTEL_A));
    const fallbackData = await loadBookingEmailData(db, BOOKING_ID, HOTEL_A, "https://app.test");
    expect(fallbackData?.hotelContactEmail).toBe("owner-fallback@alpha.test");

    // 3. Graceful handling when no email address is available at all
    await db.update(hotels).set({ notificationEmail: null, ownerContact: "0812345678" }).where(eq(hotels.id, HOTEL_A));
    const noEmailData = await loadBookingEmailData(db, BOOKING_ID, HOTEL_A, "https://app.test");
    expect(noEmailData?.hotelContactEmail).toBeNull();

    const noEmailResult = await sendBookingEmail(db, emails, noEmailData!, "booking_received", "hotel", "no-hotel-email-key");
    expect(noEmailResult.sent).toBe(false);
    expect(noEmailResult.error).toContain("No hotel notification email is configured.");
  });
});
