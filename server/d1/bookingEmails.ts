import type { EmailSender } from "../email";
import { escapeHtml } from "@shared/escapeHtml";
import { eq, and } from "drizzle-orm";
import { bookingEmailEvents } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";

/**
 * Booking notification emails. Three notices, one per real booking event:
 * - `booking_received`: a booking was saved and is now awaiting payment / check
 *   (a booking-received notice, not a confirmation).
 * - `booking_awaiting_check`: a slip was sent and the booking waits for staff check.
 * - `booking_confirmed`: the booking actually became confirmed (SlipOK verified, or a
 *   staff member confirmed); only this event sends the confirmation.
 *
 * Every notification is bound to a durable unique event key of
 * `bookingId + email type + recipient`.
 */
export type BookingEmailType = "booking_received" | "booking_awaiting_check" | "booking_confirmed";

export type BookingEmailRecipient = "guest" | "hotel";

export type BookingEmailData = {
  bookingId: string;
  hotelId: string;
  hotelName: string;
  /** Hotel notification email; separate from `hotels.owner_contact`, which is a general contact. */
  hotelContactEmail: string | null;
  /** Where the hotel's own copy goes; may be the owner's sign-in email, so it is never shown to guests. */
  hotelRecipientEmail?: string | null;
  hotelContactPhone: string | null;
  hotelAddress: string;
  bookingRef: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  roomTypeName: string;
  amount: string;
  status: string;
  guestEmail: string | null;
  /** Guest link to the public booking details/payment page. */
  bookingUrl: string;
  /** Staff link to the hotel's booking list. */
  hotelBookingUrl: string;
  /** Verified sender identity; hotel/guest notifications fall back to the transport default. */
  from?: string | null;
};

export function bookingEmailEventKey(bookingId: string, emailType: BookingEmailType, recipient: BookingEmailRecipient, hotelId?: string, eventId?: string) {
  return [bookingId, emailType, recipient, hotelId ?? "", eventId ?? ""].join(":");
}

export function buildBookingEmailContent(emailType: BookingEmailType, data: BookingEmailData) {
  const hotelNameHtml = escapeHtml(data.hotelName);
  const bookingRefHtml = escapeHtml(data.bookingRef);
  const guestNameHtml = escapeHtml(data.guestName);
  const roomTypeHtml = escapeHtml(data.roomTypeName);
  const statusHtml = escapeHtml(data.status);
  const checkInHtml = escapeHtml(data.checkIn);
  const checkOutHtml = escapeHtml(data.checkOut);
  const amountHtml = escapeHtml(data.amount);
  const bookingUrlHtml = escapeHtml(data.bookingUrl);

  if (emailType === "booking_received") {
    const subject = `Booking received at ${data.hotelName} (${data.bookingRef})`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">Booking received</h2>
        <p style="font-size: 16px; line-height: 24px;">
          We received the booking details for <strong>${hotelNameHtml}</strong>.
        </p>
        <p style="font-size: 16px; line-height: 24px;">
          Booking reference: <strong>${bookingRefHtml}</strong><br />
          Guest: ${guestNameHtml}<br />
          Check-in: ${checkInHtml} &hellip; ${checkOutHtml}<br />
          Room type: ${roomTypeHtml}<br />
          Amount due: ${amountHtml}<br />
          Status: ${statusHtml}
        </p>
        <div style="margin: 32px 0;">
          <a href="${bookingUrlHtml}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
            View booking details
          </a>
        </div>
        <p style="font-size: 12px; color: #94a3b8; line-height: 18px;">
          This is a booking-received notice, not a confirmation. The booking is now awaiting payment or verification.
        </p>
      </div>`;
    const text = `Booking received at ${data.hotelName}\nBooking reference: ${data.bookingRef}\nGuest: ${data.guestName}\nCheck-in: ${data.checkIn} / Check-out: ${data.checkOut}\nRoom type: ${data.roomTypeName}\nAmount due: ${data.amount}\nStatus: ${data.status}\nBooking link: ${data.bookingUrl}\n\nThis is a booking-received notice, not a confirmation. The booking is now awaiting payment or verification.`;
    return { subject, html: `${html}\n<p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:24px;">Powered by hayhost</p>`, text: `${text}\n\nPowered by hayhost` };
  }

  if (emailType === "booking_awaiting_check") {
    const subject = `Booking awaiting check: ${data.bookingRef} at ${data.hotelName}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">Booking awaiting check</h2>
        <p style="font-size: 16px; line-height: 24px;">
          A guest booking at <strong>${hotelNameHtml}</strong> (${data.bookingRef}) is waiting for staff verification.
        </p>
        <p style="font-size: 16px; line-height: 24px;">
          Guest: ${guestNameHtml}<br />
          Check-in: ${checkInHtml} &hellip; ${checkOutHtml}<br />
          Room type: ${roomTypeHtml}<br />
          Amount reported paid: ${amountHtml}<br />
          Status: ${statusHtml}
        </p>
        <div style="margin: 32px 0;">
          <a href="${bookingUrlHtml}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
            Review booking
          </a>
        </div>
        <p style="font-size: 12px; color: #94a3b8; line-height: 18px;">
          The guest has not received a confirmation yet; it will be sent only when the check is confirmed.
        </p>
      </div>`;
    const text = `Booking awaiting check at ${data.hotelName}\nBooking reference: ${data.bookingRef}\nGuest: ${data.guestName}\nCheck-in: ${data.checkIn} / Check-out: ${data.checkOut}\nRoom type: ${data.roomTypeName}\nAmount reported paid: ${data.amount}\nStatus: ${data.status}\nBooking link: ${data.hotelBookingUrl}`;
    return { subject, html: `${html}\n<p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:24px;">Powered by hayhost</p>`, text: `${text}\n\nPowered by hayhost` };
  }

  const subject = `Booking confirmed: ${data.bookingRef} at ${data.hotelName}`;
  const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">Booking confirmed</h2>
        <p style="font-size: 16px; line-height: 24px;">
          The booking at <strong>${hotelNameHtml}</strong> is confirmed.
        </p>
        <p style="font-size: 16px; line-height: 24px;">
          Booking reference: <strong>${bookingRefHtml}</strong><br />
          Hotel address: ${escapeHtml(data.hotelAddress)}<br />
          Hotel email: ${escapeHtml(data.hotelContactEmail ?? "—")}<br />
          Hotel phone: ${escapeHtml(data.hotelContactPhone ?? "—")}<br />
          Guest: ${guestNameHtml}<br />
          Check-in: ${checkInHtml} &hellip; ${checkOutHtml}<br />
          Room type: ${roomTypeHtml}<br />
          Amount confirmed paid: ${amountHtml}<br />
          Status: ${statusHtml}
        </p>
        <div style="margin: 32px 0;">
          <a href="${bookingUrlHtml}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
            View booking details
          </a>
        </div>
        <p style="font-size: 12px; color: #94a3b8; line-height: 18px;">
          Payment has been verified and this booking is confirmed.
        </p>
      </div>`;
  const text = `Booking confirmed at ${data.hotelName}\nHotel address: ${data.hotelAddress}\nHotel email: ${data.hotelContactEmail ?? "—"}\nHotel phone: ${data.hotelContactPhone ?? "—"}\nBooking reference: ${data.bookingRef}\nGuest: ${data.guestName}\nCheck-in: ${data.checkIn} / Check-out: ${data.checkOut}\nRoom type: ${data.roomTypeName}\nAmount confirmed paid: ${data.amount}\nStatus: ${data.status}\nBooking link: ${data.bookingUrl}`;
  return { subject, html: `${html}\n<p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:24px;">Powered by hayhost</p>`, text: `${text}\n\nPowered by hayhost` };
}

