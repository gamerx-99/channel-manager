import { describe, expect, it } from "vitest";
import { authorizeHotelAction, createD1GuestPaymentCallerContext, type D1ScopedDatabase } from "./scope";

const db = {} as D1ScopedDatabase;
const guest = createD1GuestPaymentCallerContext("hotel-a");

describe("guest payment caller", () => {
  it("reaches payment actions on its own hotel with only the requested permission", async () => {
    await expect(authorizeHotelAction(db, guest, "hotel-a", "operations.manage_bookings", "payment_session.create"))
      .resolves.toMatchObject({ permissions: ["operations.manage_bookings"] });
  });

  it("reads the SlipOK credentials to verify a slip, but cannot manage them", async () => {
    await expect(authorizeHotelAction(db, guest, "hotel-a", "operations.manage_bookings", "payment.slipok.verify_credentials"))
      .resolves.toMatchObject({ permissions: ["operations.manage_bookings"] });
    for (const action of ["payment.slipok.read", "payment.slipok.save", "payment.slipok.remove"]) {
      await expect(authorizeHotelAction(db, guest, "hotel-a", "property.manage_profile", action))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("cannot reach another hotel", async () => {
    await expect(authorizeHotelAction(db, guest, "hotel-b", "operations.manage_bookings", "payment_session.create"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cannot reach any other action", async () => {
    await expect(authorizeHotelAction(db, guest, "hotel-a", "operations.manage_bookings", "bookings.list"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(authorizeHotelAction(db, guest, "hotel-a", "property.manage_staff", "staff.invite"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cannot be forged from plain data", async () => {
    const forged = { userId: "", access: "guest_payment" as const, guestPaymentHotelId: "hotel-a" };

    await expect(authorizeHotelAction(db, forged, "hotel-a", "operations.manage_bookings", "payment_session.create"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
