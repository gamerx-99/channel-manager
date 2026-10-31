import { assertStaffPermissionChange } from "./staffAuthorization";
import { resolveMembershipPermissions } from "@shared/permissions";
import { type AppRole } from "@shared/authorization";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { hotelAdminAuditLogs, hotelUsers, hotels } from "../../drizzle/d1-schema";
import { account, session, user } from "../../drizzle/auth-schema";
import { authorizeHotelAction, authorizePlatformAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import { ASSIGNABLE_STAFF_ROLES, isHumanRole, type HumanRole } from "@shared/authorization";

export async function listHotelOptions(db: D1ScopedDatabase, caller: D1CallerContext) {
  await authorizePlatformAction(db, caller, "platform.manage_users");
  return db.select({ id: hotels.id, name: hotels.name }).from(hotels).orderBy(asc(hotels.name));
}

export async function listHotelUserAssignments(db: D1ScopedDatabase, caller: D1CallerContext) {
  if (!caller.userId || caller.access === "public") throw new TRPCError({ code: "FORBIDDEN" });
  const memberships = await db.select().from(hotelUsers).where(eq(hotelUsers.userId, caller.userId));
  if (caller.roles?.includes("super_admin") || memberships.some(row => row.role === "super_admin")) {
    await authorizePlatformAction(db, caller, "platform.manage_users");
    const rows = await db.select().from(hotelUsers).orderBy(desc(hotelUsers.createdAt));
    return Promise.all(rows.map(row => assignmentWithHotel(db, row)));
  }
  const hotelIds = new Set<string>();
  for (const membership of memberships) {
    try {
      await authorizeHotelAction(db, caller, membership.hotelId, "property.manage_staff", "staff.assignments.list");
      hotelIds.add(membership.hotelId);
    } catch (error) {
      if (error instanceof TRPCError && error.code === "FORBIDDEN") continue;
      throw error;
    }
  }
  const rows = await db.select().from(hotelUsers).orderBy(desc(hotelUsers.createdAt));
  return Promise.all(rows.filter(row => hotelIds.has(row.hotelId) && ASSIGNABLE_STAFF_ROLES.includes(row.role as typeof ASSIGNABLE_STAFF_ROLES[number])).map(row => assignmentWithHotel(db, row)));
}

async function assignmentWithHotel(db: D1ScopedDatabase, row: typeof hotelUsers.$inferSelect) {
  const [hotel] = await db.select({ name: hotels.name }).from(hotels).where(eq(hotels.id, row.hotelId)).limit(1);
  return { id: row.id, hotel_id: row.hotelId, user_id: row.userId, role: row.role, created_at: row.createdAt, hotels: hotel ?? null };
}

export async function createHotelUserAssignment(db: D1ScopedDatabase, caller: D1CallerContext, input: { hotel_id: string; user_id: string; role: HumanRole }, now = new Date()) {
  const actor = await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_staff", "staff.assignment.create", now);
  if (!ASSIGNABLE_STAFF_ROLES.includes(input.role as typeof ASSIGNABLE_STAFF_ROLES[number])) throw new TRPCError({ code: "BAD_REQUEST", message: "Role cannot be assigned to hotel staff." });
  assertStaffPermissionChange(actor, input.user_id, input.role);
  const [row] = await db.insert(hotelUsers).values({ hotelId: input.hotel_id, userId: input.user_id, role: input.role }).returning();
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hotel membership insert returned no record." });
  return assignmentWithHotel(db, row);
}

export async function updateHotelUserAssignmentRole(db: D1ScopedDatabase, caller: D1CallerContext, input: { membership_id: string; hotel_id: string; role: HumanRole }, now = new Date()) {
  const actor = await authorizeHotelAction(db, caller, input.hotel_id, "property.manage_staff", "staff.assignment.update", now);
  if (!ASSIGNABLE_STAFF_ROLES.includes(input.role as typeof ASSIGNABLE_STAFF_ROLES[number])) throw new TRPCError({ code: "BAD_REQUEST", message: "Role cannot be assigned to hotel staff." });
  const [target] = await db.select().from(hotelUsers).where(and(eq(hotelUsers.id, input.membership_id), eq(hotelUsers.hotelId, input.hotel_id))).limit(1);
  if (!target) return null;
  assertStaffPermissionChange(actor, target.userId, input.role, target);
  const [row] = await db.update(hotelUsers).set({ role: input.role, permissionGrants: [], permissionRevokes: [] }).where(and(
    eq(hotelUsers.id, input.membership_id), eq(hotelUsers.hotelId, input.hotel_id),
  )).returning();
  return row ? assignmentWithHotel(db, row) : null;
}

export async function deleteHotelUserAssignment(db: D1ScopedDatabase, caller: D1CallerContext, membershipId: string, now = new Date()) {
  const [target] = await db.select().from(hotelUsers).where(eq(hotelUsers.id, membershipId)).limit(1);
  if (!target) return null;
  const actor = await authorizeHotelAction(db, caller, target.hotelId, "property.manage_staff", "staff.assignment.delete", now);
  assertStaffPermissionChange(actor, target.userId, target.role as AppRole, target, []);
  const [row] = await db.delete(hotelUsers).where(and(eq(hotelUsers.id, membershipId), eq(hotelUsers.hotelId, target.hotelId))).returning({ id: hotelUsers.id });
  return row ?? null;
}

type StaffAuthUser = { id: string; email: string | null; confirmed_at: string | null; last_sign_in_at: string | null };

/**
 * Email and sign-in state for this hotel's members, from the Better Auth tables.
 * A member is confirmed once they hold a password (self-signup or an accepted
 * invite); last sign-in is the newest live session, since sign-out deletes it.
 */
async function loadStaffAuthUsers(db: D1ScopedDatabase, userIds: string[]): Promise<StaffAuthUser[]> {
  if (!userIds.length) return [];
  const [users, credentials, sessions] = await Promise.all([
    db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, userIds)),
    db.select({ userId: account.userId, createdAt: account.createdAt }).from(account)
      .where(and(inArray(account.userId, userIds), eq(account.providerId, "credential"))),
    db.select({ userId: session.userId, createdAt: session.createdAt }).from(session).where(inArray(session.userId, userIds)),
  ]);
  const earliest = new Map<string, Date>();
  for (const row of credentials) if (!earliest.has(row.userId) || row.createdAt < earliest.get(row.userId)!) earliest.set(row.userId, row.createdAt);
  const latest = new Map<string, Date>();
  for (const row of sessions) if (!latest.has(row.userId) || row.createdAt > latest.get(row.userId)!) latest.set(row.userId, row.createdAt);
  return users.map(row => ({
    id: row.id,
    email: row.email,
    confirmed_at: earliest.get(row.id)?.toISOString() ?? null,
    last_sign_in_at: latest.get(row.id)?.toISOString() ?? null,
  }));
}

