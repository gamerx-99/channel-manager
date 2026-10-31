import { inviteStaffUser } from "./invites";
import { deleteHotelUserAssignment, transferHotelAdmin, updateHotelUserAssignmentRole, createHotelUserAssignment } from "./staff";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { requireHotelPermission } from "../routerUtils";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { d1Schema, bookings, hotelUsers, hotels, otaConnections, notifications, supportAccessGrants, supportAccessLog } from "../../drizzle/d1-schema";
import { authorizeHotelAction, updateHotelStaffPermissions, listPlatformHotelSummaries, type D1ScopedDatabase } from "../db/scope";
import { grantSupportAccess, revokeSupportAccess, listSupportAccess, getSupportMemberships, logSupportProcedure } from "./supportAccess";
import { listManagedHotels, getManagedHotel } from "./hotel";
import { listHotelStaff } from "./staff";
import { getOtaSummary } from "./ota";
import { listAllNotifications, markSystemNotificationsRead, markAllNotificationsRead } from "./notification";
import { resolveMembershipPermissions, applyToggle, getToggleStates } from "@shared/permissions";
import { createContextFromRequest } from "../_core/context";
const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) for (const statement of readFileSync(resolve(migrationFolder, file), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query); statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    const row = method === "get" ? statement.get(...params) : statement.all(...params);
    return { rows: row ? (Array.isArray(row) ? row : [row]) : [] };
  }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
  db.$client = { prepare: query => ({ bind: (...params) => ({ query, params }) }), batch: async statements => {
    sqlite.exec("BEGIN"); try {
      const results = statements.map(statement => { const { query, params } = statement as { query: string; params: unknown[] }; const result = sqlite.prepare(query).run(...params); return { meta: { changes: Number(result.changes) } }; });
      sqlite.exec("COMMIT"); return results;
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } };
});
afterEach(() => sqlite.close());

const now = new Date("2026-10-30T12:00:00Z");
const owner = { userId: "owner" };
const support = { userId: "support", roles: ["support" as const] };
async function seed() {
  await db.insert(hotels).values([
    { id: "a", name: "A", slug: "a", address: "A", ownerContact: "owner-a" },
    { id: "b", name: "B", slug: "b", address: "B", ownerContact: "owner-b" },
  ]);
  await db.insert(hotelUsers).values([
    { hotelId: "a", userId: "owner", role: "hotel_owner" },
    { hotelId: "b", userId: "owner-b", role: "hotel_owner" },
    { hotelId: "a", userId: "support", role: "support" },
    { hotelId: "a", userId: "root", role: "super_admin" },
    { hotelId: "a", userId: "staff", role: "front_desk" },
    { hotelId: "a", userId: "manager", role: "revenue_manager", permissionGrants: ["property.manage_staff"] },
  ]);
}
async function key(mode: "view" | "edit" = "view", durationHours = 1, time = now) {
  return grantSupportAccess(db, owner, { hotelId: "a", supportUserId: "support", durationHours, mode }, time);
}

