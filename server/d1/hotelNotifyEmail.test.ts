import { describe, expect, it, vi } from "vitest";
import { hotelNotificationAddress } from "./hotelNotifyEmail";

/** Stand-in for the one owner lookup: select → from → innerJoin → where → orderBy. */
function fakeDb(ownerEmails: string[]) {
  const orderBy = vi.fn(async () => ownerEmails.map(email => ({ email })));
  const db = { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ orderBy }) }) }) }) };
  return { db: db as never, orderBy };
}

describe("hotelNotificationAddress", () => {
  it("uses the hotel's notification email first, without looking up owners", async () => {
    const { db, orderBy } = fakeDb(["owner@example.com"]);
    await expect(hotelNotificationAddress(db, { id: "h", notificationEmail: " desk@hotel.test ", ownerContact: "0615125679" })).resolves.toBe("desk@hotel.test");
    expect(orderBy).not.toHaveBeenCalled();
  });

  it("uses a general contact that is an email", async () => {
    const { db } = fakeDb([]);
    await expect(hotelNotificationAddress(db, { id: "h", notificationEmail: null, ownerContact: "front@hotel.test" })).resolves.toBe("front@hotel.test");
  });

  // Little Bro had only a phone number as its contact, so the hotel never got its booking emails.
  it("falls back to the owner's sign-in email when the hotel set no email at all", async () => {
    const { db } = fakeDb(["owner@example.com"]);
    await expect(hotelNotificationAddress(db, { id: "h", notificationEmail: null, ownerContact: "0615125679" })).resolves.toBe("owner@example.com");
  });

  it("skips a LINE/Facebook placeholder email and returns null when nothing is usable", async () => {
    const { db } = fakeDb(["line.u123@no-email.hayhost.invalid"]);
    await expect(hotelNotificationAddress(db, { id: "h", notificationEmail: "", ownerContact: "" })).resolves.toBeNull();
  });
});
