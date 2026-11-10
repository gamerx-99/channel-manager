import { describe, expect, it } from "vitest";
import { paymentRouter } from "./routers/paymentRouter";
import { bookings, rooms } from "../drizzle/d1-schema";

const BOOKING = "22222222-2222-4222-8222-222222222222";
const HOTEL = "11111111-1111-4111-8111-111111111111";

function makeDb(published = true) {
  let bookingQuery = 0;
  const db = {
    select: () => {
      let table: unknown;
      const chain: any = {
        from(value: unknown) { table = value; return chain; },
        innerJoin() { return chain; },
        where() { return chain; },
        async limit() {
          if (table === bookings) {
            bookingQuery += 1;
            if (bookingQuery === 1) return [{ hotelId: HOTEL, publicEnabled: published }];
            return [{
              id: BOOKING, hotelId: HOTEL, hotelSlug: "sample-hotel", guestName: "Guest Name", checkIn: "2026-12-10", checkOut: "2026-12-12",
              price: "250.00", status: "pending_verification", paymentStatus: "pending", roomId: "room-1", hotelName: "Sample Hotel",
              hotelAddress: "1 Main Street", hotelEmail: "desk@example.test", hotelPhone: "+66 81 234 5678", ownerContact: "owner-contact",
            }];
          }
          if (table === rooms) return [{ name: "Deluxe" }];
          return [];
        },
      };
      return chain;
    },
  };
  return db;
}

describe("payment.getGuestBooking", () => {
  it("returns the guest booking summary and current payment state for the matching published hotel", async () => {
    const caller = paymentRouter.createCaller({ db: makeDb() as never, clientIp: "guest-booking-test", user: null } as never);
    await expect(caller.getGuestBooking({ booking_id: BOOKING, hotel_id: HOTEL })).resolves.toEqual({
      booking_id: BOOKING,
      hotel_id: HOTEL,
      hotel_slug: "sample-hotel",
      hotel_name: "Sample Hotel",
      hotel_address: "1 Main Street",
      hotel_email: "desk@example.test",
      hotel_phone: "+66 81 234 5678",
      guest_name: "Guest Name",
      check_in: "2026-12-10",
      check_out: "2026-12-12",
      room_type: "Deluxe",
      amount: 250,
      status: "pending_verification",
      payment_status: "pending",
    });
  });

  it("does not disclose details for an unpublished hotel", async () => {
    const caller = paymentRouter.createCaller({ db: makeDb(false) as never, clientIp: "guest-booking-test", user: null } as never);
    await expect(caller.getGuestBooking({ booking_id: BOOKING, hotel_id: HOTEL })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