describe("D1 support access security", () => {
  beforeEach(seed);
  it("support sees no hotel, including its anchor hotel, without an owner key; denial is logged", async () => {
    await expect(listManagedHotels(db, support)).resolves.toEqual([]);
    await expect(getManagedHotel(db, support, "a", now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.select().from(supportAccessLog)).toMatchObject([{ supportUserId: "support", grantId: null, action: "denied:hotel.read" }]);
  });
  it.each([1, 24, 72, 168])("persists exactly %i hours from owner approval", async hours => {
    const grant = await key("view", hours);
    expect(grant.grantedBy).toBe("owner");
    expect(grant.expiresAt.getTime() - grant.createdAt.getTime()).toBe(hours * 3600000);
    await expect(authorizeHotelAction(db, support, "a", "property.view", "hotel.read", now)).resolves.toMatchObject({ role: "support" });
  });
  it.each([0, 2, 23, 25, 169, 1.5])("refuses unsupported duration %s without storing a key", async hours => {
    await expect(key("view", hours)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await db.select().from(supportAccessGrants)).toHaveLength(0);
  });
  it("view mode allows reads, denies writes and staff management, and logs all attempts", async () => {
    const grant = await key();
    await expect(getManagedHotel(db, support, "a", now)).resolves.toMatchObject({ id: "a" });
    await expect(authorizeHotelAction(db, support, "a", "operations.manage_bookings", "bookings.create", now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listHotelStaff(db, support, "a", [], now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(markAllNotificationsRead(db, support, "a", now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const logs = await db.select().from(supportAccessLog);
    expect(logs).toHaveLength(4);
    expect(logs.every(row => row.grantId === grant.id && row.supportUserId === "support")).toBe(true);
    expect(logs.map(row => row.action)).toEqual(["hotel.read", "denied:bookings.create", "denied:staff.list", "denied:notifications.mark_all_read"]);
  });
  it("edit mode permits edits but never manages staff or support keys", async () => {
    await key("edit");
    await expect(authorizeHotelAction(db, support, "a", "operations.manage_bookings", "bookings.create", now)).resolves.toMatchObject({ role: "support" });
    await expect(updateHotelStaffPermissions(db, support, "a", "staff", ["property.view"], now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(grantSupportAccess(db, support, { hotelId: "a", supportUserId: "support", mode: "edit", durationHours: 168 }, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("denies at exact expiry and after revocation, retaining audit visibility for the owner", async () => {
    const grant = await key();
    await expect(getManagedHotel(db, support, "a", grant.expiresAt)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await revokeSupportAccess(db, owner, "a", grant.id, new Date(now.getTime() + 1000));
    await expect(getManagedHotel(db, support, "a", new Date(now.getTime() + 2000))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const audit = await listSupportAccess(db, owner, "a", now);
    expect(audit.grants[0].revokedAt).toEqual(new Date(now.getTime() + 1000));
    expect(audit.log).toHaveLength(2);
    expect(audit.log.every(row => row.action.startsWith("denied:") && row.grantId === grant.id)).toBe(true);
  });
  it("a key for hotel A gives no access to hotel B, and cross-hotel revoke/audit is denied", async () => {
    const grant = await key("edit");
    await expect(getManagedHotel(db, support, "b", now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listSupportAccess(db, owner, "b", now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(revokeSupportAccess(db, { userId: "owner-b" }, "b", grant.id, now)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await db.select().from(supportAccessGrants))[0].revokedAt).toBeNull();
    expect((await db.select().from(supportAccessLog))[0]).toMatchObject({ hotelId: "b", grantId: null, action: "denied:hotel.read" });
  });
  it("only the owner grants/revokes/reads history; delegated staff management is insufficient", async () => {
    const grant = await key();
    for (const caller of [{ userId: "manager" }, { userId: "staff" }, support, { userId: "root", roles: ["super_admin" as const] }]) {
      await expect(grantSupportAccess(db, caller, { hotelId: "a", supportUserId: "support", mode: "edit", durationHours: 1 }, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(revokeSupportAccess(db, caller, "a", grant.id, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(listSupportAccess(db, caller, "a", now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(grantSupportAccess(db, owner, { hotelId: "a", supportUserId: "staff", mode: "view", durationHours: 1 }, now)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("super admin has no hotel data path even with an owner membership and support grant", async () => {
    await db.update(hotelUsers).set({ userId: "root" }).where(eq(hotelUsers.userId, "owner-b"));
    await db.insert(supportAccessGrants).values({ hotelId: "a", supportUserId: "root", grantedBy: "owner", createdAt: now, expiresAt: new Date(now.getTime()+3600000), mode: "edit" });
    for (const hotelId of ["a", "b"]) await expect(getManagedHotel(db, { userId: "root" }, hotelId, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getSupportMemberships(db, { userId: "root" }, now)).resolves.toEqual([]);
    await expect(listPlatformHotelSummaries(db, { userId: "root" })).resolves.toEqual([
      { hotelName: "A", plan: null, paymentStatus: null, roomCount: 0, syncStatus: "not_configured" },
      { hotelName: "B", plan: null, paymentStatus: null, roomCount: 0, syncStatus: "not_configured" },
    ]);
    await expect(listPlatformHotelSummaries(db, owner)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listPlatformHotelSummaries(db, { userId: "root", access: "public" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("intersects overlapping keys and refreshes support membership after expiry and revocation", async () => {
    const edit = await key("edit", 24);
    const view = await key("view", 1);
    const memberships = await getSupportMemberships(db, support, now);
    expect(memberships).toMatchObject([{ hotelId: "a", mode: "view", expiresAt: view.expiresAt }]);
    expect(memberships[0].permissions).not.toContain("operations.manage_bookings");
    await expect(authorizeHotelAction(db, support, "a", "operations.manage_bookings", "edit", now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await revokeSupportAccess(db, owner, "a", edit.id, now);
    await expect(getSupportMemberships(db, support, view.expiresAt)).resolves.toEqual([]);
  });
  it("support identity cannot bypass a grant via a second ordinary membership", async () => {
    await db.update(hotelUsers).set({ userId: "support" }).where(eq(hotelUsers.userId, "owner-b"));
    await expect(getManagedHotel(db, support, "b", now)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("the session context exposes only active hotel-scoped support permissions", async () => {
    const time = new Date();
    await key("view", 1, time);
    const auth = { api: { getSession: async () => ({ user: { id: "support", email: "support@test" }, session: { token: "session" } }) } };
    const context = await createContextFromRequest({ headers: { cookie: "session=test" }, db, auth: auth as any });
    expect(context.user?.memberships).toMatchObject([{ hotelId: "a", role: "support", mode: "view" }]);
    expect(context.user?.memberships?.[0].permissions).not.toContain("property.manage_staff");
    await revokeSupportAccess(db, owner, "a", (await db.select().from(supportAccessGrants))[0].id, time);
    const refreshed = await createContextFromRequest({ headers: { cookie: "session=test" }, db, auth: auth as any });
    expect(refreshed.user?.memberships).toEqual([]);
  });
  it("logs procedure-level denials and resource ids without storing guest request bodies", async () => {
    await logSupportProcedure(db, support, "channelManager.createBooking", { hotel_id: "a", room_id: "room-x", passportNo: "SECRET" }, true);
    const [row] = await db.select().from(supportAccessLog);
    expect(row.action).toContain("denied:channelManager.createBooking");
    expect(row.action).toContain("room-x");
    expect(row.action).not.toContain("SECRET");
  });
});

describe("D1 staff permission toggles", () => {
  beforeEach(seed);
  it("persists owner toggles and immediately enforces grants/revokes only in that hotel", async () => {
    const desired = applyToggle(resolveMembershipPermissions("front_desk"), "bookings_manage", false);
    await updateHotelStaffPermissions(db, owner, "a", "staff", desired, now);
    const [row] = await db.select().from(hotelUsers).where(eq(hotelUsers.userId, "staff"));
    expect(getToggleStates(resolveMembershipPermissions("front_desk", { grants: row.permissionGrants, revokes: row.permissionRevokes })).bookings_manage).toBe(false);
    await expect(authorizeHotelAction(db, { userId: "staff" }, "a", "operations.manage_bookings", "write", now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateHotelStaffPermissions(db, owner, "b", "staff", desired, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateHotelStaffPermissions(db, owner, "a", "owner-b", desired, now)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await updateHotelStaffPermissions(db, owner, "a", "staff", applyToggle(desired, "bookings_manage", true), now);
    await expect(authorizeHotelAction(db, { userId: "staff" }, "a", "operations.manage_bookings", "write", now)).resolves.toBeDefined();
  });
  it("rejects owner/self/platform edits, unknown permissions and non-owner elevation", async () => {
    for (const target of ["owner", "root", "support"]) await expect(updateHotelStaffPermissions(db, owner, "a", target, ["property.view"], now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateHotelStaffPermissions(db, { userId: "manager" }, "a", "manager", ["property.view"], now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateHotelStaffPermissions(db, owner, "a", "staff", ["invented" as any], now)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(updateHotelStaffPermissions(db, { userId: "manager" }, "a", "staff", ["property.view", "property.manage_staff"], now)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});


describe("aggregate hotel data bypass regressions", () => {
  beforeEach(seed);
  it("OTA summary with no key exposes neither the support anchor nor any hotel to super admin", async () => {
    await db.insert(otaConnections).values([{ hotelId: "a", provider: "A", status: "active" }, { hotelId: "b", provider: "B", status: "active" }]);
    await expect(getOtaSummary(db, support)).resolves.toEqual([]);
    await expect(getOtaSummary(db, { userId: "root", roles: ["super_admin"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("a support OTA summary uses only active grants and logs the reads", async () => {
    await db.insert(otaConnections).values([{ hotelId: "a", provider: "A", status: "active" }, { hotelId: "b", provider: "B", status: "active" }]);
    const grant = await key("view", 1, new Date());
    const summary = await getOtaSummary(db, support);
    expect(summary).toHaveLength(1);
    expect(summary[0].hotel_id).toBe("a");
    expect(await db.select().from(supportAccessLog)).not.toHaveLength(0);
    await revokeSupportAccess(db, owner, "a", grant.id);
    await expect(getOtaSummary(db, support)).resolves.toEqual([]);
  });
  it("super admin cannot read or modify hotel notification contents globally", async () => {
    await db.insert(notifications).values({ hotelId: "a", type: "booking", message: "Guest private detail" });
    await expect(listAllNotifications(db, { userId: "root" })).resolves.toEqual([]);
    await expect(markSystemNotificationsRead(db, { userId: "root" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.select().from(notifications))[0].isRead).toBe(false);
  });
});


describe("aggregate and middleware enforcement", () => {
  beforeEach(seed);
  it("a revoked bookings_view permission removes bookings from the hotels/dashboard projection", async () => {
    await db.insert(bookings).values({ hotelId: "a", guestName: "Hidden Guest", checkIn: "2026-11-01", checkOut: "2026-11-02", price: "100.00", status: "confirmed", source: "manual" });
    expect((await listManagedHotels(db, { userId: "staff" }))[0].bookings).toHaveLength(1);
    const permissions = applyToggle(resolveMembershipPermissions("front_desk"), "bookings_view", false);
    await updateHotelStaffPermissions(db, owner, "a", "staff", permissions);
    expect((await listManagedHotels(db, { userId: "staff" }))[0].bookings).toEqual([]);
  });
  it("a real protected procedure audits a permission denial before the repository runs", async () => {
    const grant = await key("view", 1, new Date());
    let repositoryCalled = false;
    const testRouter = router({ write: protectedProcedure.input(z.object({ hotel_id: z.string(), booking_id: z.string() })).mutation(({ ctx, input }) => {
      requireHotelPermission(ctx.user, input.hotel_id, "operations.manage_bookings");
      repositoryCalled = true;
      return true;
    }) });
    const app = testRouter.createCaller({ db, caller: support, clientIp: "test", user: { id: "support", role: "support", roles: ["support"], memberships: await getSupportMemberships(db, support), email: null, name: null, appMetadata: {}, userMetadata: {}, accessToken: "test" } });
    await expect(app.write({ hotel_id: "a", booking_id: "booking-123" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repositoryCalled).toBe(false);
    expect(await db.select().from(supportAccessLog)).toMatchObject([{ hotelId: "a", supportUserId: "support", grantId: grant.id, action: 'denied:write:{"hotel_id":"a"}' }]);
  });
  it("support reads fail closed when audit persistence fails", async () => {
    await key("view", 1, new Date());
    sqlite.exec("create trigger reject_support_audit before insert on support_access_log begin select raise(abort, 'audit unavailable'); end");
    await expect(listManagedHotels(db, support)).rejects.toThrow(/Failed query/);
  });
});


describe("string-input procedure auditing", () => {
  beforeEach(seed);
  it("real bookings and TM30 procedures audit pre-repository support denials", async () => {
    const hotelId = "11111111-1111-4111-8111-111111111111";
    await db.insert(hotels).values({ id: hotelId, name: "C", slug: "c", address: "C", ownerContact: "C" });
    await db.insert(hotelUsers).values({ hotelId, userId: "owner", role: "hotel_owner" });
    const { appRouter } = await import("../routers");
    const user = { id: "support", role: "support" as const, roles: ["support" as const], memberships: [] as Awaited<ReturnType<typeof getSupportMemberships>>, email: null, name: null, appMetadata: {}, userMetadata: {}, accessToken: "test" };
    const app = appRouter.createCaller({ db, user, caller: support, clientIp: "test" });
    await expect(app.channelManager.bookings(hotelId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const grant = await grantSupportAccess(db, owner, { hotelId, supportUserId: "support", durationHours: 1, mode: "view" });
    user.memberships = await getSupportMemberships(db, support);
    await expect(app.channelManager.exportTm30(hotelId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.select().from(supportAccessLog)).toMatchObject([
      { hotelId, supportUserId: "support", grantId: null, action: "denied:channelManager.bookings:{}" },
      { hotelId, supportUserId: "support", grantId: grant.id, action: "denied:channelManager.exportTm30:{}" },
    ]);
  });
});


describe("delegated staff-management escape prevention", () => {
  beforeEach(seed);
  it("a delegated manager cannot transfer ownership to themselves or someone else", async () => {
    const [manager] = await db.select().from(hotelUsers).where(eq(hotelUsers.userId, "manager"));
    const [staff] = await db.select().from(hotelUsers).where(eq(hotelUsers.userId, "staff"));
    for (const target of [manager, staff]) await expect(transferHotelAdmin(db, { userId: "manager" }, { hotel_id: "a", target_membership_id: target.id }, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.select().from(hotelUsers).where(eq(hotelUsers.userId, "owner")))[0].role).toBe("hotel_owner");
  });
  it("role-template changes cannot restore revoked capabilities or change an outranking colleague", async () => {
    const revokes = ["operations.manage_bookings", "operations.manage_guests", "operations.manage_checkin_checkout"];
    await db.update(hotelUsers).set({ role: "front_desk", permissionGrants: ["property.manage_staff"], permissionRevokes: revokes }).where(eq(hotelUsers.userId, "manager"));
    await db.update(hotelUsers).set({ permissionRevokes: revokes }).where(eq(hotelUsers.userId, "staff"));
    const [staff] = await db.select().from(hotelUsers).where(eq(hotelUsers.userId, "staff"));
    await expect(updateHotelUserAssignmentRole(db, { userId: "manager" }, { hotel_id: "a", membership_id: staff.id, role: "front_desk" }, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateHotelUserAssignmentRole(db, { userId: "manager" }, { hotel_id: "a", membership_id: staff.id, role: "hotel_owner" }, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.select().from(hotelUsers).where(eq(hotelUsers.id, staff.id)))[0].permissionRevokes).toEqual(revokes);
    await expect(updateHotelUserAssignmentRole(db, owner, { hotel_id: "a", membership_id: staff.id, role: "front_desk" }, now)).resolves.toMatchObject({ role: "front_desk" });
  });
  it("invites/assignments cannot grant role templates beyond a delegated manager's own permissions", async () => {
    await db.update(hotelUsers).set({ role: "front_desk" }).where(eq(hotelUsers.userId, "manager"));
    const emailSender = { sendInviteEmail: async () => { throw new Error("must not send"); } };
    await expect(inviteStaffUser(db, { userId: "manager" }, emailSender as any, { hotel_id: "a", role: "revenue_manager", email: "new@test.example" }, undefined, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createHotelUserAssignment(db, { userId: "manager" }, { hotel_id: "a", role: "revenue_manager", user_id: "new-user" }, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.select().from(hotelUsers).where(eq(hotelUsers.userId, "new-user"))).toHaveLength(0);
  });
});

describe("revoked support payment mutation", () => {
  beforeEach(seed);
  it("manualVerify revalidates a stale edit projection before changing booking status", async () => {
    const hotelId = "11111111-1111-4111-8111-111111111111";
    const bookingId = "22222222-2222-4222-8222-222222222222";
    await db.insert(hotels).values({ id: hotelId, name: "C", slug: "c", address: "C", ownerContact: "C" });
    await db.insert(hotelUsers).values({ hotelId, userId: "owner", role: "hotel_owner" });
    await db.insert(bookings).values({ id: bookingId, hotelId, guestName: "Guest", checkIn: "2026-11-01", checkOut: "2026-11-02", price: "100.00", status: "pending_verification", source: "manual" });
    const grant = await grantSupportAccess(db, owner, { hotelId, supportUserId: "support", durationHours: 1, mode: "edit" });
    const staleMemberships = await getSupportMemberships(db, support);
    await revokeSupportAccess(db, owner, hotelId, grant.id);
    const { appRouter } = await import("../routers");
    const app = appRouter.createCaller({ db, caller: support, clientIp: "test", user: { id: "support", role: "support", roles: ["support"], memberships: staleMemberships, email: null, name: null, appMetadata: {}, userMetadata: {}, accessToken: "test" } });
    await expect(app.payment.manualVerify({ hotel_id: hotelId, booking_id: bookingId, approved: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.select().from(bookings).where(eq(bookings.id, bookingId)))[0]).toMatchObject({ status: "pending_verification", paymentStatus: "unpaid" });
  });
});


describe("reserved owner controls and staff removals", () => {
  beforeEach(seed);
  it("a delegated staff manager cannot remove an outranking colleague", async () => {
    await db.update(hotelUsers).set({ role: "front_desk" }).where(eq(hotelUsers.userId, "manager"));
    const [colleague] = await db.insert(hotelUsers).values({ hotelId: "a", userId: "colleague", role: "revenue_manager" }).returning();
    await expect(deleteHotelUserAssignment(db, { userId: "manager" }, colleague.id, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.select().from(hotelUsers).where(eq(hotelUsers.id, colleague.id))).toHaveLength(1);
    await expect(deleteHotelUserAssignment(db, owner, colleague.id, now)).resolves.toEqual({ id: colleague.id });
  });
  it("reserved owner controls cannot be delegated even through stored grant overrides", async () => {
    await db.update(hotelUsers).set({ permissionGrants: ["property.manage_support_access", "property.transfer_ownership"] }).where(eq(hotelUsers.userId, "staff"));
    for (const permission of ["property.manage_support_access", "property.transfer_ownership"] as const) await expect(authorizeHotelAction(db, { userId: "staff" }, "a", permission, "reserved", now)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});


describe("audit canonical request fields", () => {
  beforeEach(seed);
  it("ignores forged hotel aliases and resource extras on a real snake_case endpoint", async () => {
    const hotelId = "11111111-1111-4111-8111-111111111111";
    const otherHotel = "22222222-2222-4222-8222-222222222222";
    const bookingId = "33333333-3333-4333-8333-333333333333";
    await db.insert(hotels).values([
      { id: hotelId, name: "C", slug: "c", address: "C", ownerContact: "C" },
      { id: otherHotel, name: "D", slug: "d", address: "D", ownerContact: "D" },
    ]);
    const { appRouter } = await import("../routers");
    const app = appRouter.createCaller({ db, caller: support, clientIp: "test", user: { id: "support", role: "support", roles: ["support"], memberships: [], email: null, name: null, appMetadata: {}, userMetadata: {}, accessToken: "test" } });
    await expect(app.payment.manualVerify({ hotel_id: hotelId, booking_id: bookingId, approved: true, hotelId: otherHotel, room_id: "forged-room" } as any)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.select().from(supportAccessLog)).toMatchObject([{ hotelId, action: `denied:payment.manualVerify:{"hotel_id":"${hotelId}","booking_id":"${bookingId}"}` }]);
  });
  it("camelCase endpoints ignore a forged snake_case hotel alias", async () => {
    await logSupportProcedure(db, support, "access.grantSupport", { hotelId: "a", hotel_id: "b", supportEmail: "support@example.test", booking_id: "forged" }, true);
    expect(await db.select().from(supportAccessLog)).toMatchObject([{ hotelId: "a", action: 'denied:access.grantSupport:{"hotelId":"a","supportEmail":"support@example.test"}' }]);
  });
});
