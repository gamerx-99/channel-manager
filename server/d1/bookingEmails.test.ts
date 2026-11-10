import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bookingEmailEvents, d1Schema } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { MockEmailSender, type EmailSender } from "../email";
import { bookingEmailEventKey, buildBookingEmailContent, sendBookingEmail, type BookingEmailData } from "./bookingEmails";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(resolve(migrationFolder, file), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    const row = method === "get" ? statement.get(...params) : statement.all(...params);
    return { rows: row ? (Array.isArray(row) ? row : [row]) : [] };
  }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
});
afterEach(() => sqlite.close());

const data: BookingEmailData = {
  bookingId: "12345678-abcd-4abc-8abc-123456789012",
  hotelId: "hotel-id",
  hotelName: "Hotel <North>",
  hotelContactEmail: "desk@example.test",
  hotelContactPhone: "+66 81 234 5678",
  hotelAddress: "1 Main Street",
  bookingRef: "BK-12345678",
  guestName: "Guest Example",
  checkIn: "2026-12-10",
  checkOut: "2026-12-12",
  roomTypeName: "Deluxe",
  amount: "200.00",
  status: "Confirmed",
  guestEmail: "guest@example.test",
  bookingUrl: "https://hayhostth.com/booking/booking-id?hotel=hotel-id",
  hotelBookingUrl: "https://hayhostth.com/hotels/hotel-id/bookings",
};

describe("booking email events", () => {
  it("renders confirmation details and escapes untrusted HTML values", () => {
    const content = buildBookingEmailContent("booking_confirmed", data);
    expect(content.subject).toContain("BK-12345678");
    expect(content.html).toContain("Hotel &lt;North&gt;");
    expect(content.html).toContain("Hotel address: 1 Main Street");
    expect(content.text).toContain("Amount confirmed paid: 200.00");
    expect(content.text).toContain("Check-in: 2026-12-10 / Check-out: 2026-12-12");
  });

  it("persists event keys so a repeated event after a restart is not sent twice", async () => {
    const sender = new MockEmailSender();
    const key = bookingEmailEventKey(data.bookingId, "booking_confirmed", "guest", data.hotelId);
    await expect(sendBookingEmail(db, sender, data, "booking_confirmed", "guest", key)).resolves.toMatchObject({ sent: true });
    // A new sender instance represents a restarted Worker; the D1 event key survives it.
    await expect(sendBookingEmail(db, new MockEmailSender(), data, "booking_confirmed", "guest", key)).resolves.toMatchObject({ sent: false });
    expect(sender.sentEmails).toHaveLength(1);
    expect(await db.select().from(bookingEmailEvents).where(eq(bookingEmailEvents.eventKey, key))).toMatchObject([{ status: "sent" }]);
  });

  it("allows only one delivery to claim a notification event concurrently", async () => {
    const sender = new MockEmailSender();
    const key = bookingEmailEventKey(data.bookingId, "booking_received", "guest", data.hotelId);
    const outcomes = await Promise.all([
      sendBookingEmail(db, sender, data, "booking_received", "guest", key),
      sendBookingEmail(db, sender, data, "booking_received", "guest", key),
    ]);
    expect(outcomes.filter(result => result.sent)).toHaveLength(1);
    expect(sender.sentEmails).toHaveLength(1);
  });

  it("records a failed attempt without retrying the same event and sends awaiting-check only to hotel", async () => {
    const failingSender = { sendEmail: async () => { throw new Error("mail unavailable"); } } as EmailSender;
    const failedKey = bookingEmailEventKey(data.bookingId, "booking_received", "guest", data.hotelId);
    await expect(sendBookingEmail(db, failingSender, data, "booking_received", "guest", failedKey)).resolves.toMatchObject({ sent: false, error: "mail unavailable" });
    // A failed event can be retried once the previous attempt is cleared, without duplicating a delivered message.
    const retrySender = new MockEmailSender();
    await expect(sendBookingEmail(db, retrySender, data, "booking_received", "guest", failedKey)).resolves.toMatchObject({ sent: true });
    expect(retrySender.sentEmails).toHaveLength(1);
    // A successfully delivered event is never retried.
    const sentKey = bookingEmailEventKey(data.bookingId, "booking_confirmed", "guest", data.hotelId);
    await sendBookingEmail(db, new MockEmailSender(), data, "booking_confirmed", "guest", sentKey);
    await expect(sendBookingEmail(db, new MockEmailSender(), data, "booking_confirmed", "guest", sentKey)).resolves.toMatchObject({ sent: false });

    const hotelOnlySender = new MockEmailSender();
    const pendingData = { ...data, status: "Awaiting payment verification" };
    await sendBookingEmail(db, hotelOnlySender, pendingData, "booking_awaiting_check", "hotel", bookingEmailEventKey(data.bookingId, "booking_awaiting_check", "hotel", data.hotelId));
    expect(hotelOnlySender.sentEmails.map(email => email.to)).toEqual(["desk@example.test"]);
    expect(hotelOnlySender.sentEmails[0]?.text).toContain("/hotels/hotel-id/bookings");
    expect(hotelOnlySender.sentEmails[0]?.text).not.toContain("guest@example.test");
  });

  it("reports a missing recipient instead of treating a skipped delivery as success", async () => {
    const noGuestEmail = { ...data, guestEmail: null };
    const sender = new MockEmailSender();
    await expect(sendBookingEmail(db, sender, noGuestEmail, "booking_received", "guest", "missing-recipient"))
      .resolves.toMatchObject({ sent: false, error: "No guest notification email is configured." });
    expect(sender.sentEmails).toHaveLength(0);
  });
});
