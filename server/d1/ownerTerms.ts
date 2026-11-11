import { and, eq, isNull } from "drizzle-orm";
import { user as authUser } from "../../drizzle/auth-schema";
import type { D1ScopedDatabase } from "../db/scope";

/** When this account accepted the platform terms, or null. Only ever read or written for the signed-in account itself. */
export async function getTermsAcceptedAt(db: D1ScopedDatabase, userId: string): Promise<Date | null> {
  const [row] = await db.select({ termsAcceptedAt: authUser.termsAcceptedAt }).from(authUser).where(eq(authUser.id, userId)).limit(1);
  return row?.termsAcceptedAt ?? null;
}

/** Records acceptance once; accepting again keeps the first time, so the record shows when the owner really agreed. */
export async function acceptOwnerTerms(db: D1ScopedDatabase, userId: string, now = new Date()): Promise<Date> {
  await db.update(authUser).set({ termsAcceptedAt: now }).where(and(eq(authUser.id, userId), isNull(authUser.termsAcceptedAt)));
  return (await getTermsAcceptedAt(db, userId)) ?? now;
}
