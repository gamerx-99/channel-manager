import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("guest booking email link", () => {
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const page = readFileSync(resolve(process.cwd(), "client/src/pages/GuestBooking.tsx"), "utf8");
  const router = readFileSync(resolve(process.cwd(), "server/routers/paymentRouter.ts"), "utf8");
  const guestStep = readFileSync(resolve(process.cwd(), "client/src/components/public-hotel/BookingStepGuest.tsx"), "utf8");
  const bookingRouter = readFileSync(resolve(process.cwd(), "server/routers/bookingRouter.ts"), "utf8");

  it("registers a public guest detail page that can continue payment and handles review/confirmed states", () => {
    expect(app).toContain('<Route path="/booking/:id" component={GuestBooking} />');
    expect(page).toContain("trpc.payment.getGuestBooking.useQuery");
    expect(page).toContain("<PaymentQR bookingId={booking.booking_id}");
    expect(page).toContain('booking.status === "pending_verification"');
    expect(page).toContain('booking.status === "confirmed"');
  });

  it("returns guest-safe summary data only after checking the published hotel and booking scope", () => {
    expect(router).toContain("getGuestBooking: rateLimitedProcedure");
    expect(router).toContain("guestPaymentCaller(ctx.db, input.booking_id, input.hotel_id)");
    expect(router).toContain("hotel_slug: row.hotelSlug");
    expect(router).not.toContain("passportNo: guests.passportNo");
  });

  it("requires a guest email so customer booking notifications have a recipient", () => {
    expect(guestStep).toMatch(/type="email"[\s\S]*?required/);
    expect(bookingRouter).toContain("guest_email: z.string().trim().email('Invalid email address.').max(320)");
  });
});
