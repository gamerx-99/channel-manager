import { and, eq } from "drizzle-orm";
import { hotelUsers } from "../../drizzle/d1-schema";
import type { LegacyTemplateUser } from "../db/types";
import type { D1CallerContext, D1ScopedDatabase } from "../db/scope";
import { isActivePlatformAdmin } from "./platformAdmins";

/** Legacy template OAuth user lookups remain empty; Better Auth owns identity after 13-05. */
export async function getUserByOpenId(_db: D1ScopedDatabase, _caller: D1CallerContext, _openId: string): Promise<LegacyTemplateUser | undefined> {
  return undefined;
}

/** Compatibility no-op for the removed template MySQL user store. */
export async function upsertUser(_db: D1ScopedDatabase, _caller: D1CallerContext, _user: Partial<LegacyTemplateUser> & { openId: string }): Promise<void> {
  return;
}

export async function isSuperAdmin(db: D1ScopedDatabase, caller: D1CallerContext): Promise<boolean> {
  if (!caller.userId) return false;
  const [membership] = await db.select({ id: hotelUsers.id }).from(hotelUsers).where(and(
    eq(hotelUsers.userId, caller.userId), eq(hotelUsers.role, "super_admin"),
  )).limit(1);
  return !!membership || isActivePlatformAdmin(db, caller.userId);
}
