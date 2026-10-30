import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { hotels, hotelUsers, supportAccessGrants, supportAccessLog } from "../../drizzle/d1-schema";
import { SUPPORT_GRANT_DURATION_HOURS, resolveSupportGrantPermissions } from "@shared/permissions";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";

async function requireOwner(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, action: string, now: Date) {
  return authorizeHotelAction(db, caller, hotelId, "property.manage_support_access", action, now);
}

export async function grantSupportAccess(db: D1ScopedDatabase, caller: D1CallerContext, input: {
  hotelId: string; supportUserId: string; durationHours: number; mode: "view" | "edit";
}, now = new Date()) {
  await requireOwner(db, caller, input.hotelId, "support.grant", now);
  if (!(SUPPORT_GRANT_DURATION_HOURS as readonly number[]).includes(input.durationHours) || !["view", "edit"].includes(input.mode)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose 1, 24, 72 or 168 hours and view or edit access." });
  }
  // ASSUMPTION: an owner approves a known support account by its user id; no bearer
  // secret or account discovery is needed. Never grant access to arbitrary staff ids.
  const identities = await db.select({ role: hotelUsers.role }).from(hotelUsers).where(eq(hotelUsers.userId, input.supportUserId));
  if (!identities.some(row => row.role === "support") || identities.some(row => row.role === "super_admin")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The selected account is not a support account." });
  }
  const [grant] = await db.insert(supportAccessGrants).values({
    hotelId: input.hotelId, supportUserId: input.supportUserId, grantedBy: caller.userId,
    mode: input.mode, createdAt: now, expiresAt: new Date(now.getTime() + input.durationHours * 3600000),
  }).returning();
  return grant;
}

export async function revokeSupportAccess(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, grantId: string, now = new Date()) {
  await requireOwner(db, caller, hotelId, "support.revoke", now);
  const [grant] = await db.update(supportAccessGrants).set({ revokedAt: now }).where(and(
    eq(supportAccessGrants.id, grantId), eq(supportAccessGrants.hotelId, hotelId), isNull(supportAccessGrants.revokedAt),
  )).returning();
  if (!grant) throw new TRPCError({ code: "NOT_FOUND", message: "Active support key not found in this hotel." });
  return grant;
}

export async function listSupportAccess(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  await requireOwner(db, caller, hotelId, "support.audit.read", now);
  const grants = await db.select().from(supportAccessGrants).where(eq(supportAccessGrants.hotelId, hotelId)).orderBy(desc(supportAccessGrants.createdAt));
  const log = await db.select().from(supportAccessLog).where(eq(supportAccessLog.hotelId, hotelId)).orderBy(desc(supportAccessLog.createdAt));
  return { grants, log };
}

/** Request-time projection only: the repositories revalidate every action against D1. */
export async function getSupportMemberships(db: D1ScopedDatabase, caller: D1CallerContext, now = new Date()) {
  if (!caller.userId || caller.access === "public" || caller.roles?.includes("super_admin")) return [];
  const identities = await db.select({ role: hotelUsers.role }).from(hotelUsers).where(eq(hotelUsers.userId, caller.userId));
  if (!identities.some(row => row.role === "support") || identities.some(row => row.role === "super_admin")) return [];
  const grants = await db.select().from(supportAccessGrants).where(and(
    eq(supportAccessGrants.supportUserId, caller.userId), isNull(supportAccessGrants.revokedAt), gt(supportAccessGrants.expiresAt, now),
  ));
  return Array.from(new Set(grants.map(grant => grant.hotelId))).map(hotelId => {
    const hotelGrants = grants.filter(grant => grant.hotelId === hotelId);
    const permissionSets = hotelGrants.map(grant => resolveSupportGrantPermissions({ canEdit: grant.mode === "edit" }));
    return {
      hotelId, role: "support" as const,
      permissions: permissionSets[0]!.filter(permission => permissionSets.every(set => set.includes(permission))),
      // ASSUMPTION: overlapping keys use the existing intersection policy and the
      // earliest expiry for a conservative client refresh boundary.
      expiresAt: new Date(Math.min(...hotelGrants.map(grant => grant.expiresAt.getTime()))),
      mode: hotelGrants.every(grant => grant.mode === "edit") ? "edit" as const : "view" as const,
    };
  });
}

