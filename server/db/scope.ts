import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { checkPermissionEdit, resolveMembershipPermissions, resolveSupportGrantPermissions, toOverrides } from "@shared/permissions";
import { PERMISSIONS, type AppRole, type Permission, isAppRole } from "@shared/authorization";
import { bookings, d1Schema, guests, hotelUsers, hotels, otaConnections, rooms, supportAccessGrants, supportAccessLog } from "../../drizzle/d1-schema";
import { sumMoneyInSatang } from "./money";
import { assertValidTransition, type BookingStatus } from "@shared/bookingLifecycle";
import { getStayDates } from "@shared/stayDates";
import { addNightsStatement, isBookingNightsUniqueConflict, releaseExpiredHoldNightsStatement, releaseNightsStatement } from "../d1/bookingNights";

type D1Client = {
  prepare(query: string): { bind(...values: unknown[]): unknown };
  batch(statements: unknown[]): Promise<Array<{ meta: { changes: number } }>>;
};
export type D1ScopedDatabase = DrizzleD1Database<typeof d1Schema> & { $client: D1Client };

const SYSTEM_CALLER_BRAND: unique symbol = Symbol("D1 system caller");
const GUEST_PAYMENT_BRAND: unique symbol = Symbol("D1 guest payment caller");

/** The only writes an anonymous guest can reach, on one hotel, while paying for a booking. */
const GUEST_PAYMENT_ACTIONS = new Set([
  "payment.config.read",
  "payment_session.create",
  "payment_session.read",
  "payment_session.update",
  "payment_session.finalize",
  "booking.payment_status.update",
  "bookings.status_log.create",
  "bookings.expire",
]);

/** Construct this context from the verified server identity, never from client input. */
export type D1CallerContext = {
  userId: string;
  roles?: readonly AppRole[];
  access?: "authenticated" | "public" | "system" | "guest_payment";
  readonly [SYSTEM_CALLER_BRAND]?: true;
  readonly [GUEST_PAYMENT_BRAND]?: true;
  readonly guestPaymentHotelId?: string;
};

export type D1SystemCallerContext = D1CallerContext & { readonly [SYSTEM_CALLER_BRAND]: true };

/** Create the non-serializable authority used by trusted server jobs such as Cron. */
export function createD1SystemCallerContext(): D1SystemCallerContext {
  return { userId: "system", access: "system", [SYSTEM_CALLER_BRAND]: true };
}

/** Create only after confirming the booking belongs to this published hotel. */
export function createD1GuestPaymentCallerContext(hotelId: string): D1CallerContext & { guestPaymentHotelId: string } {
  return { userId: "", access: "guest_payment", guestPaymentHotelId: hotelId, [GUEST_PAYMENT_BRAND]: true };
}

export function isD1SystemCallerContext(caller: D1CallerContext): caller is D1SystemCallerContext {
  return caller.access === "system" && caller[SYSTEM_CALLER_BRAND] === true;
}

export type PlatformHotelSummary = {
  hotelName: string;
  plan: string | null;
  paymentStatus: string | null;
  roomCount: number;
  syncStatus: "not_configured" | "connected" | "disconnected" | "attention";
};

type Scope = { hotelId: string; userId: string; role: AppRole; permissions: readonly Permission[] };
const permissionSet = new Set<string>(PERMISSIONS);

function forbidden(): never {
  throw new TRPCError({ code: "FORBIDDEN", message: "Hotel access denied." });
}

function requirePermission(scope: Scope, permission: Permission) {
  if (!scope.permissions.includes(permission)) forbidden();
}

