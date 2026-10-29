import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { hotelSignupLinks, hotelUsers, hotels } from "../../drizzle/d1-schema";
import { authorizePlatformAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import { generateSignupToken, deriveSignupLinkStatus } from "../signupLinks";

export type SignupLinkRecord = {
  id: string;
  hotel_id: string;
  token: string;
  created_by: string;
  expires_at: string;
  used_at: string | null;
  used_by_user_id: string | null;
  created_at: string;
};

export async function createSignupLink(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  input: { hotel_id: string; expiresInHours: number },
  now = new Date(),
) {
  await authorizePlatformAction(db, caller, "platform.manage_signup_links");

  const [hotel] = await db
    .select({ id: hotels.id, name: hotels.name })
    .from(hotels)
    .where(eq(hotels.id, input.hotel_id))
    .limit(1);
  if (!hotel) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Hotel not found." });
  }

  // Enforce single Hotel Admin invariant
  const existingOwners = await db
    .select({ id: hotelUsers.id })
    .from(hotelUsers)
    .where(and(eq(hotelUsers.hotelId, input.hotel_id), eq(hotelUsers.role, "hotel_owner")));
  if (existingOwners.length > 0) {
    throw new TRPCError({ code: "CONFLICT", message: "This hotel already has a Hotel Admin assigned." });
  }

  const boundedHours = Math.min(Math.max(Math.trunc(input.expiresInHours), 1), 720);
  const token = generateSignupToken();
  const expiresAt = new Date(now.getTime() + boundedHours * 60 * 60 * 1000);

  const [row] = await db
    .insert(hotelSignupLinks)
    .values({
      id: crypto.randomUUID(),
      hotelId: input.hotel_id,
      token,
      createdBy: caller.userId,
      expiresAt,
      createdAt: now,
    })
    .returning();

  if (!row) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create hotel signup link." });
  }

  return {
    id: row.id,
    hotel_id: row.hotelId,
    token: row.token,
    created_by: row.createdBy,
    expires_at: row.expiresAt.toISOString(),
    used_at: row.usedAt ? row.usedAt.toISOString() : null,
    used_by_user_id: row.usedByUserId,
    created_at: row.createdAt.toISOString(),
  };
}

export async function getValidSignupLink(
  db: D1ScopedDatabase,
  token: string,
  now = new Date(),
): Promise<{ id: string; hotel_id: string; token: string; hotelName: string } | null> {
  const [row] = await db
    .select({
      id: hotelSignupLinks.id,
      hotelId: hotelSignupLinks.hotelId,
      token: hotelSignupLinks.token,
      hotelName: hotels.name,
    })
    .from(hotelSignupLinks)
    .innerJoin(hotels, eq(hotelSignupLinks.hotelId, hotels.id))
    .where(
      and(
        eq(hotelSignupLinks.token, token),
        isNull(hotelSignupLinks.usedAt),
        gt(hotelSignupLinks.expiresAt, now),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    hotel_id: row.hotelId,
    token: row.token,
    hotelName: row.hotelName,
  };
}

export async function redeemSignupLink(
  db: D1ScopedDatabase,
  token: string,
  userId: string,
  now = new Date(),
): Promise<{ id: string; hotel_id: string } | null> {
  const [row] = await db
    .update(hotelSignupLinks)
    .set({
      usedAt: now,
      usedByUserId: userId,
    })
    .where(
      and(
        eq(hotelSignupLinks.token, token),
        isNull(hotelSignupLinks.usedAt),
        gt(hotelSignupLinks.expiresAt, now),
      ),
    )
    .returning({
      id: hotelSignupLinks.id,
      hotelId: hotelSignupLinks.hotelId,
    });

  if (!row) return null;
  return { id: row.id, hotel_id: row.hotelId };
}

export async function createHotelOwnerMembership(
  db: D1ScopedDatabase,
  hotelId: string,
  userId: string,
  now = new Date(),
): Promise<void> {
  const [created] = await db
    .insert(hotelUsers)
    .values({
      id: crypto.randomUUID(),
      hotelId,
      userId,
      role: "hotel_owner",
      permissionGrants: [],
      permissionRevokes: [],
      createdAt: now,
    })
    .returning({ id: hotelUsers.id });

  if (!created) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to bind hotel owner membership." });
  }
}

export async function listSignupLinksForHotel(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  now = new Date(),
) {
  await authorizePlatformAction(db, caller, "platform.manage_signup_links");

  const rows = await db
    .select()
    .from(hotelSignupLinks)
    .where(eq(hotelSignupLinks.hotelId, hotelId))
    .orderBy(desc(hotelSignupLinks.createdAt));

  return rows.map(row => {
    const expiresAtStr = row.expiresAt.toISOString();
    const usedAtStr = row.usedAt ? row.usedAt.toISOString() : null;
    const status = deriveSignupLinkStatus({ expires_at: expiresAtStr, used_at: usedAtStr }, now);
    return {
      id: row.id,
      hotel_id: row.hotelId,
      token: row.token,
      created_by: row.createdBy,
      expires_at: expiresAtStr,
      used_at: usedAtStr,
      used_by_user_id: row.usedByUserId,
      created_at: row.createdAt.toISOString(),
      status,
    };
  });
}