/** Audit the procedure boundary too, including denials before a repository is called.
 * Only resource identifiers are recorded; request bodies can contain guest secrets. */
export async function logSupportProcedure(db: D1ScopedDatabase, caller: D1CallerContext, path: string, input: unknown, denied: boolean) {
  const object = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const hotelStringPaths = ["channelManager.hotel", "channelManager.bookings", "channelManager.availability", "channelManager.exportTm30", "channelManager.previewTm30", "channelManager.listHotelServicesProcedure"];
  const camelHotel = ["access.", "channelManager.ota.", "notifications."].some(prefix => path.startsWith(prefix));
  const hotelField = camelHotel ? "hotelId" : "hotel_id";
  const hotelId = typeof input === "string" && hotelStringPaths.includes(path) ? input : object[hotelField];
  if (typeof hotelId !== "string") return;
  const [hotel] = await db.select({ id: hotels.id }).from(hotels).where(eq(hotels.id, hotelId)).limit(1);
  if (!hotel) return; // A nonexistent hotel cannot have a hotel-scoped audit row.
  const [grant] = await db.select().from(supportAccessGrants).where(and(eq(supportAccessGrants.hotelId, hotelId), eq(supportAccessGrants.supportUserId, caller.userId))).orderBy(desc(supportAccessGrants.createdAt)).limit(1);
  // Raw input precedes Zod's removal of unknown fields. Use each procedure's
  // accepted identifiers so forged aliases/extras cannot corrupt hotel audit trails.
  const identifiers: Record<string, readonly string[]> = {
    "access.updateStaffPermissions": ["targetUserId"],
    "access.grantSupport": ["supportUserId"],
    "access.revokeSupport": ["grantId"],
    "payment.manualVerify": ["booking_id"],
    "notifications.markRead": ["notificationId"],
    "channelManager.createBooking": ["room_id"],
    "channelManager.transitionBookingStatus": ["booking_id"],
    "channelManager.updateAvailability": ["room_type_id"],
    "channelManager.createRateOverride": ["room_type_id"],
    "channelManager.listRateOverrides": ["room_type_id"],
    "channelManager.deleteRateOverride": ["rate_override_id"],
    "channelManager.updateRoomType": ["room_type_id"],
    "channelManager.deleteRoomType": ["room_type_id"],
    "channelManager.updateHotelServiceProcedure": ["service_id"],
    "channelManager.deleteHotelServiceProcedure": ["service_id"],
    "channelManager.createHousekeepingTask": ["room_id", "booking_id", "assigned_to"],
    "channelManager.updateHousekeepingTaskStatus": ["task_id", "booking_id", "assigned_to"],
    "channelManager.listThreads": ["booking_id"],
    "channelManager.createThread": ["booking_id"],
    "channelManager.listMessages": ["thread_id"],
    "channelManager.sendMessage": ["thread_id"],
    "channelManager.updateHotelStaffRole": ["membership_id"],
    "channelManager.removeHotelStaff": ["membership_id"],
    "channelManager.transferHotelAdmin": ["target_membership_id"],
    "channelManager.deleteHotelMedia": ["media_id"],
    "channelManager.setHotelMediaHero": ["media_id"],
    "channelManager.ota.upsertConnection": ["provider", "roomId", "roomTypeId"],
    "channelManager.ota.deleteConnection": ["provider"],
    "channelManager.ota.triggerSync": ["provider"],
  };
  const normalizedPath = path.replace(/^staff\./, "channelManager.");
  const resourceKeys = [hotelField, ...(identifiers[normalizedPath] ?? [])];
  const resources = Object.fromEntries(Object.entries(object).filter(([key, value]) => resourceKeys.includes(key) && typeof value === "string"));
  await db.insert(supportAccessLog).values({ hotelId, supportUserId: caller.userId, grantId: grant?.id ?? null, action: `${denied ? "denied:" : ""}${path}:${JSON.stringify(resources)}` });
}