/**
 * Send one booking notification to one recipient. The event key makes the
 * notification non-duplicate across Worker restarts. A delivery failure is
 * recorded and never changes the booking state. The hotel is the
 * recipient of the awaiting-check notice; the guest and the hotel share the
 * received and confirmed notices.
 */
export async function sendBookingEmail(
  db: D1ScopedDatabase,
  emailSender: EmailSender,
  data: BookingEmailData,
  emailType: BookingEmailType,
  recipient: BookingEmailRecipient,
  eventKey: string,
): Promise<{ sent: boolean; eventKey: string; error?: string }> {
  const to = recipient === "hotel" ? (data.hotelRecipientEmail ?? data.hotelContactEmail) : data.guestEmail;
  if (!to) {
    // No recipient address exists (for example the hotel set no notification email),
    // so nothing is sent. The caller logs this instead of treating it as a delivery.
    return { sent: false, eventKey, error: `No ${recipient} notification email is configured.` };
  }
  // A previous failed attempt must not permanently block retries: drop its row so
  // the same event can be tried again. Sent events are never removed, so a
  // delivered message is never duplicated.
  await db.delete(bookingEmailEvents).where(and(eq(bookingEmailEvents.eventKey, eventKey), eq(bookingEmailEvents.status, "failed")));
  const [claim] = await db.insert(bookingEmailEvents).values({ id: crypto.randomUUID(), eventKey, status: "sending" })
    .onConflictDoNothing({ target: bookingEmailEvents.eventKey }).returning({ id: bookingEmailEvents.id });
  if (!claim) return { sent: false, eventKey };

  const content = buildBookingEmailContent(emailType, data);
  const bookingUrl = recipient === "hotel" ? data.hotelBookingUrl : data.bookingUrl;
  const recipientContent = recipient === "hotel"
    ? { ...content, html: content.html.replaceAll(escapeHtml(data.bookingUrl), escapeHtml(bookingUrl)), text: content.text.replaceAll(data.bookingUrl, bookingUrl) }
    : content;
  try {
    const delivery = await emailSender.sendEmail({ to, subject: recipientContent.subject, html: recipientContent.html, text: recipientContent.text, from: data.from ?? undefined });
    if (!delivery.success) throw new Error("Email provider did not accept the message.");
    await db.update(bookingEmailEvents).set({ status: "sent", sentAt: new Date() }).where(eq(bookingEmailEvents.id, claim.id));
    return { sent: true, eventKey };
  } catch (error) {
    await db.update(bookingEmailEvents).set({ status: "failed" }).where(eq(bookingEmailEvents.id, claim.id)).catch(() => undefined);
    const message = error instanceof Error ? error.message : "unknown error";
    return { sent: false, eventKey, error: message };
  }
}
