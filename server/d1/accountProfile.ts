import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { account as authAccount, user as authUser } from "../../drizzle/auth-schema";
import { hotelUsers, hotels } from "../../drizzle/d1-schema";
import { getHotelBillingState, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";

/**
 * What the "Personal information" page shows about the signed-in account. It takes the account id
 * from the session, never from the request, so it cannot read anyone else's data.
 *
 * The plan belongs to each hotel (`hotel_subscriptions.hotel_id`), not to the account: an owner with
 * two hotels can have Pro on one and Free on the other, so the plan is returned per hotel.
 * Only hotels this account owns are listed (staff memberships are not).
 */
export async function getAccountProfile(db: D1ScopedDatabase, caller: D1CallerContext, userId: string, now = new Date()) {
  const [row] = await db.select({
    id: authUser.id,
    name: authUser.name,
    firstName: authUser.firstName,
    lastName: authUser.lastName,
    phone: authUser.phone,
    email: authUser.email,
    emailVerified: authUser.emailVerified,
    twoFactorEnabled: authUser.twoFactorEnabled,
    createdAt: authUser.createdAt,
  }).from(authUser).where(eq(authUser.id, userId)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });

  // Provider ids only. Tokens and password hashes in the same table are never selected.
  const accountRows = await db.select({ providerId: authAccount.providerId }).from(authAccount).where(eq(authAccount.userId, userId));
  const linkedAccounts = Array.from(new Set(accountRows.map(item => item.providerId))).sort();

  const owned = await db.select({ id: hotels.id, name: hotels.name, slug: hotels.slug, publicEnabled: hotels.publicEnabled })
    .from(hotelUsers).innerJoin(hotels, eq(hotels.id, hotelUsers.hotelId))
    .where(and(eq(hotelUsers.userId, userId), eq(hotelUsers.role, "hotel_owner")))
    .orderBy(asc(hotels.name));

  const ownedHotels = [];
  for (const hotel of owned) {
    const billing = await getHotelBillingState(db, caller, hotel.id, now);
    ownedHotels.push({
      id: hotel.id,
      name: hotel.name,
      slug: hotel.slug,
      publicEnabled: Boolean(hotel.publicEnabled),
      plan: billing.plan,
      planEndsAt: billing.endsAt,
      daysLeft: billing.daysLeft,
    });
  }

  return { ...row, linkedAccounts, ownedHotels };
}