async function resolveScope(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  required: Permission,
  action: string,
  now: Date,
): Promise<Scope> {
  if (caller.access === "guest_payment") {
    if (caller[GUEST_PAYMENT_BRAND] !== true || caller.guestPaymentHotelId !== hotelId || !GUEST_PAYMENT_ACTIONS.has(action)) forbidden();
    return { hotelId, userId: "", role: "front_desk", permissions: [required] };
  }
  if (!caller.userId || caller.access === "public") forbidden();
  if (caller.roles?.includes("super_admin")) {
    resolveMembershipPermissions("super_admin");
    forbidden();
  }
  const memberships = await db.select().from(hotelUsers).where(eq(hotelUsers.userId, caller.userId));

  // A super admin never receives a hotel scope; only the summary function below is allowed.
  if (memberships.some(row => row.role === "super_admin")) {
    resolveMembershipPermissions("super_admin");
    forbidden();
  }

  const targetMembership = memberships.find(row => row.hotelId === hotelId);
  const supportIdentity = caller.roles?.includes("support") || memberships.some(row => row.role === "support");
  let scope: Scope;

  if (targetMembership && !supportIdentity) {
    if (!isAppRole(targetMembership.role) || targetMembership.role === "super_admin") forbidden();
    const role = targetMembership.role;
    scope = {
      hotelId,
      userId: caller.userId,
      role,
      permissions: resolveMembershipPermissions(role, {
        grants: targetMembership.permissionGrants,
        revokes: targetMembership.permissionRevokes,
      }),
    };
  } else if (supportIdentity) {
    const activeGrants = await db.select().from(supportAccessGrants).where(and(
      eq(supportAccessGrants.hotelId, hotelId),
      eq(supportAccessGrants.supportUserId, caller.userId),
      isNull(supportAccessGrants.revokedAt),
      gt(supportAccessGrants.expiresAt, now),
    )).orderBy(desc(supportAccessGrants.createdAt));

    const latestHistoricalGrant = activeGrants[0] ?? (await db.select().from(supportAccessGrants).where(and(
      eq(supportAccessGrants.hotelId, hotelId),
      eq(supportAccessGrants.supportUserId, caller.userId),
    )).orderBy(desc(supportAccessGrants.createdAt)).limit(1))[0];
    if (!activeGrants.length) {
      await db.insert(supportAccessLog).values({
        grantId: latestHistoricalGrant?.id ?? null,
        hotelId,
        supportUserId: caller.userId,
        action: `denied:${action}`,
      });
      forbidden();
    }

    // Overlapping grants resolve to their permission intersection, so an older edit key
    // cannot override a newer view-only grant.
    const permissionSets = activeGrants.map(grant => new Set(
      resolveSupportGrantPermissions({ canEdit: grant.mode === "edit" }),
    ));
    const permissions = PERMISSIONS.filter(permission => permissionSets.every(set => set.has(permission)));
    const readOnlyWrite = activeGrants.some(grant => grant.mode !== "edit") && ["notifications.mark_read", "notifications.mark_all_read"].includes(action);
    await db.insert(supportAccessLog).values({
      grantId: activeGrants[0].id,
      hotelId,
      supportUserId: caller.userId,
      action: permissions.includes(required) && !readOnlyWrite ? action : `denied:${action}`,
    });
    if (readOnlyWrite) forbidden();
    scope = { hotelId, userId: caller.userId, role: "support", permissions };
  } else {
    // admin (platform admin) no longer has cross-hotel read (spec 14 S5).
    forbidden();
  }

  requirePermission(scope, required);
  return scope;
}

/** Shared authorization entry point for the D1 repositories. */
export async function authorizeHotelAction(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  permission: Permission,
  action: string,
  now = new Date(),
) {
  return resolveScope(db, caller, hotelId, permission, action, now);
}

export async function authorizePlatformAction(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  permission: Permission,
) {
  if (!caller.userId || caller.access === "public") forbidden();
  const memberships = await db.select({ role: hotelUsers.role }).from(hotelUsers).where(eq(hotelUsers.userId, caller.userId));
  if (!caller.roles?.includes("super_admin") && !memberships.some(row => row.role === "super_admin")) forbidden();
  if (!resolveMembershipPermissions("super_admin").includes(permission)) forbidden();
}

/** Resolve public-facing records only for server-created public request contexts. */
export async function requirePublicHotel(db: D1ScopedDatabase, caller: D1CallerContext, slug: string) {
  if (caller.access !== "public") forbidden();
  const [hotel] = await db.select().from(hotels).where(and(
    eq(hotels.slug, slug), eq(hotels.publicEnabled, true),
  )).limit(1);
  if (!hotel) throw new TRPCError({ code: "NOT_FOUND", message: "Hotel not found or not published." });
  return hotel;
}

export async function listHotelBookings(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date()) {
  const scope = await resolveScope(db, caller, hotelId, "operations.view_bookings", "bookings.read", now);
  return db.select().from(bookings).where(eq(bookings.hotelId, scope.hotelId));
}

export async function listBookingGuests(
  db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, bookingId: string, now = new Date(),
) {
  const scope = await resolveScope(db, caller, hotelId, "operations.manage_guests", "guests.read", now);
  return db.select({
    id: guests.id,
    bookingId: guests.bookingId,
    firstName: guests.firstName,
    middleName: guests.middleName,
    lastName: guests.lastName,
    gender: guests.gender,
    passportNo: guests.passportNo,
    nationalityCode: guests.nationalityCode,
    birthDate: guests.birthDate,
    phoneNo: guests.phoneNo,
  }).from(guests).innerJoin(bookings, eq(guests.bookingId, bookings.id)).where(and(
    eq(bookings.hotelId, scope.hotelId), eq(bookings.id, bookingId),
  ));
}

export async function getHotelBookingValueSatang(
  db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, now = new Date(),
): Promise<bigint> {
  const scope = await resolveScope(db, caller, hotelId, "property.view_financials", "financials.read", now);
  const rows = await db.select({ amount: sql<string>`cast(${bookings.price} as text)` })
    .from(bookings).where(eq(bookings.hotelId, scope.hotelId));
  return sumMoneyInSatang(rows.map(row => row.amount));
}

