import { and, asc, eq } from "drizzle-orm";
import { hotelUsers } from "../../drizzle/d1-schema";
import { user as authUser } from "../../drizzle/auth-schema";
import { isSocialPlaceholderEmail } from "@shared/socialAuth";
import type { D1ScopedDatabase } from "../db/scope";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Where hayhost sends the hotel's own notices (new paid booking, slip waiting, SlipOK problems).
 * The hotel's notification email comes first, then a general contact that is an email, then the
 * hotel owner's sign-in email: most owners never fill in a notification email, and without this
 * fallback the hotel heard nothing about its bookings. The owner's sign-in email is never shown
 * to guests; it is only a recipient.
 */
export async function hotelNotificationAddress(
  db: D1ScopedDatabase,
  hotel: { id: string; notificationEmail?: string | null; ownerContact?: string | null },
): Promise<string | null> {
  if (hotel.notificationEmail?.trim()) return hotel.notificationEmail.trim();
  const contact = hotel.ownerContact?.trim() ?? "";
  if (EMAIL_PATTERN.test(contact)) return contact;
  const owners = await db.select({ email: authUser.email }).from(hotelUsers)
    .innerJoin(authUser, eq(authUser.id, hotelUsers.userId))
    .where(and(eq(hotelUsers.hotelId, hotel.id), eq(hotelUsers.role, "hotel_owner")))
    .orderBy(asc(authUser.createdAt));
  return owners.map(owner => owner.email).find(email => EMAIL_PATTERN.test(email) && !isSocialPlaceholderEmail(email)) ?? null;
}