/** `authUsers` overrides the lookup (tests); by default it is read from D1 after the permission check. */
export async function listHotelStaff(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, authUsers?: StaffAuthUser[], now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_staff", "staff.list", now);
  const otherRows = await db.select().from(hotelUsers).where(eq(hotelUsers.hotelId, hotelId)).orderBy(desc(hotelUsers.createdAt));
  const resolved = authUsers ?? await loadStaffAuthUsers(db, Array.from(new Set(otherRows.map(row => row.userId))));
  const users = new Map(resolved.map(user => [user.id, user]));
  return Promise.all(otherRows.filter(row => ASSIGNABLE_STAFF_ROLES.includes(row.role as typeof ASSIGNABLE_STAFF_ROLES[number])).map(async row => {
    const assignment = await assignmentWithHotel(db, row);
    const user = users.get(row.userId);
    return { ...assignment, permissions: resolveMembershipPermissions(row.role as AppRole, { grants: row.permissionGrants, revokes: row.permissionRevokes }), email: user?.email ?? null, confirmed_at: user?.confirmed_at ?? null, last_sign_in_at: user?.last_sign_in_at ?? null };
  }));
}

export async function listHotelAdminAuditLogs(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, limit = 50, now = new Date()) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_staff", "staff.admin_audit.read", now);
  const bounded = Math.min(Math.max(Math.trunc(limit), 1), 100);
  return db.select().from(hotelAdminAuditLogs).where(eq(hotelAdminAuditLogs.hotelId, hotelId)).orderBy(desc(hotelAdminAuditLogs.createdAt)).limit(bounded);
}

export async function transferHotelAdmin(db: D1ScopedDatabase, caller: D1CallerContext, input: { hotel_id: string; target_membership_id: string }, now = new Date()) {
  await authorizeHotelAction(db, caller, input.hotel_id, "property.transfer_ownership", "staff.admin.transfer", now);
  const [target] = await db.select().from(hotelUsers).where(and(eq(hotelUsers.id, input.target_membership_id), eq(hotelUsers.hotelId, input.hotel_id))).limit(1);
  const [current] = await db.select().from(hotelUsers).where(and(eq(hotelUsers.hotelId, input.hotel_id), eq(hotelUsers.role, "hotel_owner"))).limit(1);
  if (!target || !isHumanRole(target.role) || target.role === "super_admin" || target.role === "admin" || target.role === "support") return null;
  if (!current || current.id === target.id) return null;
  const [previousAdminMembershipId, previousAdminUserId, newAdminMembershipId, newAdminUserId] = [current.id, current.userId, target.id, target.userId];
  const [updateResult, newAdminResult, auditResult] = await db.$client.batch([
    db.$client.prepare(`update hotel_users set role = ?, permission_grants = ?, permission_revokes = ?
      where id = ? and hotel_id = ? and role = 'hotel_owner'
        and exists (select 1 from hotel_users target where target.id = ? and target.hotel_id = ? and target.role = ?)`)
      .bind(target.role, JSON.stringify(target.permissionGrants), JSON.stringify(target.permissionRevokes), current.id, input.hotel_id, target.id, input.hotel_id, target.role),
    db.$client.prepare("update hotel_users set role = 'hotel_owner', permission_grants = '[]', permission_revokes = '[]' where id = ? and hotel_id = ? and role = ? and changes() = 1")
      .bind(target.id, input.hotel_id, target.role),
    db.$client.prepare(`insert into hotel_admin_audit_logs (id, hotel_id, actor_user_id, actor_email, action, previous_admin_membership_id, previous_admin_user_id, new_admin_membership_id, new_admin_user_id, details)
      select ?, ?, ?, null, 'hotel_admin_transfer', ?, ?, ?, ?, '{}' where changes() = 1`)
      .bind(crypto.randomUUID(), input.hotel_id, caller.userId, previousAdminMembershipId, previousAdminUserId, newAdminMembershipId, newAdminUserId),
  ]);
  if (updateResult.meta.changes !== 1 || newAdminResult.meta.changes !== 1 || auditResult.meta.changes !== 1) throw new TRPCError({ code: "CONFLICT", message: "Hotel admin changed; reload and try again." });
  return assignmentWithHotel(db, { ...target, role: "hotel_owner" });
}