export async function cancelHotelBooking(
  db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, bookingId: string, now = new Date(), reason: string | null = null,
) {
  const scope = await resolveScope(db, caller, hotelId, "operations.cancel_bookings", "bookings.cancel", now);
  const [current] = await db.select({ id: bookings.id, status: bookings.status, roomId: bookings.roomId, checkIn: bookings.checkIn, checkOut: bookings.checkOut }).from(bookings).where(and(
    eq(bookings.id, bookingId), eq(bookings.hotelId, scope.hotelId),
  )).limit(1);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  try {
    assertValidTransition(current.status as BookingStatus, "cancelled");
  } catch {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Booking cannot be cancelled from status ${current.status}.` });
  }
  let results: Awaited<ReturnType<typeof db.$client.batch>>;
  try { results = await db.$client.batch([
    releaseExpiredHoldNightsStatement(db, { roomId: current.roomId ?? "" }, now),
    db.$client.prepare("update bookings set status = ? where id = ? and hotel_id = ? and status = ?")
      .bind("cancelled", bookingId, scope.hotelId, current.status),
    db.$client.prepare(`insert into booking_status_log
      (id, booking_id, from_status, to_status, changed_by, reason)
      select ?, ?, ?, 'cancelled', ?, ? where changes() = 1`)
      .bind(crypto.randomUUID(), bookingId, current.status, caller.userId, reason),
    addNightsStatement(db, bookingId, getStayDates(current.checkIn, current.checkOut), now),
    releaseNightsStatement(db, bookingId, now),
  ]); } catch (error) {
    if (isBookingNightsUniqueConflict(error)) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected room is no longer available for the requested dates." });
    throw error;
  }
  const updated = results[1]!;
  const audit = results[2]!;
  if (updated.meta.changes !== 1) throw new TRPCError({ code: "CONFLICT", message: "Booking status changed; reload and try again." });
  if (audit.meta.changes !== 1) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Booking cancellation audit was not written." });
  return { id: bookingId };
}

export async function updateHotelStaffPermissions(
  db: D1ScopedDatabase,
  caller: D1CallerContext,
  hotelId: string,
  targetUserId: string,
  nextPermissions: readonly Permission[],
  now = new Date(),
) {
  const actor = await resolveScope(db, caller, hotelId, "property.manage_staff", "staff.permissions.update", now);
  if (nextPermissions.some(permission => !permissionSet.has(permission))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown permission." });
  }
  const [target] = await db.select().from(hotelUsers).where(and(
    eq(hotelUsers.hotelId, actor.hotelId), eq(hotelUsers.userId, targetUserId),
  )).limit(1);
  if (!target || !isAppRole(target.role)) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });

  const targetRole = target.role;
  const targetPermissions = resolveMembershipPermissions(targetRole, {
    grants: target.permissionGrants,
    revokes: target.permissionRevokes,
  });
  const normalizedNextPermissions = resolveMembershipPermissions(targetRole, toOverrides(targetRole, nextPermissions));
  const check = checkPermissionEdit({
    actorId: actor.userId,
    actorRole: actor.role,
    actorPermissions: actor.permissions,
    targetId: target.userId,
    targetRole,
    targetPermissions,
    nextPermissions: normalizedNextPermissions,
  });
  if (!check.ok) forbidden();

  const { grants, revokes } = toOverrides(targetRole, normalizedNextPermissions);
  await db.update(hotelUsers).set({ permissionGrants: grants, permissionRevokes: revokes }).where(and(
    eq(hotelUsers.hotelId, actor.hotelId), eq(hotelUsers.userId, targetUserId),
  ));
  return { grants, revokes };
}

export async function listPlatformHotelSummaries(
  db: D1ScopedDatabase, caller: D1CallerContext,
): Promise<PlatformHotelSummary[]> {
  await authorizePlatformAction(db, caller, "platform.view_system_logs");

  const rows = await db.select({
    hotelName: hotels.name,
    roomCount: sql<number>`count(distinct ${rooms.id})`,
    syncStatus: sql<PlatformHotelSummary["syncStatus"]>`case
      when count(distinct ${otaConnections.id}) = 0 then 'not_configured'
      when sum(case when ${otaConnections.status} in ('conflict', 'error') then 1 else 0 end) > 0 then 'attention'
      when sum(case when ${otaConnections.status} in ('active', 'connected') then 1 else 0 end) > 0 then 'connected'
      else 'disconnected' end`,
  }).from(hotels).leftJoin(rooms, eq(rooms.hotelId, hotels.id))
    .leftJoin(otaConnections, eq(otaConnections.hotelId, hotels.id)).groupBy(hotels.id, hotels.name);

  // SaaS billing tables do not exist in D1 yet (spec 12 remains blocked).
  return rows.map(row => ({ ...row, plan: null, paymentStatus: null }));
}
