import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { platformAdmins } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";

export async function isActivePlatformAdmin(db: D1ScopedDatabase, userId: string) {
  const rows = await db.select({ id: platformAdmins.id }).from(platformAdmins).where(and(
    eq(platformAdmins.userId, userId), isNotNull(platformAdmins.acceptedAt), isNull(platformAdmins.disabledAt),
  )).limit(1);
  return rows.length > 0;
}
